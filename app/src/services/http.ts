/**
 * HTTP implementations of the DemoXService interfaces (Phase 4 plan 04-04).
 * Same sync interfaces as demo.ts — server rows are cached/mapped locally,
 * so components and the store keep calling services exactly as before.
 * When no backend is configured the store uses the DemoXService impls
 * instead; nothing here is imported in that mode.
 *
 * Mapping notes (documented limitations, not silent behavior):
 * - Jobs come from saved jobs (server has no seed catalog): title/company/
 *   location/url map directly; compensation falls back to '' (salary filters
 *   then exclude the row, same as NaN floors today). Filtering/ranking reuse
 *   the pure DemoJobService functions over fetched rows — zero logic fork.
 * - Live search results (searchResults rows) map via resultToJob: snapshot
 *   title/company/location/url map directly; salaryMinK/MaxK render as
 *   "$180k – $220k"; description is worker-cleaned plain text (raw HTML is
 *   tolerated); requirements are bullets parsed from the posting ([] when
 *   none — the detail view says so); match scores come from scoreMatch
 *   skill overlap (server matchScore wins when finite).
 * - Applications map Convex exec states to the demo pipeline for display
 *   (queued/running/submitted/needs_* → UNDER REVIEW, failed → REJECTED,
 *   cancelled → WITHDRAWN). Held states surface as distinct held copy via
 *   advanceRemote, never as caps. Server _ids ride along as serverId.
 * - Outreach drafts map to OutreachMail (jobTitle/company are send-time
 *   context the server doesn't store — they render as ''). Replies map
 *   event+classification (emailEvents carry no body — body renders as '').
 * - Companies: the research directory stays local (app copy); logs() merges
 *   live draft rows from the server, never fabricated seed logs.
 */
import type {
  Application,
  AppStatus,
  CompanyLog,
  DemoResult,
  DraftMail,
  ExtractedProfile,
  HotReply,
  Job,
  OutreachMail,
  ProfileDossier,
  Reply,
  ResumeRecord,
} from '../types.ts';
import {
  DemoApplicationService,
  DemoJobService,
  DemoOutreachService,
  scoreMatch,
  type ApplicationService,
  type CompanyProfile,
  type CompanyService,
  type JobQuery,
  type JobService,
  type OutreachService,
  type ProfileEnrichmentService,
  type ResumeService,
} from './demo.ts';
import { apiFetch, toUserMessage } from './api.ts';
import { parseDossierEnvelope } from '../lib/profileDossier.ts';
import { resumeMimeForFile } from '../lib/resume.ts';

const day = (ts: number): string =>
  new Date(ts).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  });

export interface SavedRow {
  _id: string;
  title: string;
  company?: string;
  location?: string;
  canonicalUrl: string;
  salary?: unknown;
  postedAt?: number;
  savedAt: number;
}

export function salaryText(salary: unknown): string {  if (typeof salary === 'string') return salary;
  if (typeof salary === 'object' && salary !== null) {
    const s = salary as { min?: unknown; max?: unknown };
    if (typeof s.min === 'number' && typeof s.max === 'number')
      return `$${s.min}k – $${s.max}k`;
    if (typeof s.min === 'number') return `$${s.min}k+`;
  }
  return '';
}

export function savedToJob(r: SavedRow): Job {
  return {
    id: r._id,
    title: r.title,
    company: r.company ?? '(unknown)',
    location: r.location ?? '',
    compensation: salaryText(r.salary),
    description: '',
    requirements: [],
    match: 0,
    url: r.canonicalUrl,
    posted: r.postedAt !== undefined ? day(r.postedAt) : '',
    type: 'Full-time',
    isSaved: true,
    savedAt: day(r.savedAt),
  };
}

export class HttpJobService implements JobService {
  private cache: Job[] = [];

  /** Refresh rows from the server (store calls this on login + jobs route). */
  async refresh(): Promise<void> {
    const body = await apiFetch<{ rows: SavedRow[] }>(
      '/jobs?savedOnly=1&page=1&perPage=100',
    );
    this.cache = body.rows.map(savedToJob);
  }

  all(): Job[] {
    return this.cache;
  }

  query(jobs: Job[], q: JobQuery): Job[] {
    return DemoJobService.query(jobs, q);
  }

