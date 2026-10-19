/**
 * Pure mapping between the app's local `Profile` shape and the server's
 * profiles row (`/api/v1/profiles/me`). Kept out of the store/UI so the
 * rules are unit-testable and no file re-implements them.
 *
 * Local (types.ts): comma-joined skills string, roles array, work-type
 * label ("Remote"), display salary string ("$130k+"), boolean remote flag.
 * Server (convex/schema.ts): skills array, preferredRoles array,
 * remotePreference enum ("remote"|"hybrid"|"onsite"|"any"), salaryMin
 * number, headline, country (canonical country name), location (city text).
 */
import type { Profile } from '../types';
import { matchCountry } from './countries.ts';

export interface ServerProfile {
  fullName?: unknown;
  email?: unknown;
  headline?: unknown;
  country?: unknown;
  location?: unknown;
  skills?: unknown;
  preferredRoles?: unknown;
  remotePreference?: unknown;
  salaryMin?: unknown;
  avatarUrl?: unknown;
  onboardingCompleted?: unknown;
}

const WORK_TO_PREF: Record<string, 'remote' | 'hybrid' | 'onsite'> = {
  Remote: 'remote', Hybrid: 'hybrid', 'On-site': 'onsite',
};
const PREF_TO_WORK: Record<string, string> = {
  remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site',
};

/** "$130k+" / "$130,000" / "130k" → 130000. Undefined when not money-ish. */
export function salaryToMin(salary: string): number | undefined {
  const cleaned = salary.replace(/[$,\s]/g, '').toLowerCase();
  const m = /^(\d+(?:\.\d+)?)(k?)\+?$/.exec(cleaned);
  if (m === null) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return m[2] === 'k' ? Math.round(n * 1000) : Math.round(n);
}

/** 130000 → "$130k+" (the display format the wizard + Settings use). */
export function salaryFromMin(min: number): string {
  return `$${Math.round(min / 1000)}k+`;
}

/** Avatar initials: "Flow Tester" → "FT", "J. Carter" → "JC". */
export function initialsFor(name: string, fallback: string): string {
  const parts = name.trim().split(/\s+/).filter((s) => s !== '');
  if (parts.length === 0) return fallback;
  const first = (parts[0] ?? '')[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? '')[0] ?? '' : '';
  return (first + last).toUpperCase() || fallback;
}

const cleanList = (v: string[]): string[] =>
  v.map((s) => s.trim()).filter((s) => s !== '');

/** Local profile slice → server patch. Unmapped or blank keys are omitted
 *  so a PATCH never overwrites server fields the caller didn't touch —
 *  including fields the resume AI may have filled server-side. */
export function profilePatch(p: Partial<Profile>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (p.name !== undefined && p.name.trim() !== '') patch.fullName = p.name.trim();
  if (p.email !== undefined && p.email.trim() !== '') patch.email = p.email.trim();
  if (p.summary !== undefined) patch.headline = p.summary;
  if (p.country !== undefined && p.country.trim() !== '') patch.country = p.country.trim();
  if (p.city !== undefined && p.city.trim() !== '') patch.location = p.city.trim();
  if (p.roles !== undefined) {
    const roles = cleanList(p.roles);
    if (roles.length > 0) patch.preferredRoles = roles;
  }
  const pref = p.location !== undefined ? WORK_TO_PREF[p.location] : undefined;
  if (pref !== undefined) patch.remotePreference = pref;
  else if (p.remote === true) patch.remotePreference = 'remote';
  if (p.salary !== undefined) {
    const min = salaryToMin(p.salary);
    if (min !== undefined) patch.salaryMin = min;
  }
  if (p.skills !== undefined) {
    const skills = cleanList(p.skills.split(','));
    if (skills.length > 0) patch.skills = skills;
  }
  return patch;
}

/** Server row → local profile slice. Only meaningful (non-empty, well-typed)
 *  server values map over; everything else is omitted so local state and
 *  defaults are never blanked by an empty server row. */
export function mergeServerProfile(server: unknown): Partial<Profile> {
  const out: Partial<Profile> = {};
  if (typeof server !== 'object' || server === null) return out;
  const s = server as ServerProfile;
  const text = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v : undefined;
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [];

  const name = text(s.fullName);
  if (name !== undefined) out.name = name;
  const email = text(s.email);
  if (email !== undefined) out.email = email;
  const headline = text(s.headline);
  if (headline !== undefined) out.summary = headline;
  // Country normalizes to the vendored canonical list; raw text is kept
  // when unmatched (the select shows it as a custom option).
  const country = text(s.country);
  if (country !== undefined) out.country = matchCountry(country) || country;
  const location = text(s.location);
  if (location !== undefined) out.city = location;
  const skills = list(s.skills);
  if (skills.length > 0) out.skills = skills.join(', ');
  const roles = list(s.preferredRoles);
  if (roles.length > 0) out.roles = roles;
  const work = text(s.remotePreference) !== undefined ? PREF_TO_WORK[text(s.remotePreference) ?? ''] : undefined;
  if (work !== undefined) {
    out.location = work;
    out.remote = work === 'Remote';
  }
  if (typeof s.salaryMin === 'number' && Number.isFinite(s.salaryMin) && s.salaryMin > 0) {
    out.salary = salaryFromMin(s.salaryMin);
  }
  // Server-resolved photo (storage URL, or the provider's fallback).
  if (typeof s.avatarUrl === 'string' && s.avatarUrl !== '') out.avatarUrl = s.avatarUrl;
  return out;
}
