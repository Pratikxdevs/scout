import type { Job } from '../types';

/** Runtime guard at the data boundary — drops malformed rows before render. */
export function isValidJob(v: unknown): v is Job {
  if (typeof v !== 'object' || v === null) return false;
  const j = v as Record<string, unknown>;
  return (
    typeof j.id === 'string' &&
    typeof j.title === 'string' &&
    typeof j.company === 'string' &&
    typeof j.location === 'string' &&
    typeof j.compensation === 'string' &&
    typeof j.description === 'string' &&
    Array.isArray(j.requirements) &&
    typeof j.match === 'number' &&
    typeof j.url === 'string' &&
    typeof j.posted === 'string' &&
    (j.type === 'Full-time' || j.type === 'Contract' || j.type === 'Part-time')
  );
}

export function validJobs(rows: unknown): Job[] {
  return Array.isArray(rows) ? rows.filter(isValidJob) : [];
}

/** Shared email rule for login + signup (trims first). */
export function isValidEmail(v: string): boolean {
  const s = v.trim();
  if (!s || s.includes(' ') || s.length > 254) return false;
  const at = s.indexOf('@');
  if (at < 1 || at !== s.lastIndexOf('@')) return false;
  const domain = s.slice(at + 1);
  return domain.includes('.') && domain.length >= 3;
}