  paginate<T>(rows: T[], page: number, perPage: number): { rows: T[]; total: number; pages: number } {
    return DemoJobService.paginate(rows, page, perPage);
  }

  rank(jobs: Job[], skills: string): { job: Job; score10: string; matched: string[]; missing: string[] }[] {
    return DemoJobService.rank(jobs, skills);
  }

  /** Trigger a backend scrape run for the Find Jobs first-open flow. */
  async createSearch(query: string, country: string): Promise<LiveSearchStatus> {
    const body = await apiFetch<{ _id: string; status: string }>('/searches', {
      method: 'POST',
      body: { originalQuery: query, country, mode: 'normal' },
    });
    return { searchId: body._id, status: body.status };
  }

  async getSearch(searchId: string): Promise<LiveSearchStatus> {
    const body = await apiFetch<{ _id: string; status: string; resultCount?: number }>(
      `/searches?searchId=${encodeURIComponent(searchId)}`,
    );
    return { searchId: body._id, status: body.status, resultCount: body.resultCount };
  }

  /** Release a stuck/running search (frees the one-active guard). Never throws. */
  async cancelSearch(searchId: string | null): Promise<void> {
    try {
      if (searchId !== null) {
        await apiFetch('/searches/cancel', {
          method: 'POST',
          body: { searchId },
        });
      } else {
        // Reload mid-run lost the id: cancel whatever is still active.
        await apiFetch('/searches/cancel-active', { method: 'POST' });
      }
    } catch {
      /* already terminal or gone — the local state resets either way */
    }
  }

  async listSearchResults(searchId: string): Promise<Job[]> {
    const first = await apiFetch<{ rows: SearchResultRow[]; pages: number }>(
      `/jobs?searchId=${encodeURIComponent(searchId)}&page=1&perPage=100`,
    );
    const all = [...first.rows];
    // Page through the full result set (the API caps at 100 rows/page).
    const pages = typeof first.pages === 'number' && Number.isFinite(first.pages) ? first.pages : 1;
    for (let page = 2; page <= Math.min(pages, 10); page++) {
      const next = await apiFetch<{ rows: SearchResultRow[] }>(
        `/jobs?searchId=${encodeURIComponent(searchId)}&page=${page}&perPage=100`,
      );
      all.push(...next.rows);
    }
    return all.map(resultToJob);
  }

  /**
   * Full first-open flow: create → poll to terminal → list → skill-score.
   * Throws honest Errors (backend down / search failed / timed out);
   * callers surface err.message verbatim via toUserMessage.
   */
  async runLiveSearch(
    query: string,
    country: string,
    skills: string,
    opts?: { pollMs?: number; timeoutMs?: number; onStatus?: (status: string) => void; onSearchId?: (id: string) => void },
  ): Promise<Job[]> {
    const created = await this.createSearch(query, country);
    opts?.onSearchId?.(created.searchId);
    return this.trackSearch(created.searchId, skills, opts);
  }

  /** Poll an existing search to terminal, then list + skill-score its rows. */
  async trackSearch(
    searchId: string,
    skills: string,
    opts?: { pollMs?: number; timeoutMs?: number; onStatus?: (status: string) => void },
  ): Promise<Job[]> {
    const pollMs = opts?.pollMs ?? 4000;
    const timeoutMs = opts?.timeoutMs ?? 600000;
    const deadline = Date.now() + timeoutMs;
    let status = (await this.getSearch(searchId)).status;
    opts?.onStatus?.(status);
    for (;;) {
      if (status === LIVE_DONE) break;
      if (LIVE_FAILED.has(status)) throw new Error(`Live search ${status} — no roles were loaded. Try again.`);
      if (Date.now() > deadline) {
        throw new Error('Live search timed out — the scraper run is still going. Try again shortly.');
      }
      await sleepMs(pollMs);
      status = (await this.getSearch(searchId)).status;
      opts?.onStatus?.(status);
    }
    const jobs = await this.listSearchResults(searchId);
    return jobs.map(j => ({ ...j, match: scoreMatch(j.title, j.requirements, j.description, skills) }));
  }
}

/* ---------------- live search results ---------------- */

export interface LiveSearchStatus {
  searchId: string;
  status: string;
  resultCount?: number;
}

