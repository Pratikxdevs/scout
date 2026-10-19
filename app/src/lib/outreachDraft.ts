/**
 * The one local draft store shared by the inbox handoff and the compose
 * screen. Persists the full `DraftMail` shape (job, company, recipient,
 * subject, body) so a reload never silently drops context. Parsing is
 * defensive: storage may hold an older/hand-edited shape.
 */
import type { DraftMail } from '../types';
import { loadStored, removeStored, saveStored } from './storage.ts';

const KEY = 'outreach_draft';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Validate an unknown stored value into a DraftMail, or null. */
export function parseDraft(value: unknown): DraftMail | null {
  if (value === null || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  const draft: DraftMail = {
    jobId: str(o.jobId) || undefined,
    jobTitle: str(o.jobTitle) || undefined,
    company: str(o.company) || undefined,
    to: str(o.to).slice(0, 320),
    subject: str(o.subject).slice(0, 500),
    body: str(o.body).slice(0, 50_000),
  };
  if (!draft.to && !draft.subject && !draft.body && !draft.jobId) return null;
  return draft;
}

export function loadDraft(): DraftMail | null {
  return parseDraft(loadStored<unknown>(KEY, null));
}

export function saveDraft(draft: DraftMail): void {
  const parsed = parseDraft(draft);
  if (parsed) saveStored(KEY, parsed);
  else removeStored(KEY);
}

export function clearDraft(): void {
  removeStored(KEY);
}

/** Append the Settings signature once, unless the body already ends with it. */
export function appendSignature(body: string, signature: string): string {
  const sig = signature.trim();
  if (sig === '') return body;
  const trimmed = body.trimEnd();
  return trimmed.includes(sig) ? trimmed : `${trimmed}\n\n${sig}`;
}
