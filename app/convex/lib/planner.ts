import type { HuntSource } from './sources.ts';

/**
 * Query planner — deterministic, no LLM, honest about the ICP.
 *
 * With sources: one scoped query per source (the search provider ANDs
 * multiple `site:` terms, so two sources can never share a query).
 * Without sources: the generic three-query plan (ICP service, ICP keyword,
 * budget probe) so a hunt still works on the whole open web.
 */
export function planQueries(
  query: string,
  profile: { services?: string[]; industries?: string[]; keywords?: string[] } | null,
  sources: readonly HuntSource[] = [],
): string[] {
  const q = (query ?? '').trim();
  if (sources.length > 0) {
    const core = q === '' ? 'freelance project' : q;
    return sources.map(s => `${core} ${s.scope}`.replace(/\s+/g, ' ').trim());
  }
  const year = new Date().getFullYear();
  const service = profile?.services?.[0];
  const industry = profile?.industries?.[0];
  const keyword = profile?.keywords?.[0];

  const out = [
    `"${q}" ${year}`,
    service
      ? `freelance ${service} ${industry ?? ''} ${q}`.replace(/\s+/g, ' ').trim()
      : `freelance ${q} ${industry ?? ''}`.replace(/\s+/g, ' ').trim(),
    keyword ? `${keyword} ${year}` : `${q} project budget "$"`,
  ];
  return out.slice(0, 3);
}
