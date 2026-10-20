/**
 * Relative dates — "2mo ago", "3 days ago", "posted 2 weeks ago".
 *
 * Boards rarely print a real date; they print an age. Parsing it is what
 * makes the freshness weight (20% of the score) honest instead of always
 * zero — and it is still a fact from the page, never an assumption.
 */

const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  minutes: 60_000,
  min: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  hr: 3_600_000,
  day: 86_400_000,
  days: 86_400_000,
  week: 604_800_000,
  weeks: 604_800_000,
  month: 2_592_000_000,
  months: 2_592_000_000,
  mo: 2_592_000_000,
  year: 31_536_000_000,
  years: 31_536_000_000,
  yr: 31_536_000_000,
  // compact forms boards print: "3d ago", "2w ago", "5h ago", "1y ago"
  d: 86_400_000,
  w: 604_800_000,
  h: 3_600_000,
  y: 31_536_000_000,
  m: 2_592_000_000,   // "3m ago" on a post means months
};

const RELATIVE_RE = /(\d{1,3})\s*(minute|minutes|mins|min|hour|hours|hr|day|days|week|weeks|month|months|mo|year|years|yr|[dwmy])\s*ago\b/i;

/**
 * Find a relative age in the page text and return the timestamp it
 * implies, or null when the page states no age.
 */
export function relativeDateIn(text: string, now: number = Date.now()): number | null {
  const m = RELATIVE_RE.exec(text);
  if (m === null) return null;
  const amount = Number(m[1]);
  const unit = UNIT_MS[(m[2] ?? '').toLowerCase()];
  if (!Number.isFinite(amount) || unit === undefined) return null;
  if (amount <= 0) return null;
  return now - amount * unit;
}

/** True when the string looks like an age ("3d ago") rather than a date. */
export function isRelativeDate(value: string): boolean {
  return RELATIVE_RE.test(value);
}
