/**
 * Typography system — single source for every font decision.
 *
 * ONE-SWAP RULE
 * Every glyph on the site resolves through two CSS vars (system.css :root):
 *   --font-sans  →  ACTIVE_SANS.stack below
 *   --font-mono  →  ACTIVE_MONO.stack below
 * Change ACTIVE_SANS or ACTIVE_MONO here (and mirror the value into the
 * :root vars, which carry the identical strings) and the entire website
 * follows — no file-by-file edits. If the new family is not loaded yet,
 * add it to the Google Fonts <link> in app/index.html (see LOADER note).
 *
 * LOADER (app/index.html): Inter Tight 300–600 + Geist Mono 400–500 serve as
 * defaults; Sora (sans alt) + IBM Plex Mono (mono alt) preload alongside so a
 * swap never flashes unstyled. Weights outside 300–600 fall back to the
 * nearest loaded weight — do not add weight classes without extending LOADER.
 *
 * WHAT GOES WHERE (class → usage — keep this map current):
 *   t-display  30px  · page titles: dashboard hero, find-jobs, companies, match, settings, onboarding wizard
 *   t-h1       24px  · card/panel headings, hub names, step titles, auth titles
 *   t-h2       19px  · section headings inside cards
 *   t-h3       16px  · row titles, job titles, card sub-heads
 *   t-body     14.5px· paragraphs, inbox/outreach reading surfaces
 *   t-small    13px  · default UI text: rows, labels, buttons-adjacent copy
 *   t-caption  12px  · meta lines, hints, table secondary text
 *   t-micro    11px  · eyebrows (sec-label), badges, footnotes
 *   t-metric   26px  · dashboard metric values, insight tiles
 *   t-brand    20px  · auth wordmark
 *   mono/num   Geist · every number, id, timestamp, badge, kbd, tabular data
 *   sec-label  11px uppercase · card eyebrow labels (world exception to the no-kicker rule)
 *   search-title 31px · chromeless search hero only
 * Mono is data-only: never use it for prose or to look "technical".
 */

export interface FontOption {
  id: string;
  label: string;
  /** exact value mirrored into --font-sans / --font-mono */
  stack: string;
}

export const SANS_OPTIONS: FontOption[] = [
  { id: 'inter', label: 'Inter Tight', stack: '"Inter Tight", system-ui, sans-serif' },
  { id: 'sora', label: 'Sora', stack: '"Sora", "Inter Tight", system-ui, sans-serif' },
  { id: 'system', label: 'System', stack: 'system-ui, -apple-system, sans-serif' },
];

export const MONO_OPTIONS: FontOption[] = [
  { id: 'geist', label: 'Geist Mono', stack: '"Geist Mono", ui-monospace, monospace' },
  { id: 'plex', label: 'IBM Plex Mono', stack: '"IBM Plex Mono", "Geist Mono", ui-monospace, monospace' },
  { id: 'system', label: 'System Mono', stack: 'ui-monospace, SFMono-Regular, monospace' },
];

/** Swap these two ids to retype the whole site (mirror into system.css :root). */
export const ACTIVE_SANS = 'inter';
export const ACTIVE_MONO = 'geist';

export function sansStack(): string {
  return SANS_OPTIONS.find(f => f.id === ACTIVE_SANS)?.stack ?? SANS_OPTIONS[0].stack;
}

export function monoStack(): string {
  return MONO_OPTIONS.find(f => f.id === ACTIVE_MONO)?.stack ?? MONO_OPTIONS[0].stack;
}
