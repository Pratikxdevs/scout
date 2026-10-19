import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Application, AppStatus, DraftMail, HotReply, Job, LiveSearchState, OutreachMail, Profile, ResumeRecord, Route } from './types';
import { applyColorway, DEFAULT_COLORWAY } from './theme/palettes';
import { monoStack, sansStack } from './theme/typography';
import { DemoApplicationService, nextId } from './services/demo';
import { loadLegacy, loadStored, saveStored } from './lib/storage';
import { validJobs } from './lib/validate';
import { setSentryUser, hashUserId } from './lib/sentry';
import { logger } from './lib/logger';
import { backendOn, type Usage } from './services/api';
import { authSignOut } from './lib/authClient';
import { initialsFor } from './lib/profileSync';
import { prepareAvatar, blobToDataUrl } from './lib/imageScale';
import { resumeMimeForFile } from './lib/resume';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { api as convexApi } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';

/* Backend wiring (wave 13): Convex IS the backend. `backendOn` is true when
 * VITE_CONVEX_URL is configured; identity comes from Clerk (AuthBridge),
 * server rows stream in via reactive useQuery hooks below — no fetch
 * layer, no hydration waterfall. Demo mode (no Convex URL) keeps the local
 * DemoXService paths. */

/** Structural view of a leads row (typed by Convex; listed for mapping). */
interface LeadRow {
  _id: Id<'leads'>; userId: string; runId?: Id<'searchRuns'>;
  canonicalUrl: string; domain: string; title: string; company: string;
  description?: string; location?: string;
  budgetVerified?: boolean; budgetMin?: number; budgetMax?: number; budgetNote?: string;
  publishedAt?: number; opportunityType?: string; intent?: string;
  scoreOverall: number; scoreExplanation?: string; scoreSkill?: number;
  crmStatus: 'new' | 'saved' | 'contacted' | 'replied' | 'won' | 'lost' | 'dismissed';
  claims?: never[]; lastVerifiedAt: number; updatedAt: number;
}

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

/** Format a server timestamp as the UI's MM/DD/YY day key (or ''). */
function fmtDay(ts: number | undefined): string {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return '';
  return new Date(ts).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
}

/** CRM status → the closest pipeline stage label the UI owns. */
function crmToAppStatus(crm: LeadRow['crmStatus'] | undefined): Application['status'] | null {
  switch (crm) {
    case 'saved': case 'contacted': return 'UNDER REVIEW';
    case 'replied': return 'INTERVIEW SET';
    case 'won': return 'OFFERED';
    case 'lost': return 'REJECTED';
    case 'dismissed': return 'WITHDRAWN';
    default: return null;   // new — not in the pipeline yet
  }
}

/** App-status → CRM write for "advance" (saved rows promote to contacted). */
function nextCrm(
  cur: Application,
): 'contacted' | 'replied' | 'won' | null {
  switch (cur.status) {
    case 'UNDER REVIEW': return cur.crm === 'saved' ? 'contacted' : 'replied';
    case 'INTERVIEW SET': return 'won';
    default: return null;
  }
}

/** leads row → the feed's Job shape (scores feed `match`; no invented data). */
function leadToJob(r: LeadRow): Job {
  let compensation = '';
  if (r.budgetVerified === true) {
    const lo = r.budgetMin ?? r.budgetMax;
    const hi = r.budgetMax ?? r.budgetMin;
    if (lo !== undefined || hi !== undefined) compensation = `$${lo ?? '?'} – $${hi ?? '?'}`;
  }
  return {
    id: 'lead:' + r._id,
    leadId: r._id,
    title: r.title,
    company: r.company,
    location: r.location !== undefined && r.location !== '' ? r.location : '—',
    compensation,
    description: r.description !== undefined && r.description !== '' ? r.description : r.scoreExplanation ?? '',
    requirements: [],
    match: r.scoreOverall,
    isSaved: r.crmStatus !== 'new',
    savedAt: fmtDay(r.updatedAt),
    url: r.canonicalUrl,
    posted: r.publishedAt !== undefined ? fmtDay(r.publishedAt) : '',
    type: r.opportunityType === 'one_off' || r.opportunityType === 'short_term' ? 'Contract' : 'Full-time',
  };
}