const LIVE_DONE = 'completed';
const LIVE_FAILED = new Set(['failed', 'cancelled', 'timed_out']);

function sleepMs(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}

export interface SearchSnapshot {
  title?: unknown;
  company?: unknown;
  location?: unknown;
  description?: unknown;
  url?: unknown;
  salaryMinK?: unknown;
  salaryMaxK?: unknown;
}

export interface SearchResultRow {
  _id: string;
  rank?: unknown;
  matchScore?: unknown;
  jobSnapshot: SearchSnapshot;
}

/** Posting descriptions arrive as plain text (worker-cleaned) but tolerate raw HTML. */
export function postingText(raw: unknown): string {
  if (typeof raw !== 'string' || raw === '') return '';
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t\xa0]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
    .slice(0, 20000);
}

/** "$180k – $220k" from snapshot $k numbers (the worker rounds to whole $k). */
export function compensationFromK(minK: unknown, maxK: unknown): string {
  const fmt = (v: unknown): string | null =>
    typeof v === 'number' && Number.isFinite(v) ? `$${Math.round(v)}k` : null;
  const lo = fmt(minK);
  const hi = fmt(maxK);
  if (lo !== null && hi !== null) return lo === hi ? lo : `${lo} – ${hi}`;
  if (lo !== null) return `${lo}+`;
  if (hi !== null) return `up to ${hi}`;
  return '';
}

export function normalizeJobType(raw: unknown): Job['type'] {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (/part/.test(s)) return 'Part-time';
  if (/contract|freelance|temp|intern/.test(s)) return 'Contract';
  return 'Full-time';
}

const REQ_HEADING =
  /(requirement|qualification|you (have|bring|are)|what you.ll bring|who you are|must have|nice to have|responsibilit)/i;
const BULLET_LINE = /^\s*(?:[•\-*▪–—]|\d+[.)])\s+(.+?)\s*$/;

/**
 * Requirement bullets from a posting: lines under a requirements-like
 * heading first, bare bullets as fallback. [] when none — the detail view
 * says so instead of inventing items.
 */
export function extractRequirements(description: string): string[] {
  const lines = description.split('\n').map(l => l.trim()).filter(Boolean);
  const bullets: string[] = [];
  let armed = false;
  for (const line of lines) {
    if (!armed) {
      if (REQ_HEADING.test(line) && line.length < 80) armed = true;
      continue;
    }
    const m = line.match(BULLET_LINE);
    if (m !== null && m[1].length > 3) {
      bullets.push(m[1].slice(0, 200));
      if (bullets.length >= 8) break;
    } else if (bullets.length > 0 && /^[A-Z][\w ,&()-]{2,40}$/.test(line)) {
      break;
    }
  }
  if (bullets.length > 0) return bullets;
  const loose: string[] = [];
  for (const line of lines) {
    const m = line.match(BULLET_LINE);
    if (m !== null && m[1].length > 20) {
      loose.push(m[1].slice(0, 200));
      if (loose.length >= 4) break;
    }
  }
  return loose;
}

/**
 * searchResults row → app Job (the schema match). Snapshot gaps stay gaps:
 * description '' and requirements [] render as honest "not provided" copy
 * in the detail view, never as invented text.
 */
export function resultToJob(r: SearchResultRow): Job {
  const s = r.jobSnapshot ?? {};
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const url = str(s.url);
  const description = postingText(s.description);
  return {
    id: r._id,
    title: str(s.title) || 'Untitled role',
    company: str(s.company) || '(unknown)',
    location: str(s.location),
    compensation: compensationFromK(s.salaryMinK, s.salaryMaxK),
    description,
    requirements: extractRequirements(description),
    match:
      typeof r.matchScore === 'number' && Number.isFinite(r.matchScore)
        ? Math.max(0, Math.min(100, Math.round(r.matchScore)))
        : 0,
    url,
    posted: '',
    type: 'Full-time',
    isSaved: false,
  };
}

type ExecStatus =
  | 'queued'
  | 'running'
  | 'submitted'
  | 'needs_user_action'
  | 'needs_review'
  | 'failed'
  | 'cancelled';

/** Convex exec state → demo pipeline display state (tested). */
export function execToDemo(s: string): AppStatus {
  switch (s as ExecStatus) {
    case 'failed':
      return 'REJECTED';
    case 'cancelled':
      return 'WITHDRAWN';
    default:
      return 'UNDER REVIEW';
  }
}

