import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Application, AppStatus, DraftMail, HotReply, Job, LiveSearchState, OutreachMail, Profile, ProfileDossier, Reply, ResumeRecord, Route } from './types';
import { applyColorway, DEFAULT_COLORWAY } from './theme/palettes';
import { monoStack, sansStack } from './theme/typography';
import { DemoApplicationService, DemoOutreachService, DemoProfileEnrichmentService, DemoResumeService, nextId } from './services/demo';
import { loadLegacy, loadStored, saveStored } from './lib/storage';
import { validJobs } from './lib/validate';
import { setSentryUser, hashUserId } from './lib/sentry';
import { currentRequestId, logger } from './lib/logger';
import { backendOn, fetchUsage, apiFetch, toUserMessage, type Usage } from './services/api';
import { authSignOut } from './lib/authClient';
import { initialsFor, mergeServerProfile, profilePatch } from './lib/profileSync';
import { prepareAvatar, blobToDataUrl } from './lib/imageScale';
import { HttpApplicationService, HttpAvatarService, HttpJobService, HttpOutreachService, HttpProfileEnrichmentService, HttpResumeService } from './services/http';
import { dossierIsActive } from './lib/profileDossier';

/* Backend wiring (04-04): stateless HTTP services behind the same
 * DemoXService interfaces. useBackend is read once — demo checkouts never
 * import a fetch path. Job rows hydrate via httpJobs.refresh(). */
const httpApp = new HttpApplicationService();
const httpOut = new HttpOutreachService();
const httpJobs = new HttpJobService();
const httpResume = new HttpResumeService();
const httpEnrich = new HttpProfileEnrichmentService();
const httpAvatar = new HttpAvatarService();
const useBackend = backendOn();

const KEYS = {
  authed: 'jw2_authed', onboarded: 'jw2_onboarded', dark: 'jw2_dark',
  // jw3: the jw2 profile key could still hold the old demo seed on this
  // device. A fresh key means no cached identity can resurface (T6); server
  // hydration fills the real profile after login.
  profile: 'jw3_profile', jobs: 'jw4_jobs', apps: 'jw3_apps', sent: 'jw3_sent',
  colorway: 'jw2_colorway', scanned: 'jw2_scanned',
} as const;

const today = () => new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
export const todayStr = today;
const clock = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' UTC';

interface Store {
  route: Route; authed: boolean; onboarded: boolean; dark: boolean;
  profile: Profile; jobs: Job[]; apps: Application[];
  sent: OutreachMail[]; replies: Reply[]; notif: number; scanning: boolean;
  scannedAt: number | null; usage: Usage | null;
  backend: boolean; restoring: boolean;
  sidebarOpen: boolean; setSidebarOpen: (v: boolean) => void;
  /** AuthBridge items — Clerk session sync + sign-out handoff. */
  setRestoring: (v: boolean) => void;
  setSignOutAction: (fn: (() => Promise<void>) | null) => void;
  hotReply: HotReply | null; dismissHotReply: () => void;
  search: string; selected: Job | null; colorway: string;
  go: (r: Route) => void; login: (email: string, opts?: { silent?: boolean }) => Promise<void>; signup: (name: string, email: string) => void; logout: () => void;
  onboard: (p: Partial<Profile>) => void; update: (p: Partial<Profile>) => void;
  toggleDark: () => void; setColorway: (c: string) => void; setSearch: (s: string) => void; select: (j: Job | null) => void;
  save: (id: string) => Promise<void>; apply: (id: string) => Promise<string>;
  advanceApp: (id: string) => Promise<AppStatus | null>; withdrawApp: (id: string) => Promise<void>;
  archiveApp: (id: string, archived: boolean) => Promise<void>;
  scan: () => void; send: (m: DraftMail) => Promise<string>; clearSent: () => void; clearApps: () => void;
  clearNotif: () => void;
  resume: ResumeRecord | null; uploadResume: (file: File) => Promise<string>;
  enrichment: ProfileDossier | null; enrichBusy: boolean;
  startEnrichment: () => Promise<string>; refreshEnrichment: () => Promise<void>;
  pasteEnrichmentSource: (sourceId: string, text: string) => Promise<string>;
  setAvatarPhoto: (file: File) => Promise<string>;
  liveSearch: LiveSearchState; runLiveSearch: (query: string, country: string) => Promise<void>;
  cancelLiveSearch: () => Promise<void>;
}
const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