function leadToApp(r: LeadRow): Application | null {
  const status = crmToAppStatus(r.crmStatus);
  if (status === null) return null;
  return {
    id: 'app:' + r._id,
    jobId: 'lead:' + r._id,
    title: r.title,
    company: r.company,
    appliedDate: fmtDay(r.updatedAt) || today(),
    updatedAt: fmtDay(r.updatedAt),
    status,
    serverId: r._id,
    crm: r.crmStatus === 'saved' ? 'saved' : 'contacted',
  };
}

/** Convex throws wedge-shaped messages; peel the Scout code+copy out. */
function cleanConvexError(err: unknown): { code?: string; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const m = /Error: ([A-Z_]+): ([^]*?)(?:\(?\s*at [a-zA-Z]|$)/.exec(raw) ?? /Error: ([A-Z_]+): ([^]+)/.exec(raw);
  if (m !== null) return { code: m[1], message: m[2].trim() };
  const plain = raw.replace(/^Uncaught Error: /, '').replace(/\(\[CONVEX[^)]*\)\] */, '').trim();
  return { message: plain === '' ? 'Something went wrong — try again.' : plain };
}

interface Store {
  route: Route; authed: boolean; onboarded: boolean; dark: boolean;
  profile: Profile; jobs: Job[]; apps: Application[];
  sent: OutreachMail[]; notif: number; scanning: boolean;
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
  setAvatarPhoto: (file: File) => Promise<string>;
  /** Resume pipeline (SPEC §3): the active upload + its AI-read state. */
  resume: ResumeRecord | null;
  uploadResume: (file: File) => Promise<string>;
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
    // Demo-local feed only; the backend feed streams via the leads hook.
    return validJobs(load<Job[]>(KEYS.jobs, []));
  });
  const [apps, setApps] = useState<Application[]>(() => load(KEYS.apps, [] as Application[]));
  const [sent, setSent] = useState<OutreachMail[]>(() => load(KEYS.sent, [] as OutreachMail[]));
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
  // Backend hunt progress (session-only: never persisted).
  const [liveSearch, setLiveSearch] = useState<LiveSearchState>({ state: 'idle', message: '' });
  // The queued hunt this client started; the run hook streams its state.
  const [liveRunId, setLiveRunId] = useState<Id<'searchRuns'> | null>(null);

  /* ---------- Convex hooks (reactive, identity comes from Clerk) ---------- */
  const { isAuthenticated } = useConvexAuth();
  const serverReady = useBackend && authed && isAuthenticated;
  const serverProfileRow = useQuery(convexApi.profiles.getMine, serverReady ? {} : 'skip');
  const serverLeads = useQuery(convexApi.leads.listMine, serverReady ? { limit: 80 } : 'skip');
  const serverUsage = useQuery(convexApi.usage.summary, serverReady ? {} : 'skip');
  const activeRun = useQuery(
    convexApi.searchRuns.get,
    serverReady && liveRunId !== null ? { runId: liveRunId } : 'skip',
  );
  const createRun = useMutation(convexApi.searchRuns.create);
  const cancelRun = useMutation(convexApi.searchRuns.cancel);
  const setLeadStatus = useMutation(convexApi.leads.updateStatus);
  const saveConvexProfile = useMutation(convexApi.profiles.save);
  const ensureUser = useMutation(convexApi.users.ensure);
  const requestResumeUpload = useMutation(convexApi.resumes.requestUpload);
  const attachResume = useMutation(convexApi.resumes.attach);
  const serverResume = useQuery(convexApi.resumes.myCurrent, serverReady ? {} : 'skip');

  // The active resume row (whitelisted server fields — never raw text).
  const resume = useMemo<ResumeRecord | null>(() => {
    if (serverResume === undefined || serverResume === null) return null;
    const row = serverResume as unknown as ResumeRecord;
    return {
      resumeId: row.resumeId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      version: row.version,
      extractionStatus: row.extractionStatus,
      stage: row.stage,
      failureReason: row.failureReason,
      extractedProfile: row.extractedProfile,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }, [serverResume]);

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

  /* ---------- server rows → store state (reactive, no polling) ---------- */

  // Profile hydration: only meaningful server values merge; local wins for
  // untouched fields. onboardingCompleted restores the wizard skip.
  useEffect(() => {
    if (!serverReady || serverProfileRow === undefined || serverProfileRow === null) return;
    const row = serverProfileRow;
    setProfile(prev => ({
      ...prev,
      name: row.name !== '' ? row.name : prev.name,
      email: row.email !== '' ? row.email : prev.email,
      city: row.city ?? prev.city,
      country: row.country ?? prev.country,
      summary: row.summary ?? prev.summary,
      services: Array.isArray(row.services) && row.services.length > 0 ? row.services : prev.services,
      industries: Array.isArray(row.industries) && row.industries.length > 0 ? row.industries : prev.industries,
      keywords: Array.isArray(row.keywords) && row.keywords.length > 0 ? row.keywords : prev.keywords,
      minBudget: row.minBudget ?? prev.minBudget,
      maxBudget: row.maxBudget ?? prev.maxBudget,
      skills: Array.isArray(row.skills) && row.skills.length > 0 ? row.skills.join(', ') : prev.skills,
      initials: row.name !== '' ? initialsFor(row.name, prev.initials) : prev.initials,
    }));
    if (row.onboardingCompleted === true) setOnboarded(true);
  }, [serverProfileRow, serverReady]);

  // Leads → feed + pipeline. The server list is authoritative once loaded;
  // saved-status rows never lose their flags (crmStatus is the truth).
  useEffect(() => {
    if (!serverReady || serverLeads === undefined) return;
    const rows = (serverLeads as unknown as LeadRow[]) ?? [];
    setJobs(rows.map(leadToJob));
    setApps(rows.map(leadToApp).filter((a): a is Application => a !== null));
  }, [serverLeads, serverReady]);

  // Caps meter truth: contacts today vs the CONTACT_CAP (LIMITS).
  useEffect(() => {
    if (!serverReady) return;
    if (serverUsage === undefined || serverUsage === null) return;
    setUsage({
      applyUsed: serverUsage.contactedToday,
      applyCap: serverUsage.contactCap,
      outreachUsed: 0,
      outreachCap: serverUsage.contactCap,
      dateKey: today(),
    });
  }, [serverUsage, serverReady]);

  // Hunt progress: stream the active run to the live-search banner.
  useEffect(() => {
    if (liveRunId === null) return;
    if (activeRun === undefined) return;   // still loading
    if (activeRun === null) { setLiveRunId(null); setScanning(false); return; }
    switch (activeRun.status) {
      case 'queued':
        setScanning(true);
        setLiveSearch({ state: 'running', message: 'Hunt queued — planning queries…' });
        break;
      case 'running':
        setScanning(true);
        setLiveSearch({ state: 'running', message: 'Hunting: search → fetch → score…' });
        break;
      case 'completed': {
        setScanning(false);
        setLiveRunId(null);
        setScannedAt(Date.now());
        setNotif(n => n + 1);
        // The hunt consumed the hero query; clear it so the substring
        // filter doesn't hide the fresh rows. Server order wins the feed.
        setSearch('');
        setLiveSearch({
          state: 'idle',
          message: `Hunt loaded ${activeRun.resultCount} lead${activeRun.resultCount === 1 ? '' : 's'}.`,
        });
        break;
      }
      case 'failed':
        setScanning(false);
        setLiveRunId(null);
        setLiveSearch({ state: 'error', message: activeRun.failReason ?? 'Hunt failed.', code: activeRun.failCode });
        break;
      case 'cancelled':
        setScanning(false);
        setLiveRunId(null);
        setLiveSearch({ state: 'idle', message: 'Hunt cancelled.' });
        break;
    }
  }, [activeRun, liveRunId]);

  /* ---------- honest profile sync to Convex (best-effort) ---------- */

  const syncProfileToServer = (next: Profile, onboardingCompleted: boolean): void => {
    if (!serverReady) return;
    if (next.name.trim() === '' || !next.email.includes('@')) return; // row validity guard
    void saveConvexProfile({
      name: next.name,
      email: next.email,
      city: next.city !== '' ? next.city : undefined,
      country: next.country !== '' ? next.country : undefined,
      summary: next.summary !== '' ? next.summary : undefined,
      services: next.services ?? [],
      skills: next.skills.split(',').map(s => s.trim()).filter(Boolean),
      industries: next.industries ?? [],
      keywords: next.keywords ?? [],
      minBudget: next.minBudget ?? undefined,
      maxBudget: next.maxBudget ?? undefined,
      onboardingCompleted,
    }).catch((e: unknown) => {
      logger.warn('profile-sync', cleanConvexError(e).message, {});
    });
  };

  /* ---------- actions ---------- */

  /**
   * Live hunt: queue a searchRuns row; reactive hooks stream progress and
   * the leads list flows into the feed on completion. Demo mode is a no-op —
   * demo scanning lives in scan().
   */
  const runLiveSearch = async (query: string, _country: string): Promise<void> => {
    if (!serverReady) return;
    setLiveSearch({ state: 'running', message: 'Queuing hunt…' });
    setScanning(true);
    try {
      const id = await createRun({ query: query.trim().slice(0, 200) });
      setLiveRunId(id);
    } catch (err) {
      const clean = cleanConvexError(err);
      setLiveSearch({ state: 'error', message: clean.message, ...(clean.code !== undefined ? { code: clean.code } : {}) });
      setScanning(false);
    }
  };

  /** Cancel the in-flight hunt (server folds queued tasks; UI banner idles). */
  const cancelLiveSearch = async (): Promise<void> => {
    const id = liveRunId;
    if (id !== null) {
      try {
        await cancelRun({ runId: id });
      } catch (err) {
        logger.warn('cancel-search', cleanConvexError(err).message, {});
      }
    }
    setScanning(false);
    setLiveSearch({ state: 'idle', message: 'Hunt cancelled.' });
  };

  const dismissHotReply = useCallback((): void => {
    setHotReply(null);
    logger.info('hot-reply-dismiss', 'Reply banner dismissed', {});
  }, []);

  /** Profile photo: downscaled to a browser-local data URL. Clerk is the
   *  account surface; Scout's API carries no avatar storage. */
  const setAvatarPhoto = async (file: File): Promise<string> => {
    const prepared = await prepareAvatar(file);
    if (prepared === null) return 'That image could not be read — try a different file.';
    const url = await blobToDataUrl(prepared);
    if (url === null) return 'That image could not be read — try a different file.';
    setProfile((prev) => ({ ...prev, avatarUrl: url }));
    return 'Photo kept in this browser only — accounts are managed by Clerk.';
  };

  /** Resume upload: the bytes go straight to Convex storage via a
   *  short-lived upload URL, then the id is attached to the account. The
   *  pipeline (extract → AI) runs server-side; the wizard watches the row
   *  reactively, so no polling here. Returns honest user-facing copy. */
  const uploadResume = async (file: File): Promise<string> => {
    if (!useBackend) {
      setProfile((prev) => ({ ...prev, resume: file.name }));
      return 'Resume kept in this browser — no backend is configured, so nothing was uploaded.';
    }
    const mime = resumeMimeForFile(file);
    if (mime === null) {
      return 'That file is not a PDF or DOCX — export your resume in one of those formats and try again.';
    }
    try {
      const { uploadUrl } = await requestResumeUpload();
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: file,
      });
      if (!put.ok) return 'The upload did not complete — try again.';
      const { storageId } = await put.json() as { storageId: string };
      await attachResume({ storageId: storageId as Id<'_storage'>, fileName: file.name, mimeType: mime });
      setProfile((prev) => ({ ...prev, resume: file.name }));
      return 'Resume uploaded — Scout is reading it now.';
    } catch (e) {
      const { message } = cleanConvexError(e);
      return message;
    }
  };

  const value = useMemo<Store>(() => ({
    route, authed, restoring, onboarded, dark, profile, jobs, apps, sent, notif, scanning, scannedAt, usage, backend: useBackend, search, selected, colorway,
    sidebarOpen, setSidebarOpen,
    hotReply, dismissHotReply,
    liveSearch, runLiveSearch, cancelLiveSearch,
    setAvatarPhoto,
    resume,
    uploadResume,
    go: (r) => { window.history.pushState({}, '', '/' + r); setRoute(r); setSelected(null); setSidebarOpen(false); window.scrollTo({ top: 0 }); },
    login: (email, opts) => {
      logger.info('auth-login', 'User logged in', { user_id: hashUserId(email) });
      setSentryUser(email);
      // Clerk owns identity; data flows in reactively once authed flips.
      setProfile(p => ({ ...p, email }));
      setAuthed(true);
      // Users row = presence + lastSeen (advisory; requireActor never blocks).
      if (useBackend) {
        void ensureUser().catch((e: unknown) => logger.warn('users-ensure', e instanceof Error ? e.message : '', {}));
      }
      if (opts?.silent !== true) {
        const next: Route = onboarded ? 'dashboard' : 'onboarding';
        window.history.pushState({}, '', '/' + next); setRoute(next);
      }
      return Promise.resolve();
    },
    logout: () => {
      setAuthed(false); setSentryUser(null);
      // Drop the account's local footprint: a shared device must not leak
      // the previous profile or its onboarding flag into the next login.
      setProfile({ ...DEFAULT_PROFILE });
      setOnboarded(false);
      setHotReply(null);
      setSidebarOpen(false);
      setLiveRunId(null);
      setLiveSearch({ state: 'idle', message: '' });
      setUsage(null);
      setJobs([]);
      setApps([]);
      setSent([]);
      setScanning(false);
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
      const completed = { ...profile, ...p } as Profile;
      syncProfileToServer(completed, true);
      window.history.pushState({}, '', '/dashboard'); setRoute('dashboard');
    }, update: (p) => {
      setProfile(prev => {
        const next = { ...prev, ...p };
        if (p.name !== undefined) next.initials = initialsFor(p.name, prev.initials);
        syncProfileToServer(next, onboarded);
        return next;
      });
    },
    toggleDark: () => {
      document.documentElement.classList.add('theme-suppress');
      setDark(d => !d);
      requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('theme-suppress')));
    },
    setSearch, select: setSelected,
    save: async (id) => {
      const cur = jobs.find(j => j.id === id);
      if (cur === undefined) return;
      const saving = !cur.isSaved;
      const stamp = saving ? today() : undefined;
      if (serverReady && cur.leadId !== undefined) {
        try {
          await setLeadStatus({
            leadId: cur.leadId as Id<'leads'>,
            status: saving ? 'saved' : 'new',
          });
        } catch (err) {
          logger.warn('save-sync', cleanConvexError(err).message, {});
        }
      }
      setJobs(prev => prev.map(j => (j.id === id ? { ...j, isSaved: saving, savedAt: stamp } : j)));
      setSelected(prev => (prev && prev.id === id ? { ...prev, isSaved: saving, savedAt: stamp } : prev));
      setNotif(n => n + 1);
    },
    apply: async (id) => {
      const j = jobs.find(x => x.id === id);
      if (!j) return 'Lead not found.';
      if (apps.some(a => a.jobId === id)) return 'Already in your pipeline.';
      if (!serverReady) {
        const gate = DemoApplicationService.canApply(apps, id, today());
        if (!gate.ok) return gate.message;
        setApps(prev => [{ id: nextId('app'), jobId: id, title: j.title, company: j.company, logo: j.logo, appliedDate: today(), updatedAt: today(), status: 'UNDER REVIEW' }, ...prev]);
        setJobs(prev => prev.map(x => x.id === id ? { ...x, isSaved: true } : x));
        setNotif(n => n + 1);
        return gate.message;
      }
      if (j.leadId === undefined) return 'This lead has no linked record yet.';
      try {
        await setLeadStatus({ leadId: j.leadId as Id<'leads'>, status: 'contacted' });
      } catch (err) {
        const clean = cleanConvexError(err);
        return clean.message;
      }
      const row: Application = {
        id: 'app:' + j.leadId, jobId: id, title: j.title, company: j.company, logo: j.logo,
        appliedDate: today(), updatedAt: today(), status: 'UNDER REVIEW',
        serverId: j.leadId, crm: 'contacted',
      };
      setApps(prev => (prev.some(a => a.id === row.id) ? prev : [row, ...prev]));
      setJobs(prev => prev.map(x => x.id === id ? { ...x, isSaved: true } : x));
      setNotif(n => n + 1);
      logger.info('apply', 'Lead moved to pipeline (contacted)', {});
      return 'Lead moved to your pipeline. Scout records — it never auto-sends.';
    },
    advanceApp: async (id) => {
      const cur = apps.find(a => a.id === id);
      if (cur === undefined) return null;
      if (!serverReady || cur.serverId === undefined) {
        const next = DemoApplicationService.nextStatus(cur.status);
        if (next) { setApps(prev => DemoApplicationService.advance(prev, id, today())); setNotif(n => n + 1); }
        return next;
      }
      const nextApp = DemoApplicationService.nextStatus(cur.status);
      if (nextApp === null) return null;
      const crm = nextCrm(cur);
      if (crm === null) return cur.status;
      try {
        await setLeadStatus({ leadId: cur.serverId as Id<'leads'>, status: crm });
      } catch (err) {
        logger.warn('advance-app', cleanConvexError(err).message, {});
        return cur.status;
      }
      setApps(prev => prev.map(a => (a.id === id ? { ...a, status: nextApp, crm: 'contacted' as const, updatedAt: today() } : a)));
      setNotif(n => n + 1);
      logger.info('advance-app', `Pipeline stage advanced (${nextApp})`, {});
      return nextApp;
    },
    withdrawApp: async (id) => {
      const cur = apps.find(a => a.id === id);
      if (serverReady && cur?.serverId !== undefined) {
        try {
          await setLeadStatus({ leadId: cur.serverId as Id<'leads'>, status: 'dismissed' });
        } catch (err) {
          logger.warn('withdraw-app', cleanConvexError(err).message, {});
        }
      }
      setApps(prev => DemoApplicationService.withdraw(prev, id)); setNotif(n => n + 1);
    },
    archiveApp: async (id, archived) => {
      setApps(prev => prev.map(a => (a.id === id ? { ...a, archived } : a))); setNotif(n => n + 1);
    },
    scan: () => {
      // Backend on: a real TinyFish hunt (the only source of live rows).
      // Backend off: no fabricated leads — say so and leave the feed alone.
      if (serverReady) {
        const q = search.trim() || `${profile.roles.join(' ')} ${profile.skills}`.trim() || 'freelance software project';
        void runLiveSearch(q, '');
        return;
      }
      setLiveSearch({
        state: 'error',
        message: 'Live hunt needs the backend — no leads were fetched.',
      });
    },
    send: async (m) => {
      const entry: OutreachMail = {
        id: nextId('m'), sentAt: `${today()} ${clock()}`,
        jobTitle: m.jobTitle ?? '', company: m.company ?? '',
        to: m.to, subject: m.subject, body: m.body,
      };
      // Scout keeps draft records only — sending is always the user's move.
      void entry;
      return 'Scout records drafts and pipeline stages but never sends — copy the email into your own client.';
    },
    clearSent: () => setSent([]),
    clearApps: () => setApps([]),
    clearNotif: () => setNotif(0),
    setColorway,
    setRestoring,
    setSignOutAction: (fn) => { signOutActionRef.current = fn; },
  }), [route, authed, restoring, onboarded, dark, profile, jobs, apps, sent, notif, scanning, scannedAt, usage, search, selected, colorway, sidebarOpen, liveSearch, serverReady, serverLeads, serverProfileRow, serverUsage, dismissHotReply, createRun, cancelRun, setLeadStatus, saveConvexProfile, ensureUser, liveRunId, resume, requestResumeUpload, attachResume]);

  // Clerk sign-out handoff: the AuthBridge registers signOut() here once the
  // provider mounts; logout() delegates instead of poking Clerk directly.
  const signOutActionRef = useRef<(() => Promise<void>) | null>(null);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