export interface ApplicationRow {
  _id: string;
  canonicalUrl: string;
  jobSnapshot: { title?: string; company?: string; logo?: string };
  status: string;
  createdAt: number;
  updatedAt?: number;
  archived?: boolean;
}

export function applicationToLocal(r: ApplicationRow): Application & { serverId: string } {
  return {
    id: r._id,
    serverId: r._id,
    jobId: r.canonicalUrl,
    title: r.jobSnapshot.title ?? r.canonicalUrl,
    company: r.jobSnapshot.company ?? '',
    logo: r.jobSnapshot.logo,
    appliedDate: day(r.createdAt),
    updatedAt: r.updatedAt !== undefined ? day(r.updatedAt) : undefined,
    archived: r.archived,
    status: execToDemo(r.status),
  };
}

export class HttpApplicationService implements ApplicationService {
  /** Local pre-check only — the server re-enforces cap+dupe atomically. */
  canApply(apps: Application[], jobId: string, today: string): DemoResult {
    return DemoApplicationService.canApply(apps, jobId, today);
  }

  advance(apps: Application[], id: string, today: string): Application[] {
    return DemoApplicationService.advance(apps, id, today);
  }

  withdraw(apps: Application[], id: string): Application[] {
    return DemoApplicationService.withdraw(apps, id);
  }

  nextStatus(s: AppStatus): AppStatus | null {
    return DemoApplicationService.nextStatus(s);
  }

  async listRemote(): Promise<(Application & { serverId: string })[]> {
    const body = await apiFetch<{ rows: ApplicationRow[] }>('/applications');
    return body.rows.map(applicationToLocal);
  }

  async createRemote(
    canonicalUrl: string,
    jobSnapshot: Record<string, unknown>,
    requestId: string,
  ): Promise<{ row: Application & { serverId: string }; message: string; duplicate: boolean }> {
    try {
      const body = await apiFetch<{
        application: ApplicationRow;
        duplicate: boolean;
      }>('/applications', {
        method: 'POST',
        // Key = (submission scope, job): distinct roles never collide within a
        // session, while a retried submit of the same role still dedupes
        // server-side (no second cap charge).
        body: {
          canonicalUrl,
          jobSnapshot,
          idempotencyKey: `app:${requestId}:${canonicalUrl}`,
        },
      });
      return {
        row: applicationToLocal(body.application),
        message: body.duplicate
          ? 'Already recorded for this role.'
          : 'Application submitted.',
        duplicate: body.duplicate,
      };
    } catch (err) {
      return {
        row: null as unknown as Application & { serverId: string },
        message: toUserMessage(err),
        duplicate: false,
      };
    }
  }

  async advanceRemote(
    serverId: string,
  ): Promise<{ row: (Application & { serverId: string }) | null; message: string }> {
    try {
      const body = await apiFetch<{
        application: ApplicationRow;
        terminal: boolean;
        held?: boolean;
      }>('/applications/advance', {
        method: 'PATCH',
        body: { applicationId: serverId },
      });
      if (body.held === true) {
        return {
          row: applicationToLocal(body.application),
          message:
            'Waiting on you: complete the browser step — nothing was auto-solved.',
        };
      }
      return {
        row: applicationToLocal(body.application),
        message: body.terminal ? 'Reached a terminal state.' : 'Advanced.',
      };
    } catch (err) {
      return { row: null, message: toUserMessage(err) };
    }
  }

  async withdrawRemote(serverId: string): Promise<string> {
    try {
      await apiFetch('/applications/withdraw', {
        method: 'POST',
        body: { applicationId: serverId },
      });
      return 'Withdrawn.';
    } catch (err) {
      return toUserMessage(err);
    }
  }

  async archiveRemote(serverId: string, archived: boolean): Promise<string> {
    try {
      await apiFetch('/applications/archive', {
        method: 'PATCH',
        body: { applicationId: serverId, archived },
      });
      return archived ? 'Archived.' : 'Restored.';
    } catch (err) {
      return toUserMessage(err);
    }
  }
}

export interface DraftRow {
  _id: string;
  to: string[];
  subject: string;
  bodyText?: string;
  updatedAt: number;
}

