/**
 * Daily-cap counts — ONE implementation for sidebar meters, Applications,
 * Dashboard, Outreach and the apply pre-gate. Server usage wins when the
 * backend is configured (single source of truth); the offline fallback
 * counts today's local rows. Never re-derive these inline per surface.
 */
import type { Application, OutreachMail } from '../types';
import type { Usage } from '../services/api';
import { APPLY_CAP, OUTREACH_CAP } from '../services/demo';

export interface CapCount { used: number; cap: number }

export function appliesToday(backend: boolean, usage: Usage | null, apps: Application[], todayKey: string): CapCount {
  return backend && usage !== null
    ? { used: usage.applyUsed, cap: usage.applyCap }
    : { used: apps.filter((a) => a.appliedDate === todayKey).length, cap: APPLY_CAP };
}

export function sendsToday(backend: boolean, usage: Usage | null, sent: OutreachMail[], todayKey: string): CapCount {
  return backend && usage !== null
    ? { used: usage.outreachUsed, cap: usage.outreachCap }
    : { used: sent.filter((m) => m.sentAt.startsWith(todayKey)).length, cap: OUTREACH_CAP };
}
