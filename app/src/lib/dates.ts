/**
 * Date helpers for the MM/DD/YY strings carried by local rows and the
 * server mappers (appliedDate, updatedAt, savedAt). Pure — no React.
 */
import type { Application } from '../types';

export function parseMDY(s: string): number {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s.trim());
  if (!m) return NaN;
  const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
  return new Date(y, +m[1] - 1, +m[2]).getTime();
}

export function fmtLong(s: string): string {
  const t = parseMDY(s);
  return isNaN(t) ? s : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtShort(s: string): string {
  const t = parseMDY(s);
  return isNaN(t) ? '' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ago(s?: string): string {
  if (!s) return '';
  const t = parseMDY(s);
  if (isNaN(t)) return '';
  const d = Math.floor((Date.now() - t) / 864e5);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return fmtLong(s);
}

/** Applications submitted in the last seven days (real dates only). */
export function applicationsThisWeek(apps: Application[], now = Date.now()): number {
  const floor = now - 7 * 864e5;
  return apps.filter((a) => {
    const t = parseMDY(a.appliedDate);
    return !isNaN(t) && t >= floor && t <= now;
  }).length;
}

/** Average days from application to first recorded response, or null. */
export function avgResponseDays(apps: Application[]): number | null {
  const days = apps
    .filter((a) => a.updatedAt && a.status !== 'UNDER REVIEW' && a.status !== 'WITHDRAWN')
    .map((a) => {
      const from = parseMDY(a.appliedDate);
      const to = parseMDY(a.updatedAt as string);
      return isNaN(from) || isNaN(to) ? null : Math.max(0, (to - from) / 864e5);
    })
    .filter((d): d is number => d !== null);
  if (days.length === 0) return null;
  const avg = days.reduce((sum, d) => sum + d, 0) / days.length;
  return Math.round(avg * 10) / 10;
}
