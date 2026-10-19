/**
 * Pure mapping between the server enrichment envelope and the app's typed
 * dossier. Kept in lib/ so the store/UI never re-implement shape checks and
 * the mapping is unit-testable without a backend.
 */
import type {
  DossierAnalysis,
  DossierCoverage,
  DossierEducation,
  DossierExperience,
  DossierLink,
  DossierProfile,
  DossierProject,
  DossierResult,
  DossierRole,
  DossierSkill,
  ProfileDossier,
  ProfileDossierStatus,
  ProfileSource,
  ProfileSourceKind,
  ProfileSourceStatus,
} from '../types';

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null;
}
function str(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}
function num(v: unknown, min = 0, max = 100): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : min;
}
function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function strings(v: unknown, maxItems = 50): string[] {
  return list(v).filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, maxItems).map(x => x.trim());
}
function records(v: unknown, maxItems = 50): Record<string, unknown>[] {
  return list(v).map(rec).filter((x): x is Record<string, unknown> => x !== null).slice(0, maxItems);
}
function url(v: unknown): string {
  const s = str(v, 600);
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : '';
}
function sourceStatus(v: unknown): ProfileSourceStatus {
  return v === 'pending' || v === 'fetching' || v === 'ready' || v === 'blocked' || v === 'failed' || v === 'skipped'
    ? v : 'failed';
}
function sourceKind(v: unknown): ProfileSourceKind {
  return v === 'github' || v === 'linkedin' || v === 'portfolio' || v === 'other' ? v : 'other';
}
function dossierStatus(v: unknown): ProfileDossierStatus {
  return v === 'queued' || v === 'enriching' || v === 'ai_running' || v === 'ready' || v === 'failed'
    ? v : 'failed';
}

export function parseDossierResult(raw: unknown): DossierResult | null {
  const root = rec(raw);
  const profile = root === null ? null : rec(root.profile);
  const analysis = root === null ? null : rec(root.analysis);
  if (root === null || profile === null || analysis === null) return null;

  const links: DossierLink[] = records(profile.links, 16)
    .map(l => ({ label: str(l.label, 80), url: url(l.url), source: str(l.source, 40) }))
    .filter(l => l.url !== '');
  const experience: DossierExperience[] = records(profile.experience, 14)
    .map(e => ({
      title: str(e.title, 140), company: str(e.company, 140),
      start: str(e.start, 60), end: str(e.end, 60), description: str(e.description, 700),
      highlights: strings(e.highlights, 6), skills: strings(e.skills, 12), source: str(e.source, 40),
    }))
    .filter(e => e.title !== '' || e.company !== '' || e.description !== '');
  const education: DossierEducation[] = records(profile.education, 8)
    .map(e => ({ school: str(e.school, 160), degree: str(e.degree, 160), period: str(e.period, 60), source: str(e.source, 40) }))
    .filter(e => e.school !== '' || e.degree !== '');
  const projects: DossierProject[] = records(profile.projects, 12)
    .map(p => ({
      name: str(p.name, 160), description: str(p.description, 700), url: url(p.url),
      technologies: strings(p.technologies, 12), source: str(p.source, 40),
    }))
    .filter(p => p.name !== '' || p.description !== '');
  const skills: DossierSkill[] = records(profile.skills, 40)
    .map(s => ({
      name: str(s.name, 80), category: str(s.category, 80),
      evidence: strings(s.evidence, 6), confidence: num(s.confidence, 1, 5),
    }))
    .filter(s => s.name !== '');
  const roles: DossierRole[] = records(analysis.preferredRoles, 7)
    .map(r => ({
      title: str(r.title, 140), fit: num(r.fit, 0, 100),
      reason: str(r.reason, 500), evidence: strings(r.evidence, 6),
    }))
    .filter(r => r.title !== '');

  const parsedProfile: DossierProfile = {
    fullName: str(profile.fullName, 140), headline: str(profile.headline, 240),
    summary: str(profile.summary, 1600), location: str(profile.location, 180),
    email: str(profile.email, 180), links, experience, education, projects, skills,
    certifications: records(profile.certifications, 12)
      .map(c => ({ name: str(c.name, 160), issuer: str(c.issuer, 160), year: str(c.year, 20), source: str(c.source, 40) }))
      .filter(c => c.name !== ''),
    languages: strings(profile.languages, 12),
  };
  const parsedAnalysis: DossierAnalysis = {
    seniority: str(analysis.seniority, 80), domains: strings(analysis.domains, 12),
    strengths: strings(analysis.strengths, 10), gaps: strings(analysis.gaps, 10),
    preferredRoles: roles, confidence: num(analysis.confidence, 0, 100),
  };
  const coverage: DossierCoverage[] = records(root.sourceCoverage, 40)
    .map(c => ({ kind: str(c.kind, 40), url: url(c.url), status: str(c.status, 40), itemsRead: num(c.itemsRead, 0, 100000) }));

  return { profile: parsedProfile, analysis: parsedAnalysis, sourceCoverage: coverage };
}

