/**
 * Single salary source for every salary control (Jobs range filters, AI match
 * floor, Settings/onboarding preference list). Plain $k integers — labels are
 * derived here, never re-typed per surface, so the option sets can't drift.
 */
export const SALARY_FLOORS = [80, 100, 120, 150, 180, 200] as const;
export type SalaryFloor = (typeof SALARY_FLOORS)[number];

/** Range label: 120 → "$120k". */
export const salaryCompact = (k: number): string => `$${k}k`;

/** Open-ended preference label: 120 → "$120k+". */
export const salaryPlus = (k: number): string => `$${k}k+`;

/** Parse a "$NNNk+" preference back to its floor; null when unparseable. */
export function salaryFloorOf(label: string): SalaryFloor | null {
  const m = /^\$(\d+)k\+?$/i.exec(label.trim());
  if (m === null) return null;
  const n = Number.parseInt(m[1], 10);
  return (SALARY_FLOORS as readonly number[]).includes(n) ? (n as SalaryFloor) : null;
}
