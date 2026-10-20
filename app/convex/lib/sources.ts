/**
 * Hunt sources — where Scout looks for work.
 *
 * We do NOT scrape these sites. TinyFish Search reads the open web and
 * TinyFish Fetch reads the page, so a "source" is a SCOPE on the query:
 * one `site:` term per query (the provider ANDs multiple `site:` terms, so
 * one query = one source), plus a host allowlist so a run only ever
 * surfaces pages from the sources the user picked.
 *
 * Verified live against the provider (2026-10-21): `site:upwork.com`,
 * `site:fiverr.com`, `site:linkedin.com/jobs/view`, `site:naukri.com`,
 * `site:reddit.com/r/forhire` and every ATS host below scope cleanly and
 * return INDIVIDUAL postings (not board home pages). `-site:reddit.com`
 * excludes cleanly. The documented-looking `excludeDomains` parameter is
 * ignored by the API, so exclusion is done with the `-site:` operator.
 *
 * `postingPaths` marks the URL shapes that are one real opportunity. The
 * discovery stage drops everything else (board home pages, company
 * landing pages, locale-prefixed dead paths).
 */

export type SourceFamily = 'ats' | 'board' | 'marketplace' | 'community';

export interface HuntSource {
  key: string;
  label: string;
  family: SourceFamily;
  /** Search scope appended to the hunt query. */
  scope: string;
  /** Host suffixes accepted from this source. */
  hosts: string[];
  /** Path fragments that indicate an individual posting (empty = any path). */
  postingPaths: string[];
  /** Extra words appended to the query to shape the result. */
  queryHint: string;
  kind: 'freelance' | 'jobs';
  /** Host exposes list pages only — the agent splitter turns one into N leads. */
  listPage?: boolean;
}

/* ------------------------------- ATS ------------------------------- */
/* Applicant tracking systems: one public job page per role, no login,
   no anti-bot walls — the highest-signal, most-fetchable sources we have. */
const ATS_SOURCES: readonly HuntSource[] = [
  { key: 'greenhouse', label: 'Greenhouse', family: 'ats', scope: 'site:job-boards.greenhouse.io', hosts: ['job-boards.greenhouse.io'], postingPaths: ['/jobs/'], queryHint: '', kind: 'jobs' },
  { key: 'lever', label: 'Lever', family: 'ats', scope: 'site:jobs.lever.co', hosts: ['jobs.lever.co'], postingPaths: [], queryHint: '', kind: 'jobs' },
  { key: 'ashby', label: 'Ashby', family: 'ats', scope: 'site:jobs.ashbyhq.com', hosts: ['jobs.ashbyhq.com'], postingPaths: [], queryHint: '', kind: 'jobs' },
  { key: 'workable', label: 'Workable', family: 'ats', scope: 'site:apply.workable.com', hosts: ['apply.workable.com'], postingPaths: ['/j/'], queryHint: '', kind: 'jobs' },
  { key: 'recruitee', label: 'Recruitee', family: 'ats', scope: 'site:recruitee.com', hosts: ['recruitee.com'], postingPaths: ['/o/'], queryHint: '', kind: 'jobs' },
  { key: 'teamtailor', label: 'Teamtailor', family: 'ats', scope: 'site:teamtailor.com', hosts: ['teamtailor.com'], postingPaths: ['/jobs/'], queryHint: '', kind: 'jobs' },
  { key: 'pinpoint', label: 'Pinpoint', family: 'ats', scope: 'site:pinpointhq.com', hosts: ['pinpointhq.com'], postingPaths: ['/postings/'], queryHint: '', kind: 'jobs' },
  { key: 'icims', label: 'iCIMS', family: 'ats', scope: 'site:icims.com', hosts: ['icims.com'], postingPaths: ['/jobs/'], queryHint: '', kind: 'jobs' },
  { key: 'breezy', label: 'Breezy HR', family: 'ats', scope: 'site:breezy.hr', hosts: ['breezy.hr'], postingPaths: ['/p/'], queryHint: '', kind: 'jobs' },
  { key: 'rippling', label: 'Rippling', family: 'ats', scope: 'site:ats.rippling.com', hosts: ['ats.rippling.com'], postingPaths: ['/jobs/'], queryHint: '', kind: 'jobs' },
  { key: 'gem', label: 'Gem', family: 'ats', scope: 'site:jobs.gem.com', hosts: ['jobs.gem.com'], postingPaths: [], queryHint: '', kind: 'jobs' },
  { key: 'workday', label: 'Workday', family: 'ats', scope: 'site:myworkdayjobs.com', hosts: ['myworkdayjobs.com'], postingPaths: ['/job/'], queryHint: '', kind: 'jobs' },
];

