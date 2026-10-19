/**
 * Resume → profile extraction: the prompt and the strict output parser.
 * Pure (zero runtime deps) so both halves are unit-testable without the network.
 *
 * The prompt is deliberately narrow: one job (extract facts), one shape
 * (fixed JSON), no prose. The parser is deliberately forgiving about
 * packaging (fences, stray text) and strict about content (types, lengths,
 * http(s)-only URLs) — a model that drifts still yields a safe draft or
 * `null` (caller retries once, then fails honestly).
 */
import {
  asHttpUrl,
  asString,
  asStringList,
  extractJsonObject,
} from './jsonFields.ts';

/** Input budget: ~6k tokens of resume text, keeping one request safely
 *  inside a typical 15k TPM account window even with headroom for retries. */
export const MAX_RESUME_CHARS = 24_000;
/** Hard completion cap — the JSON schema is small; anything longer is noise. */
export const MAX_COMPLETION_TOKENS = 1500;

const OMITTED = '\n\n[...middle of the resume omitted for length...]\n\n';

export interface DraftLink {
  label: string;
  url: string;
}

export interface DraftExperience {
  title: string;
  company: string;
  period: string;
  description: string;
}

export interface DraftEducation {
  school: string;
  degree: string;
  period: string;
}

export interface ExtractedProfile {
  fullName: string;
  summary: string;
  country: string;
  city: string;
  skills: string[];
  roles: string[];
  links: DraftLink[];
  experience: DraftExperience[];
  education: DraftEducation[];
}

/** Collapse whitespace and cap length head-heavy (resumes front-load the
 *  identity + latest role; the tail keeps education/certs). */
export function trimResumeText(raw: string): string {
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= MAX_RESUME_CHARS) return text;
  const head = Math.floor(MAX_RESUME_CHARS * 0.7);
  const tail = MAX_RESUME_CHARS - head - OMITTED.length;
  return text.slice(0, head) + OMITTED + text.slice(text.length - tail);
}

export const SYSTEM_PROMPT = [
  'You extract structured profile data from ONE resume for a freelance-lead app.',
  'Return a single JSON object — no markdown, no commentary, nothing else.',
  '',
  'Schema (every key required; use "" or [] when absent):',
  '{',
  '  "fullName": string,        // the person\'s name, "" if unclear',
  '  "summary": string,         // 2-3 sentence professional summary in English, third person, no first-person pronouns',
  '  "country": string,         // country of residence as a full English name (e.g. "India", "United States"), "" if unclear',
  '  "city": string,            // city of residence, "" if unclear',
  '  "skills": string[],        // 5-30 concrete skills, tools, or technologies, deduplicated, most relevant first',
  '  "roles": string[],         // 1-5 freelance services/roles this person sells, most senior first',
  '  "links": [{"label": string, "url": string}],',
  '                             // personal sites, portfolios, GitHub, LinkedIn visible in the resume; url must start with http:// or https://',
  '  "experience": [{"title": string, "company": string, "period": string, "description": string}],',
  '                             // reverse-chronological; period like "Mar 2021 – present"; description 1-2 sentences',
  '  "education": [{"school": string, "degree": string, "period": string}]',
  '}',
  '',
  'Rules:',
  '- Use ONLY facts present in the resume text. Never invent employers, dates, degrees, links, or skills.',
  '- Normalize dates to "Mon YYYY – Mon YYYY" or "Mon YYYY – present"; never guess when absent.',
  '- If the text is garbled or unreadable, return the schema with empty fields.',
  '- Output valid JSON only. No trailing text.',
].join('\n');

export function buildProfileMessages(resumeText: string): { system: string; user: string } {
  return {
    system: SYSTEM_PROMPT,
    user: `RESUME TEXT:\n"""\n${trimResumeText(resumeText)}\n"""`,
  };
}

function asLinks(v: unknown): DraftLink[] {
  if (!Array.isArray(v)) return [];
  const out: DraftLink[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const url = asHttpUrl(rec.url, 300);
    if (url === '') continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: asString(rec.label, 40), url });
    if (out.length >= 8) break;
  }
  return out;
}

function asExperience(v: unknown): DraftExperience[] {
  if (!Array.isArray(v)) return [];
  const out: DraftExperience[] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const title = asString(rec.title, 120);
    const company = asString(rec.company, 120);
    if (title === '' && company === '') continue;
    out.push({
      title,
      company,
      period: asString(rec.period, 60),
      description: asString(rec.description, 400),
    });
    if (out.length >= 12) break;
  }
  return out;
}

function asEducation(v: unknown): DraftEducation[] {
  if (!Array.isArray(v)) return [];
  const out: DraftEducation[] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const school = asString(rec.school, 120);
    const degree = asString(rec.degree, 120);
    if (school === '' && degree === '') continue;
    out.push({ school, degree, period: asString(rec.period, 60) });
    if (out.length >= 6) break;
  }
  return out;
}

/** Forgiving packaging, strict content: fences and stray prose tolerated,
 *  wrong types dropped, lengths clamped. `null` = unusable answer. */
export function parseExtractedProfile(raw: string): ExtractedProfile | null {
  const o = extractJsonObject(raw);
  if (o === null) return null;
  return {
    fullName: asString(o.fullName, 120),
    summary: asString(o.summary, 1200),
    country: asString(o.country, 80),
    city: asString(o.city, 80),
    skills: asStringList(o.skills, 40, 60),
    roles: asStringList(o.roles, 6, 80),
    links: asLinks(o.links),
    experience: asExperience(o.experience),
    education: asEducation(o.education),
  };
}

/** True when the model returned nothing usable (garbled-scan case). */
export function isEmptyProfile(p: ExtractedProfile): boolean {
  return (
    p.fullName === '' &&
    p.summary === '' &&
    p.country === '' &&
    p.city === '' &&
    p.skills.length === 0 &&
    p.roles.length === 0 &&
    p.links.length === 0 &&
    p.experience.length === 0 &&
    p.education.length === 0
  );
}