export function draftToMail(r: DraftRow): OutreachMail {
  return {
    id: r._id,
    jobTitle: '',
    company: '',
    to: r.to[0] ?? '',
    subject: r.subject,
    body: r.bodyText ?? '',
    sentAt: day(r.updatedAt),
  };
}

export const REPLY_MAP: Record<string, Reply['category']> = {
  interested: 'Interested',
  might_be_interested: 'Might be Interested',
  interview_scheduled: 'Interview Scheduled',
  generic_auto_response: 'Auto-response',
  not_interested: 'Not Interested',
  other: 'Might be Interested',
};

export interface ReplyRow {
  event: { _id: string; from?: string; subject?: string; occurredAt: number };
  classification: { category?: string } | null;
}

export function replyToLocal(r: ReplyRow): Reply {
  const cat =
    (r.classification?.category !== undefined
      ? REPLY_MAP[r.classification.category]
      : undefined) ?? 'Might be Interested';
  return {
    id: r.event._id,
    from: r.event.from ?? '(unknown)',
    subject: r.event.subject ?? '',
    body: '',
    at: day(r.event.occurredAt),
    category: cat,
  };
}

const NOTIFICATION_CATEGORY: Record<string, string> = {
  interested: 'Interested',
  might_be_interested: 'Might be Interested',
  interview_scheduled: 'Interview Scheduled',
  generic_auto_response: 'Auto-response',
  not_interested: 'Not Interested',
  other: 'Other',
};

export interface NotificationRow {
  _id: string;
  type?: string;
  title?: string;
  message?: string;
  createdAt?: number;
  event?: { from?: string; subject?: string; occurredAt?: number } | null;
  classification?: { category?: string } | null;
}

/** Keep only recruiter-reply notifications; search/application pings stay out
 *  of the dashboard banner (they belong to the bell, not the reply loop). */
export function notificationToHotReply(r: NotificationRow): HotReply | null {
  if (r.type !== 'recruiter_reply') return null;
  const raw = r.classification?.category ?? '';
  return {
    id: r._id,
    title: r.title ?? 'Recruiter reply',
    message: r.message ?? '',
    from: r.event?.from ?? '',
    subject: r.event?.subject ?? r.message ?? '',
    category: NOTIFICATION_CATEGORY[raw] ?? 'Recruiter reply',
    createdAt: r.createdAt ?? 0,
  };
}

export class HttpOutreachService implements OutreachService {
  canSend(sentCount: number, to: string): DemoResult {
    return DemoOutreachService.canSend(sentCount, to);
  }

  categories(): Reply['category'][] {
    return DemoOutreachService.categories();
  }

  async listRemote(): Promise<OutreachMail[]> {
    const body = await apiFetch<{ rows: DraftRow[] }>('/outreach/sends');
    return body.rows.map(draftToMail);
  }

  async sendRemote(m: DraftMail): Promise<{ row: OutreachMail | null; message: string }> {
    try {
      await apiFetch('/outreach/sends', {
        method: 'POST',
        body: { to: [m.to], subject: m.subject, bodyText: m.body },
      });
      return { row: null, message: 'Message queued for sending.' };
    } catch (err) {
      return { row: null, message: toUserMessage(err) };
    }
  }

  async repliesRemote(): Promise<Reply[]> {
    const body = await apiFetch<{ rows: ReplyRow[] }>('/inbox/replies?limit=50');
    return body.rows.map(replyToLocal);
  }

  async notificationsRemote(): Promise<HotReply[]> {
    const body = await apiFetch<{ rows: NotificationRow[] }>(
      '/inbox/notifications?unread=1&limit=5',
    );
    return body.rows
      .map(notificationToHotReply)
      .filter((r): r is HotReply => r !== null);
  }

  async markNotificationsReadRemote(): Promise<void> {
    await apiFetch('/inbox/notifications/read', { method: 'POST', body: {} });
  }
}

export interface CompanyDraftRow {
  _id: string;
  to?: string[];
  status: string;
  updatedAt: number;
}

export function draftToCompanyLog(company: string, r: CompanyDraftRow): CompanyLog {
  return {
    id: r._id,
    actor: 'You',
    target: r.to?.[0] ?? company,
    status: r.status === 'queued' ? 'APPROVED' : r.status === 'draft' ? 'PENDING' : 'FAILED',
    when: day(r.updatedAt),
  };
}