/* ------------------------------ Boards ----------------------------- */
const BOARD_SOURCES: readonly HuntSource[] = [
  { key: 'reddit', label: 'Reddit r/forhire', family: 'community', scope: 'site:reddit.com/r/forhire', hosts: ['reddit.com'], postingPaths: ['/comments/'], queryHint: 'hiring', kind: 'freelance' },
  { key: 'freelancer', label: 'Freelancer', family: 'marketplace', scope: 'site:freelancer.com/projects', hosts: ['freelancer.com'], postingPaths: ['/projects/'], queryHint: 'looking for', kind: 'freelance' },
  { key: 'remoteok', label: 'Remote OK', family: 'board', scope: 'site:remoteok.com', hosts: ['remoteok.com'], postingPaths: ['/remote-jobs/'], queryHint: 'remote', kind: 'jobs' },
  { key: 'linkedin', label: 'LinkedIn', family: 'board', scope: 'site:linkedin.com/jobs/view', hosts: ['linkedin.com'], postingPaths: ['/jobs/view/'], queryHint: '', kind: 'jobs' },
  { key: 'naukri', label: 'Naukri', family: 'board', scope: 'site:naukri.com/job-listings', hosts: ['naukri.com'], postingPaths: ['/job-listings'], queryHint: '', kind: 'jobs' },
  { key: 'ycombinator', label: 'Y Combinator', family: 'board', scope: 'site:ycombinator.com/jobs', hosts: ['ycombinator.com'], postingPaths: [], queryHint: '', kind: 'jobs', listPage: true },
  { key: 'wellfound', label: 'Wellfound', family: 'board', scope: 'site:wellfound.com/jobs', hosts: ['wellfound.com'], postingPaths: [], queryHint: '', kind: 'jobs', listPage: true },
  { key: 'weworkremotely', label: 'We Work Remotely', family: 'board', scope: 'site:weworkremotely.com/remote-jobs', hosts: ['weworkremotely.com'], postingPaths: [], queryHint: '', kind: 'jobs', listPage: true },
];

/* --------------------------- Marketplaces -------------------------- */
/* These boards only expose SEO category pages to search engines, so Scout
   may find pages there but honestly skips the ones that aren't a single
   opportunity (the agent splitter is the way in). */
const MARKETPLACE_SOURCES: readonly HuntSource[] = [
  { key: 'upwork', label: 'Upwork', family: 'marketplace', scope: 'site:upwork.com/freelance-jobs', hosts: ['upwork.com'], postingPaths: [], queryHint: '', kind: 'freelance', listPage: true },
  { key: 'fiverr', label: 'Fiverr', family: 'marketplace', scope: 'site:fiverr.com/gigs', hosts: ['fiverr.com'], postingPaths: [], queryHint: '', kind: 'freelance', listPage: true },
];

export const SOURCES: readonly HuntSource[] = [...ATS_SOURCES, ...BOARD_SOURCES, ...MARKETPLACE_SOURCES];

/** Sources offered first in the picker: one community, one marketplace, one ATS. */
export const DEFAULT_SOURCE_KEYS: readonly string[] = ['reddit', 'freelancer', 'greenhouse'];

export function sourceByKey(key: string): HuntSource | null {
  return SOURCES.find(s => s.key === key) ?? null;
}

/* --------------------------- Watchlist ----------------------------- */
/* Companies to watch: a scoped query per company board
   (`site:job-boards.greenhouse.io/stripe`). Key format: `w:<ats>:<slug>`. */