function parseSource(raw: unknown): ProfileSource | null {
  const r = rec(raw);
  if (r === null) return null;
  const sourceId = str(r.sourceId, 100);
  if (sourceId === '') return null;
  const fetchMode = r.fetchMode === 'api' || r.fetchMode === 'manual_paste' ? r.fetchMode : 'public_page';
  return {
    sourceId,
    kind: sourceKind(r.kind),
    url: url(r.url),
    canonicalUrl: url(r.canonicalUrl),
    host: str(r.host, 200),
    label: str(r.label, 200),
    status: sourceStatus(r.status),
    fetchMode,
    title: str(r.title, 240),
    digestChars: num(r.digestChars, 0, 100000),
    itemsRead: num(r.itemsRead, 0, 100000),
    error: str(r.error, 400),
    fetchedAt: typeof r.fetchedAt === 'number' ? r.fetchedAt : null,
  };
}

/** Map `GET /profiles/me/enrich`; null when no run has been started. */
export function parseDossierEnvelope(raw: unknown): ProfileDossier | null {
  const root = rec(raw);
  if (root === null) return null;
  const d = rec(root.dossier);
  if (d === null) return null;
  const dossierId = str(d.dossierId, 100);
  if (dossierId === '') return null;
  return {
    dossierId,
    resumeId: str(d.resumeId, 100),
    resumeVersion: num(d.resumeVersion, 1, 100000),
    status: dossierStatus(d.status),
    stage: str(d.stage, 80),
    failureReason: d.failureReason === null || d.failureReason === undefined ? null : str(d.failureReason, 400),
    result: parseDossierResult(d.result),
    sourceCount: num(d.sourceCount, 0, 100000),
    model: d.model === null || d.model === undefined ? null : str(d.model, 120),
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0,
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0,
    sources: list(root.sources)
      .map(parseSource)
      .filter((s): s is ProfileSource => s !== null),
  };
}

export function dossierIsActive(status: ProfileDossierStatus): boolean {
  return status === 'queued' || status === 'enriching' || status === 'ai_running';
}

export function dossierStageLabel(stage: string): string {
  switch (stage) {
    case 'queued': return 'Waiting to start';
    case 'discovering_links': return 'Finding profile links in your resume';
    case 'fetching_sources': return 'Reading public profiles';
    case 'no_links': return 'No public links found — building from your resume';
    case 'building_profile': return 'Merging what we read';
    case 'ai_wait': return 'Waiting for AI capacity';
    case 'ai_running': return 'AI is building your dossier';
    case 'ready': return 'Profile dossier ready';
    case 'failed': return 'Enrichment failed';
    default: return stage.replace(/_/g, ' ');
  }
}

export function sourceStatusLabel(status: ProfileSourceStatus): string {
  switch (status) {
    case 'pending': return 'Queued';
    case 'fetching': return 'Reading';
    case 'ready': return 'Read';
    case 'blocked': return 'Blocked';
    case 'failed': return 'Failed';
    case 'skipped': return 'Not fetched';
  }
}

/** Maps to the shared `Status` component's kind. */
export function sourceStatusKind(status: ProfileSourceStatus): 'ok' | 'warn' | 'bad' | 'info' {
  if (status === 'ready') return 'ok';
  if (status === 'blocked' || status === 'skipped') return 'warn';
  if (status === 'failed') return 'bad';
  return 'info';
}