/** Versioned load: new `jw4:` namespace first, legacy unversioned key as fallback. */
function load<T>(k: string, fb: T): T {
  const fresh = loadStored<T>(k, undefined as unknown as T);
  if (fresh !== undefined) return fresh;
  return loadLegacy<T>(k, fb);
}
function persist(k: string, v: unknown) { saveStored(k, v); }

const VALID: Route[] = ['dashboard', 'search', 'jobs', 'applications', 'settings', 'login', 'signup', 'onboarding', 'notfound'];

/** Account-scoped starting profile: used on first boot and again on logout,
 *  so one account's cached footprint never bleeds into the next login.
 *  Neutral by design — no demo identity, stats or signature is ever invented.
 *  Onboarding fills the real values; server hydration restores them. */
export const DEFAULT_PROFILE: Profile = {
  name: '', initials: '', status: 'ACTIVE',
  skills: '', roles: [], location: '',
  salary: '', remote: false, resume: '', summary: '', city: '', country: '',
  avatarUrl: '',
  signature: '',
  email: '',
};
const routeFromPath = (): Route => {
  const seg = location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
  // Root greets signed-in users with the dashboard (login handles the rest
  // in App). The search hero stays one click away via nav + search actions.
  if (!seg) return 'dashboard';
  return (VALID as string[]).includes(seg) ? seg as Route : 'notfound';
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<Route>(routeFromPath);
  const [authed, setAuthed] = useState(() => load(KEYS.authed, false));
  // True while the boot session probe may still flip `authed`; the view
  // holds the route instead of bouncing to /login mid-restore (OAuth return).
  const [restoring, setRestoring] = useState(useBackend && !authed);
  const [onboarded, setOnboarded] = useState(() => load(KEYS.onboarded, false));
  const [dark, setDark] = useState(() => load(KEYS.dark, false));
  const [profile, setProfile] = useState<Profile>(() => {
    // Fresh key (jw3): never read the legacy demo-bearing profile. Only an
    // object with a string email is trusted; everything else starts neutral.
    const raw = loadStored<unknown>(KEYS.profile, null);
    const cached = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Partial<Profile>
      : {};
    return {
      ...DEFAULT_PROFILE,
      ...cached,
      email: typeof cached.email === 'string' ? cached.email : '',
    };
  });
  const [jobs, setJobs] = useState<Job[]>(() => {
    // Live source only: persisted cache or empty. Seed bundles are gone —
    // backend hydrate fills this on login (W1); no reseed, ever.
    return validJobs(load<Job[]>(KEYS.jobs, []));
  });
  const [apps, setApps] = useState<Application[]>(() => load(KEYS.apps, [] as Application[]));
  const [sent, setSent] = useState<OutreachMail[]>(() => load(KEYS.sent, [] as OutreachMail[]));
  const [replies, setReplies] = useState<Reply[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [notif, setNotif] = useState(0);
  const [hotReply, setHotReply] = useState<HotReply | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedAt, setScannedAt] = useState<number | null>(() => load(KEYS.scanned, null));
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Job | null>(null);
  const [colorway, setColorway] = useState(() => load(KEYS.colorway, DEFAULT_COLORWAY));
  // Mobile drawer (opened from the topbar burger).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Backend scrape-run progress (session-only: never persisted).
  const [liveSearch, setLiveSearch] = useState<LiveSearchState>({ state: 'idle', message: '' });
  // Active backend search id for Cancel (ref: only read in click handlers).
  const liveSearchId = useRef<string | null>(null);
  // Active resume row (server pipeline state) — session-only, re-fetched on login.
  const [resume, setResume] = useState<ResumeRecord | null>(null);
  // Profile enrichment run (public links → AI dossier) — session-only.
  const [enrichment, setEnrichment] = useState<ProfileDossier | null>(null);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const enrichPolling = useRef(false);
  // Bumped when the active account/resume changes so an in-flight poll can
  // never repopulate the previous account's dossier after logout.
  const enrichPollToken = useRef(0);

  useEffect(() => {
    const fn = () => setRoute(routeFromPath());
    window.addEventListener('popstate', fn);
    return () => window.removeEventListener('popstate', fn);
  }, []);
  useEffect(() => {
    persist(KEYS.authed, authed); persist(KEYS.onboarded, onboarded); persist(KEYS.dark, dark);
    persist(KEYS.profile, profile); persist(KEYS.jobs, jobs); persist(KEYS.apps, apps); persist(KEYS.sent, sent);
    persist(KEYS.colorway, colorway); persist(KEYS.scanned, scannedAt);
  }, [authed, onboarded, dark, profile, jobs, apps, sent, colorway, scannedAt]);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--font-sans', sansStack());
    root.setProperty('--font-mono', monoStack());
    applyColorway(colorway, dark);
  }, [colorway, dark]);
  // Palette overlay is gone (search icon navigates to the hero page);
  // no global keyboard shortcut remains.
  /** Pull the server profile row into local state. Returns the server's
   *  onboardingCompleted — true/false from the row, null in demo mode or
   *  when the server is unreachable — so callers can route on server truth.
   *  Best-effort: failures keep local state and only log. */
  const syncProfile = async (): Promise<boolean | null> => {
    if (!useBackend) return null;
    const token = enrichPollToken.current;
    try {
      const server = await apiFetch<unknown>('/profiles/me');
      if (token !== enrichPollToken.current) return null; // account changed mid-read
      const fromServer = mergeServerProfile(server);
      setProfile(prev => {
        const merged = { ...prev, ...fromServer };
        if (fromServer.name !== undefined) merged.initials = initialsFor(merged.name, prev.initials);
        return merged;
      });
      const rec = server as { onboardingCompleted?: unknown };
      if (rec.onboardingCompleted === true) setOnboarded(true);
      if (rec.onboardingCompleted === true) return true;
      if (rec.onboardingCompleted === false) return false;
      return null;
    } catch {
      logger.warn('hydrate-profile', 'Server profile unreachable — showing local.', {});
      return null;
    }
  };

  /** Poll the enrichment dossier to a terminal state, then re-pull the
   *  profile so AI-merged fields land across the app. Bounded and
   *  single-flight; a reload can restart it from the active server row. */
  const pollEnrichment = async (): Promise<void> => {
    if (!useBackend || enrichPolling.current) return;
    enrichPolling.current = true;
    const token = enrichPollToken.current;
    // The AI action can wait up to 20 × 30s for provider capacity, so keep
    // polling past the usual ~1 minute rather than stranding a live row.
    const deadline = Date.now() + 12 * 60_000;
    try {
      for (;;) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 1500);
        });
        if (token !== enrichPollToken.current) return;
        let next: ProfileDossier | null = null;
        try {
          next = await httpEnrich.latest();
        } catch {
          return; // transient transport failure — the last state stays
        }
        if (token !== enrichPollToken.current) return;
        if (next === null) {
          // Another tab/resume replacement removed the active run.
          setEnrichment(null);
          return;
        }
        setEnrichment(next);
        if (next.status === 'ready') {
          void syncProfile();
          setNotif((n) => n + 1);
          return;
        }
        if (next.status === 'failed') {
          setNotif((n) => n + 1);
          return;
        }
        if (Date.now() > deadline) return;
      }
    } finally {
      // A newer account/resume may already own the polling flag.
      if (token === enrichPollToken.current) enrichPolling.current = false;
    }
  };

  /** Re-read the latest dossier (used on mount and after login). */
  const refreshEnrichment = async (): Promise<void> => {
    if (!useBackend) return;
    const token = enrichPollToken.current;
    try {
      const row = await httpEnrich.latest();
      if (token !== enrichPollToken.current) return; // account/resume changed
      setEnrichment(row);
      if (row !== null && dossierIsActive(row.status)) void pollEnrichment();
    } catch {
      logger.warn('hydrate-enrichment', 'Enrichment status unreachable — showing none.', {});
    }
  };

  /** Explicit user action. Returns honest copy in both modes; demo never
   *  pretends a public profile was fetched. */
  const startEnrichment = async (): Promise<string> => {
    if (!useBackend) {
      return (await DemoProfileEnrichmentService.start()).message;
    }
    if (resume === null || resume.extractionStatus !== 'completed') {
      return 'Upload your resume and wait for AI reading to finish first.';
    }
    const token = enrichPollToken.current;
    setEnrichBusy(true);
    try {
      const { dossier, message } = await httpEnrich.start();
      if (token !== enrichPollToken.current) return message;
      if (dossier !== null) {
        setEnrichment(dossier);
        if (dossierIsActive(dossier.status)) void pollEnrichment();
      } else {
        void refreshEnrichment();
      }
      return message;
    } finally {
      setEnrichBusy(false);
    }
  };

  /** Attach manually pasted text to one blocked source, then re-run AI. */
  const pasteEnrichmentSource = async (sourceId: string, text: string): Promise<string> => {
    if (!useBackend) {
      return (await DemoProfileEnrichmentService.paste(sourceId, text)).message;
    }
    const token = enrichPollToken.current;
    setEnrichBusy(true);
    try {
      const { dossier, message } = await httpEnrich.paste(sourceId, text);
      if (token !== enrichPollToken.current) return message;
      if (dossier !== null) {
        setEnrichment(dossier);
        if (dossierIsActive(dossier.status)) void pollEnrichment();
      } else {
        void refreshEnrichment();
      }
      return message;
    } finally {
      setEnrichBusy(false);
    }
  };

  /** Pull server truth after auth (apps, sends, replies, caps). Best-effort:
   *  failures keep local state and log — the app stays usable offline. */
  const hydrateBackend = () => {
    if (!useBackend) return;
    void httpApp
      .listRemote()
      .then((rows) =>
        setApps((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...rows.filter((r) => !seen.has(r.id)), ...prev];
        }),
      )
      .catch(() => logger.warn('hydrate-apps', 'Server apps unreachable — showing local.', {}));
    void httpOut
      .listRemote()
      .then((rows) =>
        setSent((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...rows.filter((r) => !seen.has(r.id)), ...prev];
        }),
      )
      .catch(() => logger.warn('hydrate-sends', 'Server sends unreachable — showing local.', {}));
    void httpOut
      .repliesRemote()
      .then((rows) => {
        if (rows.length > 0) setReplies(rows);
      })
      .catch(() => logger.warn('hydrate-replies', 'Server replies unreachable — showing local.', {}));
    void httpOut
      .notificationsRemote()
      .then((rows) => setHotReply(rows[0] ?? null))
      .catch(() => logger.warn('hydrate-notifications', 'Reply notifications unreachable — no banner.', {}));
    void fetchUsage().then((u) => {
      if (u !== null) setUsage(u);
    });
    void httpResume
      .latest()
      .then((row) => {
        if (row !== null) setResume(row);
      })
      .catch(() => logger.warn('hydrate-resume', 'Resume status unreachable — showing none.', {}));
    void refreshEnrichment();
    void httpJobs.refresh().then(() => setJobs([...httpJobs.all()])).catch(() => logger.warn('hydrate-jobs', 'Saved-jobs refresh failed — showing local.', {}));
    // Server profile → local. Only meaningful server values merge; local
    // wins when the row is empty. onboardingCompleted restores too, so a
    // fresh device skips a finished wizard. (Callers sync before flipping
    // `authed`; no duplicate pull here.)
  };

  /** Poll the resume pipeline to a terminal state, then pull the server
   *  profile so AI-merged fields (experience/education/links…) land across
   *  the app. Bounded — the wizard can always re-check on next open. */
  const pollResume = async (): Promise<void> => {
    const deadline = Date.now() + 150_000;
    for (;;) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1500);
      });
      if (Date.now() > deadline) return;
      let next: ResumeRecord | null = null;
      try {
        next = await httpResume.latest();
      } catch {
        return; // transient transport failure — last known state stays
      }
      if (next === null) return;
      setResume(next);
      if (next.extractionStatus === 'completed' || next.extractionStatus === 'failed') {
        void syncProfile();
        setNotif((n) => n + 1);
        return;
      }
    }
  };

  /** Upload a resume (PDF or DOCX) and drive the reading pipeline. Returns
   *  honest user-facing copy in both modes. */
  const uploadResume = async (file: File): Promise<string> => {
    if (!useBackend) {
      const { message } = await DemoResumeService.upload(file);
      setProfile((prev) => ({ ...prev, resume: file.name }));
      return message;
    }
    const token = enrichPollToken.current;
    const { record, message } = await httpResume.upload(file);
    if (record === null) return message;
    if (token !== enrichPollToken.current) return message; // logged out mid-upload
    setResume(record);
    enrichPollToken.current += 1; // cancel any poll for the previous resume
    enrichPolling.current = false;
    setEnrichment(null); // server drops the previous resume's dossier
    setProfile((prev) => ({ ...prev, resume: record.fileName }));
    void pollResume();
    return message;
  };

  /** Profile photo: downscale first, then upload (backend) or keep a local
   *  data URL (demo — says so). Returns honest user-facing copy. */
  const setAvatarPhoto = async (file: File): Promise<string> => {
    const prepared = await prepareAvatar(file);
    if (prepared === null) return 'That image could not be read — try a different file.';
    if (!useBackend) {
      const url = await blobToDataUrl(prepared);
      if (url === null) return 'That image could not be read — try a different file.';
      setProfile((prev) => ({ ...prev, avatarUrl: url }));
      return 'Photo kept in this browser only — not uploaded.';
    }
    const { avatarUrl, message } = await httpAvatar.upload(prepared);
    if (avatarUrl !== null) setProfile((prev) => ({ ...prev, avatarUrl }));
    return message;
  };

  /**
   * Backend live search: POST /searches (queues a scraper run), poll to
   * terminal, list results, skill-score, and merge over kept saved rows.
   * Saved rows always win on URL collision; fresh unsaved rows replace
   * stale ones. Demo mode is a no-op — demo scanning lives in scan().
   */
  const runLiveSearch = async (query: string, country: string): Promise<void> => {
    if (!useBackend) return;
    setLiveSearch({ state: 'running', message: 'Starting live search…' });
    setScanning(true);
    try {
      const fresh = await httpJobs.runLiveSearch(query, country, profile.skills, {
        onStatus: (status) => setLiveSearch({ state: 'running', message: `Live search: ${status}…` }),
        onSearchId: (id) => { liveSearchId.current = id; },
      });
      liveSearchId.current = null;
      setJobs(prev => {
        const kept = new Map(prev.filter(j => j.isSaved).map(j => [j.url, j]));
        const out = [...kept.values()];
        for (const j of fresh) {
          const saved = kept.get(j.url);
          out.push(saved !== undefined ? { ...j, isSaved: true, savedAt: saved.savedAt } : j);
        }
        return out;
      });
      setScannedAt(Date.now());
      setNotif(n => n + 1);
      // The hero query was consumed by the scrape run (boards are already
      // software-scoped); clear it so the client-side substring filter
      // doesn't hide the fresh rows. Skill ranking still orders the feed.
      setSearch('');
      setLiveSearch({ state: 'idle', message: `Live search loaded ${fresh.length} roles.` });
    } catch (err) {
      const code = typeof (err as { code?: unknown })?.code === 'string'
        ? (err as { code: string }).code
        : undefined;
      setLiveSearch({ state: 'error', message: toUserMessage(err), ...(code !== undefined ? { code } : {}) });
    } finally {
      liveSearchId.current = null;
      setScanning(false);
    }
  };

  /** Release a stuck/running backend search (frees the one-active guard). */
  const cancelLiveSearch = async (): Promise<void> => {
    const id = liveSearchId.current;
    liveSearchId.current = null;
    if (useBackend) {
      await httpJobs.cancelSearch(id);
    } else {
      logger.warn('cancel-search', 'No active search id to cancel.', {});
    }
    setScanning(false);
    setLiveSearch({ state: 'idle', message: 'Live search cancelled.' });
  };

  const dismissHotReply = useCallback((): void => {
    setHotReply(null);
    if (useBackend) {
      void httpOut
        .markNotificationsReadRemote()
        .catch(() => logger.warn('notifications-read', 'Could not mark reply notifications read.', {}));
    }
  }, []);

  const value = useMemo<Store>(() => ({
    route, authed, restoring, onboarded, dark, profile, jobs, apps, sent, replies, notif, scanning, scannedAt, usage, backend: useBackend, search, selected, colorway,
    sidebarOpen, setSidebarOpen,
    hotReply, dismissHotReply,
    liveSearch, runLiveSearch, cancelLiveSearch,
    resume, uploadResume, setAvatarPhoto,
    enrichment, enrichBusy, startEnrichment, refreshEnrichment, pasteEnrichmentSource,
    go: (r) => { window.history.pushState({}, '', '/' + r); setRoute(r); setSelected(null); setSidebarOpen(false); window.scrollTo({ top: 0 }); },
    login: (email, opts) => {
      logger.info('auth-login', 'User logged in', { user_id: hashUserId(email) });
      setSentryUser(email);
      // Settle auth BEFORE the caller lifts any hold: otherwise `authed` and
      // the visible page disagree for a full profile round trip. Server truth
      // decides the destination; unreachable server (null) falls back to the
      // local flag. An explicit server false re-arms the wizard (covers
      // pre-migration accounts and shared-device account switches).
      return syncProfile().then((completed) => {
        if (completed === false) setOnboarded(false);
        const next: Route = completed === true ? 'dashboard' : completed === false ? 'onboarding' : (onboarded ? 'dashboard' : 'onboarding');
        setProfile(p => ({ ...p, email }));
        setAuthed(true);
        hydrateBackend();
        // Silent (session restore) keeps the current deep link; View bounces
        // auth-only routes to the dashboard on its own. Explicit logins land
        // on server truth in the same commit as `authed`.
        if (opts?.silent !== true) {
          window.history.pushState({}, '', '/' + next); setRoute(next);
        }
      });
    },
    logout: () => {
      setAuthed(false); setSentryUser(null);
      // Drop the account's local footprint: a shared device must not leak the
      // previous profile (name, resume…) or its onboarding flag into the next
      // login — server hydration restores the right account's copy.
      setProfile({ ...DEFAULT_PROFILE });
      setOnboarded(false);
      setResume(null);
      enrichPollToken.current += 1; // old account's in-flight poll must stop
      enrichPolling.current = false;
      setEnrichment(null);
      setHotReply(null);
      setSidebarOpen(false);
      logger.info('auth-logout', 'User logged out', {});
      void authSignOut().finally(() => {
        window.history.pushState({}, '', '/login'); setRoute('login');
      });
      // Clerk session teardown (AuthBridge keeps the hook registered).
      void signOutActionRef.current?.().catch(() => undefined);
    },
    signup: (name, email) => {
      setAuthed(true); setProfile(p => ({ ...p, name, email, initials: initialsFor(name, p.initials) }));
      setSentryUser(email);
      logger.info('auth-signup', 'User signed up', { user_id: hashUserId(email) });
      window.history.pushState({}, '', '/onboarding'); setRoute('onboarding');
    },
    onboard: (p) => {
      setProfile(prev => ({ ...prev, ...p, initials: initialsFor(p.name ?? prev.name, prev.initials) }));
      setOnboarded(true);
      // Register completion server-side (best-effort, same honesty rules as
      // update()): the local flag drives this device; the server flag lets a
      // fresh device skip the wizard after hydration.
      if (useBackend) {
        void apiFetch('/profiles/me', { method: 'PATCH', body: { ...profilePatch(p), onboardingCompleted: true } }).catch(() =>
          logger.warn('onboard-sync', 'Onboarding sync failed — local copy kept.', {}),
        );
      }
      window.history.pushState({}, '', '/dashboard'); setRoute('dashboard');
    },
    update: (p) => {
      setProfile(prev => {
        const next = { ...prev, ...p };
        if (p.name !== undefined) next.initials = initialsFor(p.name, prev.initials);
        return next;
      });
      // Best-effort profile sync: local state is truth for the UI; the
      // server copy catches up silently. Failures only log. profilePatch()
      // translates only the supplied keys (surgical) and drops local-only
      // ones (signature), so typing in one field never overwrites the rest.
      if (useBackend) {
        const patch = profilePatch(p);
        if (Object.keys(patch).length > 0) {
          void apiFetch('/profiles/me', { method: 'PATCH', body: patch }).catch(() =>
            logger.warn('profile-sync', 'Profile sync failed — local copy kept.', {}),
          );
        }
      }
    },
    toggleDark: () => {
      document.documentElement.classList.add('theme-suppress');
      setDark(d => !d);
      requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('theme-suppress')));
    },
    setSearch, select: setSelected,
    save: async (id) => {
      const cur = jobs.find(j => j.id === id);
      const saving = cur ? !cur.isSaved : true;
      const stamp = saving ? today() : undefined;
      // Server first when configured (best-effort): local flags still update
      // so filters never lie about what the user just did.
      if (useBackend && cur !== undefined) {
        try {
          await apiFetch('/jobs/saved', {
            method: 'PATCH',
            body: { canonicalUrl: cur.url, title: cur.title, company: cur.company, location: cur.location, saved: saving },
          });
        } catch {
          logger.warn('save-sync', 'Save sync failed — local flag kept.', {});
        }
      }
      setJobs(prev => prev.map(j => (j.id === id ? { ...j, isSaved: saving, savedAt: stamp } : j)));
      setSelected(prev => (prev && prev.id === id ? { ...prev, isSaved: saving, savedAt: stamp } : prev));
      setNotif(n => n + 1);
    },
    apply: async (id) => {
      if (!useBackend) {
        const gate = DemoApplicationService.canApply(apps, id, today());
        if (!gate.ok) return gate.message;
        const j = jobs.find(x => x.id === id); if (!j) return 'Role not found.';
        setApps(prev => [{ id: nextId('app'), jobId: id, title: j.title, company: j.company, logo: j.logo, appliedDate: today(), updatedAt: today(), status: 'UNDER REVIEW' }, ...prev]);
        setJobs(prev => prev.map(x => x.id === id ? { ...x, isSaved: true } : x));
        setNotif(n => n + 1);
        return gate.message;
      }
      const j = jobs.find(x => x.id === id); if (!j) return 'Role not found.';
      const pre = httpApp.canApply(apps, id, today());
      if (!pre.ok) return pre.message;
      const { row, message } = await httpApp.createRemote(
        j.url,
        { title: j.title, company: j.company, logo: j.logo },
        currentRequestId(),
      );
      if (row === null) return message;
      setApps(prev => (prev.some(a => a.id === row.id) ? prev : [row, ...prev]));
      setJobs(prev => prev.map(x => x.id === id ? { ...x, isSaved: true } : x));
      setNotif(n => n + 1);
      return message;
    },
    advanceApp: async (id) => {
      const cur = apps.find(a => a.id === id);
      if (cur === undefined) return null;
      if (!useBackend || cur.serverId === undefined) {
        const next = DemoApplicationService.nextStatus(cur.status);
        if (next) { setApps(prev => DemoApplicationService.advance(prev, id, today())); setNotif(n => n + 1); }
        return next;
      }
      const { row, message } = await httpApp.advanceRemote(cur.serverId);
      if (row === null) {
        logger.warn('advance-app', message, {});
        return cur.status;
      }
      setApps(prev => prev.map(a => (a.id === id ? { ...row, archived: a.archived } : a)));
      setNotif(n => n + 1);
      logger.info('advance-app', message, {});
      return row.status;
    },
    withdrawApp: async (id) => {
      const cur = apps.find(a => a.id === id);
      if (useBackend && cur !== undefined && cur.serverId !== undefined) {
        const message = await httpApp.withdrawRemote(cur.serverId);
        logger.info('withdraw-app', message, {});
      }
      setApps(prev => DemoApplicationService.withdraw(prev, id)); setNotif(n => n + 1);
    },
    archiveApp: async (id, archived) => {
      const cur = apps.find(a => a.id === id);
      if (useBackend && cur !== undefined && cur.serverId !== undefined) {
        const message = await httpApp.archiveRemote(cur.serverId, archived);
        logger.info('archive-app', message, {});
      }
      setApps(prev => prev.map(a => (a.id === id ? { ...a, archived } : a))); setNotif(n => n + 1);
    },
    scan: () => {
      // Backend on: a real scraper run (the only source of live rows).
      // Backend off: no fabricated roles — point at the missing backend and
      // leave the feed untouched.
      if (useBackend) {
        const q = search.trim() || `${profile.roles.join(' ')} ${profile.skills}`.trim() || 'software engineer';
        void runLiveSearch(q, '');
        return;
      }
      setLiveSearch({
        state: 'error',
        message: 'Live search needs the backend — no roles were fetched.',
      });
    },
    send: async (m) => {
      const entry: OutreachMail = {
        id: nextId('m'), sentAt: `${today()} ${clock()}`,
        jobTitle: m.jobTitle ?? '', company: m.company ?? '',
        to: m.to, subject: m.subject, body: m.body,
      };
      if (!useBackend) {
        const gate = DemoOutreachService.canSend(sent.length, m.to);
        if (!gate.ok) return gate.message;
        setSent(prev => [entry, ...prev]);
        setNotif(n => n + 1);
        return gate.message;
      }
      const gate = httpOut.canSend(sent.length, m.to);
      if (!gate.ok) return gate.message;
      const { message } = await httpOut.sendRemote(m);
      // Optimistic local entry so history reads instantly; server owns the
      // cap truth (409 surfaces here as the cap message, not a guess).
      if (message === 'Message queued for sending.') {
        setSent(prev => [entry, ...prev]);
        setNotif(n => n + 1);
      }
      return message;
    },
    clearSent: () => setSent([]),
    clearApps: () => setApps([]),
    clearNotif: () => setNotif(0),
    setColorway,
    setRestoring,
    setSignOutAction: (fn) => { signOutActionRef.current = fn; },
  }), [route, authed, restoring, onboarded, dark, profile, jobs, apps, sent, replies, notif, scanning, scannedAt, usage, search, selected, colorway, sidebarOpen, liveSearch, runLiveSearch, cancelLiveSearch, resume, uploadResume, setAvatarPhoto, enrichment, enrichBusy, startEnrichment, refreshEnrichment, pasteEnrichmentSource, hotReply, dismissHotReply]);

  // Session restore (P2): after an OAuth redirect-back the browser holds a
  // valid session cookie but local state still says logged-out. Exactly one
  // best-effort check per logged-out lifetime; failure stays logged out.
  // Ordering invariant (the "login flashed after login" bug): the probe must
  // NOT lift the `restoring` hold until the auth decision has been committed.
  // Lifting it first renders Login + rewrites the URL to /login for a full
  // profile round trip, then bounces to the dashboard — a visible login flash
  // on every cookie-boot (OAuth return, fresh device, cleared storage).
  // StrictMode-safe: a cancelled probe result is dropped via `live` and the
  // re-run re-probes; once the decision is locked ('done') re-runs skip.
  // Clerk sign-out handoff: the AuthBridge registers signOut() here once the
  // provider mounts; logout() delegates instead of poking Clerk directly.
  const signOutActionRef = useRef<(() => Promise<void>) | null>(null);
  // NOTE: the better-auth boot probe lived here; with Clerk the AuthBridge
  // (components/AuthBridge.tsx) owns session restore + authed flips.

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