export class HttpCompanyService implements CompanyService {
  all(): CompanyProfile[] {
    // The research directory is editorial app copy (data/companies.ts), not
    // a server catalog. Company rows are derived from the live job feed.
    return [];
  }

  logs(_company: string): CompanyLog[] {
    return [];
  }

  async logsRemote(company: string): Promise<CompanyLog[]> {
    try {
      const body = await apiFetch<{ rows: CompanyDraftRow[] }>(
        `/companies/logs?company=${encodeURIComponent(company)}`,
      );
      if (body.rows.length === 0) return this.logs(company);
      return body.rows.map((r) => draftToCompanyLog(company, r));
    } catch {
      return this.logs(company);
    }
  }
}

/* ---------------- resumes (upload → server extraction → AI profile) ---------------- */

const RESUME_STAGE_VALUES = ['reading', 'ai_queued', 'ai_wait', 'ai_running', 'ready', 'failed'] as const;
const RESUME_STATUS_VALUES = ['pending', 'processing', 'completed', 'failed'] as const;

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const asNumber = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** Runtime guard for the AI-extracted profile blob — the wire is `v.any()`,
 *  so every field degrades to '' / [] instead of crashing the UI. */
function extractedToLocal(raw: unknown): ExtractedProfile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const objects = <T>(v: unknown, map: (o: Record<string, unknown>) => T): T[] =>
    Array.isArray(v)
      ? v
          .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
          .map(map)
      : [];
  return {
    fullName: asString(e.fullName),
    summary: asString(e.summary),
    country: asString(e.country),
    city: asString(e.city),
    skills: strings(e.skills),
    roles: strings(e.roles),
    links: objects(e.links, (o) => ({ label: asString(o.label), url: asString(o.url) })),
    experience: objects(e.experience, (o) => ({
      title: asString(o.title), company: asString(o.company),
      period: asString(o.period), description: asString(o.description),
    })),
    education: objects(e.education, (o) => ({
      school: asString(o.school), degree: asString(o.degree), period: asString(o.period),
    })),
  };
}

/** Server resume row → local record. Tolerates both wire shapes: `get`
 *  returns `resumeId` (whitelisted) and `attach` returns the raw row `_id`.
 *  Malformed rows (missing id or file name) degrade to null. */
export function resumeToLocal(raw: unknown): ResumeRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const resumeId = asString(r.resumeId) || asString(r._id);
  const fileName = asString(r.fileName);
  if (resumeId === '' || fileName === '') return null;
  const statusRaw = asString(r.extractionStatus);
  const stageRaw = asString(r.stage);
  const failureReason = asString(r.failureReason);
  return {
    resumeId,
    fileName,
    mimeType: asString(r.mimeType) || 'application/pdf',
    sizeBytes: asNumber(r.sizeBytes, 0),
    version: asNumber(r.version, 1),
    extractionStatus: (RESUME_STATUS_VALUES as readonly string[]).includes(statusRaw)
      ? (statusRaw as ResumeRecord['extractionStatus'])
      : 'pending',
    stage: (RESUME_STAGE_VALUES as readonly string[]).includes(stageRaw)
      ? (stageRaw as ResumeRecord['stage'])
      : null,
    failureReason: failureReason !== '' ? failureReason : null,
    extractedProfile: extractedToLocal(r.extractedProfile),
    createdAt: asNumber(r.createdAt, 0),
    updatedAt: asNumber(r.updatedAt, 0),
  };
}

export class HttpResumeService implements ResumeService {
  async latest(): Promise<ResumeRecord | null> {
    try {
      const body = await apiFetch<unknown>('/resumes/me');
      return resumeToLocal(body);
    } catch (err) {
      // No resume on file yet is a normal state, not an error.
      if ((err as { code?: unknown })?.code === 'NOT_FOUND') return null;
      throw err;
    }
  }