export const WATCHLIST: readonly { key: string; label: string; ats: string; slug: string; host: string }[] = [
  { key: 'w:greenhouse:stripe', label: 'Stripe', ats: 'greenhouse', slug: 'stripe', host: 'job-boards.greenhouse.io' },
  { key: 'w:greenhouse:anthropic', label: 'Anthropic', ats: 'greenhouse', slug: 'anthropic', host: 'job-boards.greenhouse.io' },
  { key: 'w:greenhouse:figma', label: 'Figma', ats: 'greenhouse', slug: 'figma', host: 'job-boards.greenhouse.io' },
  { key: 'w:greenhouse:cloudflare', label: 'Cloudflare', ats: 'greenhouse', slug: 'cloudflare', host: 'job-boards.greenhouse.io' },
  { key: 'w:greenhouse:datadog', label: 'Datadog', ats: 'greenhouse', slug: 'datadog', host: 'job-boards.greenhouse.io' },
  { key: 'w:greenhouse:discord', label: 'Discord', ats: 'greenhouse', slug: 'discord', host: 'job-boards.greenhouse.io' },
  { key: 'w:greenhouse:robinhood', label: 'Robinhood', ats: 'greenhouse', slug: 'robinhood', host: 'job-boards.greenhouse.io' },
  { key: 'w:greenhouse:duolingo', label: 'Duolingo', ats: 'greenhouse', slug: 'duolingo', host: 'job-boards.greenhouse.io' },
  { key: 'w:ashby:openai', label: 'OpenAI', ats: 'ashby', slug: 'openai', host: 'jobs.ashbyhq.com' },
  { key: 'w:ashby:notion', label: 'Notion', ats: 'ashby', slug: 'notion', host: 'jobs.ashbyhq.com' },
  { key: 'w:ashby:ramp', label: 'Ramp', ats: 'ashby', slug: 'ramp', host: 'jobs.ashbyhq.com' },
  { key: 'w:ashby:cursor', label: 'Cursor', ats: 'ashby', slug: 'cursor', host: 'jobs.ashbyhq.com' },
  { key: 'w:ashby:perplexity', label: 'Perplexity', ats: 'ashby', slug: 'perplexity', host: 'jobs.ashbyhq.com' },
  { key: 'w:lever:xsolla', label: 'Xsolla', ats: 'lever', slug: 'xsolla', host: 'jobs.lever.co' },
  { key: 'w:lever:jobgether', label: 'Jobgether', ats: 'lever', slug: 'jobgether', host: 'jobs.lever.co' },
];

export function watchlistByKey(key: string): (typeof WATCHLIST)[number] | null {
  return WATCHLIST.find(w => w.key === key) ?? null;
}

/** Resolve caller-supplied keys to known sources (registry key or a
 *  watchlist entry). Unknown keys are dropped. */
export function resolveSources(keys: readonly string[] | undefined): HuntSource[] {
  if (keys === undefined) return [];
  const out: HuntSource[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const s = sourceByKey(key) ?? watchlistSource(key);
    if (s === null || seen.has(s.key)) continue;
    seen.add(s.key);
    out.push(s);
  }
  return out;
}

function watchlistSource(key: string): HuntSource | null {
  if (!key.startsWith('w:')) return null;
  const w = watchlistByKey(key);
  if (w === null) return null;
  const base = sourceByKey(w.ats);
  return {
    key: w.key,
    label: w.label,
    family: 'ats',
    scope: `site:${w.host}/${w.slug}`,
    hosts: [w.host],
    postingPaths: base?.postingPaths ?? [],
    queryHint: base?.queryHint ?? '',
    kind: 'jobs',
  };
}

/** True when the URL's host belongs to one of the run's sources. */
export function hostAllowed(url: string, sources: readonly HuntSource[]): boolean {
  if (sources.length === 0) return true;          // no scoping → any public page
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return sources.some(s => s.hosts.some(h => host === h || host.endsWith('.' + h)));
}

/**
 * True when the URL looks like ONE opportunity on this source.
 *
 * Rules (all from observed page shapes):
 * - the path must contain one of the source's posting markers;
 * - locale-prefixed paths (`/fr-FR/`, `/de-DE/`) are dead links on some
 *   ATSs (Workday) and are always dropped;
 * - a bare board host (no path) is a board home, never a posting.
 */
export function isPostingUrl(url: string, source: HuntSource): boolean {
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  if (path === '' || path === '/') return false;
  // A locale prefix ("/fr-FR/") is legitimate — the marker still has to
  // match underneath it, so strip it before looking for the posting shape.
  path = path.replace(/^\/[a-z]{2}-[A-Z]{2}(?=\/)/, '');
  if (source.postingPaths.length === 0) {
    // No marker known for this source: accept a path that looks like a
    // posting (has a slug-ish segment) rather than a board home.
    return path.split('/').filter(Boolean).length >= 2;
  }
  return source.postingPaths.some(p => path.includes(p));
}
