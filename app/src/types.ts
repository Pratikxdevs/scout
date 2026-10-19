export interface Job {
  id: string; title: string; company: string; logo?: string;
  location: string; compensation: string; description: string;
  requirements: string[]; match: number; isSaved?: boolean; savedAt?: string; url: string;
  posted: string; type: 'Full-time' | 'Contract' | 'Part-time';
}
export interface Application {
  id: string; jobId: string; title: string; company: string; logo?: string;
  appliedDate: string; updatedAt?: string; archived?: boolean;
  status: 'UNDER REVIEW' | 'INTERVIEW SET' | 'OFFERED' | 'REJECTED' | 'WITHDRAWN';
  /** Convex _id for server-backed rows (absent on local demo rows). Added 04-04. */
  serverId?: string;
}
export interface Profile {
  name: string; email: string; initials: string; status: string;
  skills: string; roles: string[]; location: string;   salary: string; remote: boolean;
  resume: string; signature: string; summary: string; city: string; country: string;
  /** Profile photo: server storage URL when signed in, local data URL in demo. */
  avatarUrl?: string;
}
/** Pipeline stages the server walks while reading an uploaded resume. */
export type ResumeStage = 'reading' | 'ai_queued' | 'ai_wait' | 'ai_running' | 'ready' | 'failed';
export type ResumeExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed';
/** AI-extracted resume data (already clamped/validated server-side). */
export interface ExtractedProfile {
  fullName: string; summary: string; country: string; city: string;
  skills: string[]; roles: string[];
  links: { label: string; url: string }[];
  experience: { title: string; company: string; period: string; description: string }[];
  education: { school: string; degree: string; period: string }[];
}
/** Active resume row the wizard/Settings render (whitelisted server fields). */
export interface ResumeRecord {
  resumeId: string; fileName: string; mimeType: string; sizeBytes: number; version: number;
  extractionStatus: ResumeExtractionStatus; stage: ResumeStage | null;
  failureReason: string | null; extractedProfile: ExtractedProfile | null;
  createdAt: number; updatedAt: number;
}
/** Public-link enrichment: one source row per resume link group. */
export type ProfileSourceKind = 'github' | 'linkedin' | 'portfolio' | 'other';
export type ProfileSourceStatus = 'pending' | 'fetching' | 'ready' | 'blocked' | 'failed' | 'skipped';
export type ProfileDossierStatus = 'queued' | 'enriching' | 'ai_running' | 'ready' | 'failed';
export interface DossierLink { label: string; url: string; source: string }
export interface DossierExperience {
  title: string; company: string; start: string; end: string; description: string;
  highlights: string[]; skills: string[]; source: string;
}
export interface DossierEducation { school: string; degree: string; period: string; source: string }
export interface DossierProject {
  name: string; description: string; url: string; technologies: string[]; source: string;
}
export interface DossierSkill {
  name: string; category: string; evidence: string[]; confidence: number;
}
export interface DossierCertification { name: string; issuer: string; year: string; source: string }
export interface DossierRole {
  title: string; fit: number; reason: string; evidence: string[];
}
export interface DossierProfile {
  fullName: string; headline: string; summary: string; location: string; email: string;
  links: DossierLink[]; experience: DossierExperience[]; education: DossierEducation[];
  projects: DossierProject[]; skills: DossierSkill[];
  certifications: DossierCertification[]; languages: string[];
}
export interface DossierAnalysis {
  seniority: string; domains: string[]; strengths: string[]; gaps: string[];
  preferredRoles: DossierRole[]; confidence: number;
}
export interface DossierCoverage { kind: string; url: string; status: string; itemsRead: number }
/** Validated dossier output (server parser clamps every field). */
export interface DossierResult {
  profile: DossierProfile;
  analysis: DossierAnalysis;
  sourceCoverage: DossierCoverage[];
}
export interface ProfileSource {
  sourceId: string; kind: ProfileSourceKind; url: string; canonicalUrl: string; host: string;
  label: string; status: ProfileSourceStatus; fetchMode: 'api' | 'public_page' | 'manual_paste';
  title: string; digestChars: number; itemsRead: number; error: string; fetchedAt: number | null;
}
export interface ProfileDossier {
  dossierId: string; resumeId: string; resumeVersion: number;
  status: ProfileDossierStatus; stage: string; failureReason: string | null;
  result: DossierResult | null; sourceCount: number; model: string | null;
  createdAt: number; updatedAt: number; sources: ProfileSource[];
}
export interface OutreachMail {
  id: string; jobTitle: string; company: string; to: string;
  subject: string; body: string; sentAt: string;
}
/** Every category the reply classifier can return, in UI order. */
export const REPLY_CATEGORIES = [
  'Interested', 'Might be Interested', 'Interview Scheduled', 'Auto-response', 'Not Interested',
] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];
export interface Reply {
  id: string; from: string; subject: string; body: string; at: string;
  category: ReplyCategory;
}
/** One composed-but-unsent message, shared by the inbox handoff and composer. */
export interface DraftMail {
  jobId?: string; jobTitle?: string; company?: string;
  to: string; subject: string; body: string;
}
/** Unread recruiter-reply notification surfaced on the dashboard. */
export interface HotReply {
  id: string; title: string; message: string;
  from: string; subject: string; category: string; createdAt: number;
}
export interface CompanyLog {
  id: string; actor: string; target: string;
  status: 'APPROVED' | 'PENDING' | 'FAILED'; when: string;
}
export type AppStatus = Application['status'];
/** Result envelope for simulated demo operations — never claims external effects. */
export interface DemoResult { ok: boolean; message: string }
/** Backend scrape-run progress for the Find Jobs first-open flow. */
export interface LiveSearchState { state: 'idle' | 'running' | 'error'; message: string; code?: string }
export type Route =
  | 'dashboard' | 'search' | 'jobs' | 'match' | 'applications' | 'companies'
  | 'outreach' | 'inbox'
  | 'settings' | 'login' | 'signup' | 'onboarding' | 'notfound';
