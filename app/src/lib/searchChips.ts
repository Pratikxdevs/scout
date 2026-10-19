export interface SearchChip { label: string; kind: 'role' | 'place' | 'level' | 'stack' }

/** Shared suggestion chips (Stapply pattern) — used by Search home + search overlay. */
export const SEARCH_CHIPS: SearchChip[] = [
  { label: 'frontend engineer', kind: 'role' },
  { label: 'ml engineer', kind: 'role' },
  { label: 'designer', kind: 'role' },
  { label: 'data engineer', kind: 'role' },
  { label: 'remote', kind: 'place' },
  { label: 'paris', kind: 'place' },
  { label: 'berlin', kind: 'place' },
  { label: 'internship', kind: 'level' },
  { label: 'senior', kind: 'level' },
  { label: 'ai startup', kind: 'stack' },
  { label: 'rust', kind: 'stack' },
  { label: 'early-stage', kind: 'stack' },
];

export const CHIP_DOT: Record<SearchChip['kind'], string> = {
  role: 'var(--primary)', place: 'var(--success)', level: 'var(--warning)', stack: 'var(--info)',
};

/** Toggle a chip token inside a space-separated query. */
export function toggleChipToken(query: string, label: string): string {
  const parts = query.split(/\s+/).filter(Boolean);
  return parts.includes(label) ? parts.filter(p => p !== label).join(' ') : [...parts, label].join(' ');
}
