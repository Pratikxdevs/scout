/**
 * Local service layer — typed interfaces + pure logic. This path runs with
 * empty sources when no backend is configured (mock data deleted, W10).
 * Gates, filters, ranking, and honesty copy are fully tested and shared.
 * Each `DemoXService` has an HTTP implementation behind the same interface
 * (services/http.ts) that the store selects when a backend is configured.
 */
import type { Application, AppStatus, CompanyLog, DemoResult, Job, ProfileDossier, ReplyCategory, ResumeRecord } from '../types.ts';
import { REPLY_CATEGORIES } from '../types.ts';

export const APPLY_CAP = 5;
export const OUTREACH_CAP = 50;

/* monotonic demo ids — no Math.random/Date.now in UI code */
let seq = 0;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

/** Funnel derived from live state — no magic numbers (the old +13 is gone, W5).
 *  Fetched == Filtered until scraper→jobs wiring (T21/W6) differentiates them. */
export function selectFunnel(jobs: Job[], apps: Application[]): { name: string; value: number }[] {
  const fetched = jobs.length;
  const interviews = apps.filter(a => a.status === 'INTERVIEW SET').length;
  const offers = apps.filter(a => a.status === 'OFFERED').length;
  return [
    { name: 'Fetched', value: fetched },
    { name: 'Filtered', value: jobs.length },
    { name: 'Applied', value: apps.length },
    { name: 'Interviews', value: interviews },
    { name: 'Offers', value: offers },
  ];
}

/** Plain text search for palettes — top-N matches. */
export function searchJobs(jobs: Job[], q: string, limit = 5): Job[] {
  const s = q.toLowerCase().trim();
  if (!s) return jobs.slice(0, 4);
  return jobs
    .filter(j => (j.title + ' ' + j.company + ' ' + j.location + ' ' + j.requirements.join(' ')).toLowerCase().includes(s))
    .slice(0, limit);
}

/* ---------------- jobs ---------------- */
export interface JobQuery {
  search: string; keyword: string; location: string;
  includeRemote: boolean; savedOnly: boolean;
  sort: 'match' | 'new';
  salaryMin?: number | null; salaryMax?: number | null;
}

/** Lower bound in $k parsed from "$150k – $180k" style strings, NaN when absent. */
export function salaryFloor(compensation: string): number {
  const m = compensation.replace(/,/g, '').match(/\$(\d+)\s*k/i);
  return m ? parseInt(m[1], 10) : NaN;
}
export interface JobService {
  all(): Job[];
  query(jobs: Job[], q: JobQuery): Job[];
  paginate<T>(rows: T[], page: number, perPage: number): { rows: T[]; total: number; pages: number };
  rank(jobs: Job[], skills: string): { job: Job; score10: string; matched: string[]; missing: string[] }[];
}
export const DemoJobService: JobService = {
  // No source in demo mode (mock deleted W10) — callers pass live rows in.
  all: () => [],
  query(jobs, q) {
    const s = q.search.toLowerCase();
    return jobs
      .filter(j => {
        if (q.savedOnly && !j.isSaved) return false;
        if (s && !(j.title + ' ' + j.company + ' ' + j.description).toLowerCase().includes(s)) return false;
        if (q.keyword && !(j.title + ' ' + j.company + ' ' + j.requirements.join(' ')).toLowerCase().includes(q.keyword.toLowerCase())) return false;
        if (q.location && !j.location.toLowerCase().includes(q.location.toLowerCase())) return false;
        if (!q.includeRemote && j.location.toLowerCase().includes('remote')) return false;
        if (q.salaryMin != null || q.salaryMax != null) {
          const floor = salaryFloor(j.compensation);
          if (Number.isNaN(floor)) return false;
          if (q.salaryMin != null && floor < q.salaryMin) return false;
          if (q.salaryMax != null && floor > q.salaryMax) return false;
        }
        return true;
      })
      .sort((a, b) => (q.sort === 'match' ? b.match - a.match : b.id.localeCompare(a.id)));
  },
  paginate(rows, page, perPage) {
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const safe = Math.min(Math.max(1, page), pages);
    return { rows: rows.slice((safe - 1) * perPage, safe * perPage), total, pages };
  },
  rank(jobs, skills) {
    const sk = skills.toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
    return jobs
      .map(job => {
        const hay = (job.title + ' ' + job.requirements.join(' ')).toLowerCase();
        const matched = sk.filter(s => s && hay.includes(s));
        const missing = sk.filter(s => s && !hay.includes(s)).slice(0, 3);
        return { job, score10: (job.match / 10).toFixed(1), matched, missing };
      })
      .sort((a, b) => b.job.match - a.job.match);
  },
};

/**
 * Skill-overlap match score (0–100) for live scraper rows, which arrive
 * with no score. Heuristic, shown as-is: 60 base (a live role is at least
 * plausible) + up to 40 for profile-skill overlap across title,
 * requirements, and description. No skills on the profile → 60 flat.
 */
export function scoreMatch(title: string, requirements: string[], description: string, skillsCsv: string): number {
  const sk = skillsCsv.toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
  if (sk.length === 0) return 60;
  const hay = (title + ' ' + requirements.join(' ') + ' ' + description).toLowerCase();
  const matched = sk.filter(s => s && hay.includes(s)).length;
  return Math.round(60 + (40 * matched) / sk.length);
}

