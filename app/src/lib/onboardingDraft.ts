/**
 * Wizard draft rules — pure and unit-tested. The draft seeds from the local
 * profile, except on a fresh (not-yet-onboarded) account where seed values
 * are blanked so a new user never sees placeholder identity data in the
 * form. AI-extracted resume results fill only empty fields.
 */
import type { ExtractedProfile, Profile } from '../types';
import { matchCountry } from './countries.ts';

export interface OnboardingDraft {
  name: string; email: string; country: string; city: string; summary: string;
  roles: string[]; skills: string[];
  workType: string; salary: string; remote: boolean;
  resumeName: string;
}

const splitCsv = (v: string): string[] =>
  v.split(',').map((s) => s.trim()).filter((s) => s !== '');

const sameList = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Local profile → draft. `seed` is the app's neutral DEFAULT_PROFILE:
 *  while `onboarded` is false, fields still carrying seed values start
 *  blank so the wizard opens clean. */
export function initialDraft(
  profile: Profile,
  onboarded: boolean,
  seed: Profile,
): OnboardingDraft {
  const text = (v: string, sv: string): string => (onboarded || v !== sv ? v : '');
  const list = (v: string[], sv: string[]): string[] =>
    onboarded || !sameList(v, sv) ? [...v] : [];
  return {
    name: text(profile.name, seed.name),
    email: text(profile.email, seed.email),
    country: text(profile.country, seed.country),
    city: text(profile.city, seed.city),
    summary: text(profile.summary, seed.summary),
    roles: list(profile.roles, seed.roles),
    skills: list(splitCsv(profile.skills), splitCsv(seed.skills)),
    workType: text(profile.location, seed.location),
    salary: text(profile.salary, seed.salary),
    remote: onboarded || profile.remote !== seed.remote ? profile.remote : false,
    resumeName: profile.resume,
  };
}

/** Merge an AI-extracted profile into the draft, filling only what the
 *  draft doesn't have yet — user typing is never clobbered. Countries are
 *  normalized to the vendored canonical list (raw text when unmatched). */
export function applyExtracted(
  draft: OnboardingDraft,
  ex: ExtractedProfile,
): OnboardingDraft {
  return {
    ...draft,
    name: draft.name === '' ? ex.fullName : draft.name,
    country: draft.country === '' ? matchCountry(ex.country) : draft.country,
    city: draft.city === '' ? ex.city : draft.city,
    summary: draft.summary === '' ? ex.summary : draft.summary,
    roles: draft.roles.length === 0 ? [...ex.roles] : draft.roles,
    skills: draft.skills.length === 0 ? [...ex.skills] : draft.skills,
  };
}

/** Human copy for the wizard/Settings pipeline status line. */
export function stageLabel(stage: string | null): string {
  switch (stage) {
    case 'reading': return 'reading your resume';
    case 'ai_queued': return 'queued for AI reading';
    case 'ai_wait': return 'waiting for AI headroom';
    case 'ai_running': return 'AI is reading it';
    case 'ready': return 'done';
    case 'failed': return 'failed';
    default: return 'working';
  }
}
