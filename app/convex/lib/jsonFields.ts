/**
 * Shared, zero-dependency JSON field guards for AI output.
 *
 * Models are good at packaging drift (fences, stray prose, wrong scalar
 * types). These helpers keep the forgiving-packaging / strict-content rule in
 * one place so every parser clamps the same way.
 */

/** Pull the first object out of a model reply, tolerating fences/prose. */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  let text = raw.trim();
  if (text === '') return null;
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence !== null) text = (fence[1] ?? '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

export function asString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function asNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function asStringList(
  value: unknown,
  maxItems: number,
  maxLen: number,
): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = asString(item, maxLen);
    if (text === '') continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asRecordList(value: unknown, maxItems: number): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const out: Record<string, unknown>[] = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (rec === null) continue;
    out.push(rec);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** http(s) only and length-capped — never let a model output a `javascript:`
 *  URL into a rendered profile link. */
export function asHttpUrl(value: unknown, maxLen = 500): string {
  const url = asString(value, maxLen);
  return /^https?:\/\/[^\s]+$/i.test(url) ? url : '';
}