/* ---------------- applications ---------------- */
const NEXT: Record<AppStatus, AppStatus | null> = {
  'UNDER REVIEW': 'INTERVIEW SET', 'INTERVIEW SET': 'OFFERED', OFFERED: null, REJECTED: null, WITHDRAWN: null,
};
export interface ApplicationService {
  canApply(apps: Application[], jobId: string, today: string): DemoResult;
  advance(apps: Application[], id: string, today: string): Application[];
  withdraw(apps: Application[], id: string): Application[];
  nextStatus(s: AppStatus): AppStatus | null;
}
export const DemoApplicationService: ApplicationService = {
  canApply: (apps, jobId, today) => {
    if (apps.filter(a => a.appliedDate === today).length >= APPLY_CAP)
      return { ok: false, message: `Daily cap reached (${APPLY_CAP}/day). Nothing was submitted.` };
    if (apps.some(a => a.jobId === jobId)) return { ok: false, message: 'Already recorded for this role.' };
    return { ok: true, message: 'Application recorded locally — not submitted anywhere.' };
  },
  advance: (apps, id, today) => apps.map(a => (a.id === id && NEXT[a.status] ? { ...a, status: NEXT[a.status] as AppStatus, updatedAt: today } : a)),
  withdraw: (apps, id) => apps.map(a => (a.id === id ? { ...a, status: 'WITHDRAWN' as AppStatus } : a)),
  nextStatus: s => NEXT[s],
};

/* ---------------- outreach / inbox ---------------- */
export interface OutreachService {
  canSend(sentCount: number, to: string): DemoResult;
  categories(): ReplyCategory[];
}
const CATS: ReplyCategory[] = [...REPLY_CATEGORIES];
export const DemoOutreachService: OutreachService = {
  canSend: (n, to) => {
    if (n >= OUTREACH_CAP) return { ok: false, message: `Daily cap reached (${OUTREACH_CAP}/day). Nothing was emailed.` };
    if (!to.includes('@')) return { ok: false, message: 'Enter a valid recruiter email.' };
    return { ok: true, message: 'Message recorded locally — not emailed.' };
  },
  categories: () => CATS,
};

/* ---------------- companies ---------------- */
/** Curated research-profile shape (see data/companies.ts). */
export interface CompanyProfile {
  name: string; logo?: string; sector: string; segment: string;
  staff?: string; blurb?: string; hq?: string;
  website?: string; founded?: string; tags?: string[]; about?: string;
}
export interface CompanyService {
  all(): CompanyProfile[];
  logs(company: string): CompanyLog[];
}
export const DemoCompanyService: CompanyService = {
  all: () => [],
  logs: () => [],
};

/* ---------------- resumes ---------------- */
/** Resume upload + reading pipeline (server extracts the text, an AI model
 *  drafts the profile). Demo has no server, so nothing is uploaded or read. */
export interface ResumeService {
  /** Active resume row, or null when none is on file. */
  latest(): Promise<ResumeRecord | null>;
  /** Upload a resume PDF/DOCX and kick the reading pipeline; returns the fresh row. */
  upload(file: File): Promise<{ record: ResumeRecord | null; message: string }>;
}
/** Demo resume flow: the file never leaves this browser, and the message
 *  says exactly that. The wizard keeps the file name locally so the UI
 *  still makes sense offline. */
export const DemoResumeService: ResumeService = {
  async latest() {
    return null;
  },
  async upload(file) {
    return {
      record: null,
      message: `"${file.name}" is kept in this browser only — not uploaded or read by AI.`,
    };
  },
};

/* ---------------- profile enrichment ---------------- */
/** Public-link enrichment + AI dossier. It needs a server (DNS/SSRF guards,
 *  Groq key, storage); demo mode says that plainly and never fakes a dossier. */
export interface ProfileEnrichmentService {
  /** Active or latest dossier, or null when none was started. */
  latest(): Promise<ProfileDossier | null>;
  /** Start/rebuild the run and return the fresh state + honest message. */
  start(): Promise<{ dossier: ProfileDossier | null; message: string }>;
  /** Manual fallback for a blocked source (e.g. LinkedIn). */
  paste(sourceId: string, text: string): Promise<{ dossier: ProfileDossier | null; message: string }>;
}
export const DemoProfileEnrichmentService: ProfileEnrichmentService = {
  async latest() {
    return null;
  },
  async start() {
    return {
      dossier: null,
      message: 'Profile enrichment needs the backend — no public profile was fetched in local mode.',
    };
  },
  async paste() {
    return {
      dossier: null,
      message: 'Manual profile text needs the backend — nothing was saved in local mode.',
    };
  },
};

/* ---------------- export ---------------- */
// KEEP: seam for GET /api/v1/jobs/export (server exportView) — Phase 4 swaps
// each DemoXService for HTTP behind the same interface. Zero callers until wired.
export function jobsToCSV(jobs: Job[]): string {
  const head = ['id', 'title', 'company', 'location', 'salary', 'url'].join(',');
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [head, ...jobs.map(j => [j.id, esc(j.title), esc(j.company), esc(j.location), esc(j.compensation), j.url].join(','))].join('\n');
}
export function jobsToJSON(jobs: Job[]): string {
  return JSON.stringify(jobs.map(j => ({ id: j.id, title: j.title, company: j.company, location: j.location, salary: j.compensation, url: j.url })), null, 2);
}