  async upload(file: File): Promise<{ record: ResumeRecord | null; message: string }> {
    try {
      const contentType = resumeMimeForFile(file);
      if (contentType === null) {
        return { record: null, message: 'Resume must be a PDF or DOCX — nothing was uploaded.' };
      }
      const { uploadUrl } = await apiFetch<{ uploadUrl: string }>('/resumes/upload-url', { method: 'POST' });
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!res.ok) return { record: null, message: 'Upload failed — nothing was saved.' };
      const parsed = (await res.json()) as { storageId?: unknown };
      if (typeof parsed.storageId !== 'string') {
        return { record: null, message: 'Upload failed — nothing was saved.' };
      }
      const body = await apiFetch<unknown>('/resumes', {
        method: 'POST',
        body: { storageId: parsed.storageId, fileName: file.name },
      });
      const record = resumeToLocal(body);
      return record === null
        ? { record: null, message: 'Upload failed — nothing was saved.' }
        : { record, message: 'Resume uploaded — reading it now.' };
    } catch (err) {
      return { record: null, message: toUserMessage(err) };
    }
  }
}

/* ---------------- profile enrichment (resume links → AI dossier) ---------- */

export class HttpProfileEnrichmentService implements ProfileEnrichmentService {
  async latest(): Promise<ProfileDossier | null> {
    const body = await apiFetch<unknown>('/profiles/me/enrich');
    return parseDossierEnvelope(body);
  }

  async start(): Promise<{ dossier: ProfileDossier | null; message: string }> {
    try {
      await apiFetch<unknown>('/profiles/me/enrich', { method: 'POST' });
    } catch (err) {
      return { dossier: null, message: toUserMessage(err) };
    }
    // The run exists now; a status read is best-effort so a slow first poll
    // never turns a successful start into an error message.
    let dossier: ProfileDossier | null = null;
    try {
      dossier = await this.latest();
    } catch {
      // The store hydrates on the next poll/login; keep the start message.
    }
    return {
      dossier,
      message: dossier === null
        ? 'Enrichment started — checking the first stage shortly.'
        : 'Enrichment started — reading your resume links and public profiles.',
    };
  }

  async paste(sourceId: string, text: string): Promise<{ dossier: ProfileDossier | null; message: string }> {
    try {
      await apiFetch<unknown>('/profiles/me/enrich/paste', {
        method: 'POST',
        body: { sourceId, text },
      });
    } catch (err) {
      return { dossier: null, message: toUserMessage(err) };
    }
    let dossier: ProfileDossier | null = null;
    try {
      dossier = await this.latest();
    } catch {
      // Rebuild still runs server-side; the next poll picks it up.
    }
    return {
      dossier,
      message: 'Pasted text saved — rebuilding your profile with it.',
    };
  }
}

/** Profile photo: a prepared JPEG blob → storage → users.avatarStorageId. */
export class HttpAvatarService {
  async upload(photo: Blob): Promise<{ avatarUrl: string | null; message: string }> {
    try {
      const { uploadUrl } = await apiFetch<{ uploadUrl: string }>('/profiles/avatar/upload-url', { method: 'POST' });
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': photo.type || 'image/jpeg' },
        body: photo,
      });
      if (!res.ok) return { avatarUrl: null, message: 'Photo upload failed — nothing was saved.' };
      const parsed = (await res.json()) as { storageId?: unknown };
      if (typeof parsed.storageId !== 'string') {
        return { avatarUrl: null, message: 'Photo upload failed — nothing was saved.' };
      }
      const body = await apiFetch<{ avatarUrl?: unknown }>('/profiles/avatar', {
        method: 'POST',
        body: { storageId: parsed.storageId },
      });
      const avatarUrl = typeof body.avatarUrl === 'string' && body.avatarUrl !== '' ? body.avatarUrl : null;
      return { avatarUrl, message: 'Profile photo updated.' };
    } catch (err) {
      return { avatarUrl: null, message: toUserMessage(err) };
    }
  }
}

// Compile-time interface conformance (structural — fails the build on drift).
const _jobCheck: JobService = new HttpJobService();
const _appCheck: ApplicationService = new HttpApplicationService();
const _outreachCheck: OutreachService = new HttpOutreachService();
const _companyCheck: CompanyService = new HttpCompanyService();
const _resumeCheck: ResumeService = new HttpResumeService();
const _enrichmentCheck: ProfileEnrichmentService = new HttpProfileEnrichmentService();
export { _jobCheck, _appCheck, _outreachCheck, _companyCheck, _resumeCheck, _enrichmentCheck };
