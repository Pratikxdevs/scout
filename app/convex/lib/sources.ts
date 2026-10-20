/**
 * Hunt sources — where Scout looks for freelance work.
 *
 * We do NOT scrape these sites. TinyFish Search reads the open web and
 * TinyFish Fetch reads the page, so a "source" is a SCOPE on the query:
 * one `site:` term per query (the provider ANDs multiple site: terms, so
 * one query = one source), plus a host allowlist so a run only ever
 * surfaces pages from the sources the user picked.
 *
 * Verified live against the provider: `site:upwork.com`, `site:fiverr.com`,
 * `site:linkedin.com/jobs`, `site:naukri.com`, `site:reddit.com` all scope
 * cleanly; `-site:reddit.com` excludes cleanly.
 */
export interface HuntSource {
  key: string;
  label: string;
  /** Search scope appended to the hunt query. */
  scope: string;
  /** Host suffixes accepted from this source. */
  hosts: string[];
  kind: 'freelance' | 'jobs';
}

export const SOURCES: readonly HuntSource[] = [
  // Post-shaped scopes (verified live): these return INDIVIDUAL postings, so
  // one page = one lead with its own evidence.
  { key: 'reddit', label: 'Reddit', scope: 'site:reddit.com/r/forhire', hosts: ['reddit.com'], kind: 'freelance' },
  { key: 'freelancer', label: 'Freelancer', scope: 'site:freelancer.com/projects', hosts: ['freelancer.com'], kind: 'freelance' },
  { key: 'naukri', label: 'Naukri', scope: 'site:naukri.com/job-listings', hosts: ['naukri.com'], kind: 'jobs' },
  { key: 'linkedin', label: 'LinkedIn', scope: 'site:linkedin.com/jobs/view', hosts: ['linkedin.com'], kind: 'jobs' },
  // Board pages: the boards only expose SEO category/index pages to search
  // engines, so Scout may find pages there but honestly skips the ones that
  // are not a single opportunity.
  { key: 'upwork', label: 'Upwork', scope: 'site:upwork.com/freelance-jobs', hosts: ['upwork.com'], kind: 'freelance' },
  { key: 'fiverr', label: 'Fiverr', scope: 'site:fiverr.com/gigs', hosts: ['fiverr.com'], kind: 'freelance' },
];

/** Sources offered first in the picker (freelance-first, then jobs). */
export const DEFAULT_SOURCE_KEYS: readonly string[] = ['reddit', 'freelancer', 'linkedin'];

export function sourceByKey(key: string): HuntSource | null {
  return SOURCES.find(s => s.key === key) ?? null;
}

/** Resolve caller-supplied keys to known sources (unknown keys dropped). */
export function resolveSources(keys: readonly string[] | undefined): HuntSource[] {
  if (keys === undefined) return [];
  const out: HuntSource[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const s = sourceByKey(key);
    if (s === null || seen.has(s.key)) continue;
    seen.add(s.key);
    out.push(s);
  }
  return out;
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
