import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { requireActor } from './lib/actor';
import { fail } from './lib/errors';
import {
  DOCX_MIME, PDF_MIME, hasReportedContentType, normalizeResumeContentType,
  resumeMimeForFileName, type ResumeMime,
} from './lib/resumeFiles';
import { MAX_RESUME_BYTES } from './lib/resumeLimits';

/**
 * Resume pipeline (SPEC §3): upload → extract text → AI profile draft.
 *
 * Storage is private Convex storage; the browser never sends bytes to a
 * Convex function — it PUTs them straight to a short-lived upload URL, then
 * attaches the resulting storage id. One active resume per account: a new
 * upload supersedes the old row (version++), and the old bytes are deleted.
 *
 * The AI draft fills only EMPTY profile fields — anything the user typed
 * always wins.
 */

/** Uploads per account per day (a cheap stand-in for the token budget). */
const RESUMES_PER_DAY = 5;

const MIME_VALIDATOR = v.union(v.literal(PDF_MIME), v.literal(DOCX_MIME));

/** Step 0 — a short-lived upload URL for the raw bytes. */
export const requestUpload = mutation({
  args: {},
  handler: async (ctx) => {
    await requireActor(ctx);
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { uploadUrl };
  },
});

/** Step 1 — bind the uploaded bytes to an account + start extraction. */
export const attach = mutation({
  args: {
    storageId: v.id('_storage'),
    fileName: v.string(),
    mimeType: MIME_VALIDATOR,
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const now = Date.now();

    // Daily guard — the AI is a paid resource; the account can't hammer it.
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const today = await ctx.db
      .query('resumes')
      .withIndex('by_user_id', (q) => q.eq('userId', actor.userId))
      .filter((q) => q.gte(q.field('createdAt'), dayStart.getTime()))
      .take(RESUMES_PER_DAY + 1);
    if (today.length > RESUMES_PER_DAY) {
      throw fail('CAP_REACHED', `Resume uploads are capped at ${RESUMES_PER_DAY} a day — try again tomorrow.`);
    }

    const metadata = await ctx.db.system.get('_storage', args.storageId);
    if (metadata === null) {
      throw fail('NOT_FOUND', 'Upload not found — re-upload your resume.');
    }
    if (metadata.size > MAX_RESUME_BYTES) {
      throw fail('INVALID_INPUT', 'Resume exceeds 10 MB — nothing was saved.');
    }
    // Client-claimed mimeType is NOT trusted: a reported storage
    // contentType wins; an unset one falls back to the file name. The
    // extraction worker's byte sniff is the decisive gate.
    const reported = normalizeResumeContentType(metadata.contentType);
    if (hasReportedContentType(metadata.contentType) && reported === null) {
      throw fail('INVALID_INPUT', 'Resume must be a PDF or DOCX — nothing was saved.');
    }
    const mimeType: ResumeMime = reported ?? args.mimeType;
    if (mimeType !== args.mimeType && reported === null) {
      // Filename says PDF, claimed DOCX, storage says nothing — trust the
      // extension only when it agrees with what the client claimed.
      const byName = resumeMimeForFileName(args.fileName);
      if (byName !== null && byName !== mimeType) {
        throw fail('INVALID_INPUT', 'Resume must be a PDF or DOCX — nothing was saved.');
      }
    }

    const current = await ctx.db
      .query('resumes')
      .withIndex('by_user_id_and_is_active', (q) =>
        q.eq('userId', actor.userId).eq('isActive', true))
      .unique();
    const nextVersion = current !== null ? current.version + 1 : 1;

    if (current !== null) {
      await ctx.db.patch(current._id, { isActive: false, updatedAt: now });
    }
    const resumeId = await ctx.db.insert('resumes', {
      userId: actor.userId,
      storageId: args.storageId,
      fileName: args.fileName.slice(0, 200),
      mimeType,
      sizeBytes: metadata.size,
      version: nextVersion,
      extractionStatus: 'pending',
      stage: 'reading',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    if (current !== null) {
      // The superseded version's bytes are deleted — one resume per account.
      await ctx.storage.delete(current.storageId);
      if (current.extractedTextStorageId !== undefined) {
        await ctx.storage.delete(current.extractedTextStorageId);
      }
    }

    // Kick the extraction worker (Node action): attach stays fast, the
    // worker walks pending → processing → completed|failed.
    await ctx.scheduler.runAfter(0, internal.actions.resumePipeline.extractResume, { resumeId });
    return { resumeId, version: nextVersion };
  },
});

/** The account's active resume — whitelisted fields only (never raw text). */
export const myCurrent = query({
  args: {},
  handler: async (ctx): Promise<{
    resumeId: string; fileName: string; mimeType: string; sizeBytes: number;
    version: number; extractionStatus: 'pending' | 'processing' | 'completed' | 'failed';
    stage: string | null; failureReason: string | null;
    extractedProfile: unknown; createdAt: number; updatedAt: number;
  } | null> => {
    const actor = await requireActor(ctx);
    const row = await ctx.db
      .query('resumes')
      .withIndex('by_user_id_and_is_active', (q) =>
        q.eq('userId', actor.userId).eq('isActive', true))
      .unique();
    if (row === null) return null;
    return {
      resumeId: row._id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      version: row.version,
      extractionStatus: row.extractionStatus,
      stage: row.stage ?? null,
      failureReason: row.failureReason ?? null,
      extractedProfile: row.extractedProfile ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
});

/* ------------------------------ internal ------------------------------ */

export const getByIdInternal = internalQuery({
  args: { resumeId: v.id('resumes') },
  handler: async (ctx, args) => await ctx.db.get(args.resumeId),
});

export const beginExtraction = internalMutation({
  args: { resumeId: v.id('resumes') },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.resumeId);
    if (row === null || !row.isActive || row.extractionStatus !== 'pending') {
      return { ok: false as const };
    }
    await ctx.db.patch(args.resumeId, {
      extractionStatus: 'processing',
      stage: 'reading',
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const setExtractedText = internalMutation({
  args: {
    resumeId: v.id('resumes'),
    text: v.optional(v.string()),
    textStorageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.resumeId);
    if (row === null || !row.isActive || row.extractionStatus !== 'processing') {
      return { ok: false as const };
    }
    if (args.text === undefined && args.textStorageId === undefined) {
      return { ok: false as const };
    }
    await ctx.db.patch(args.resumeId, {
      extractedText: args.text,
      extractedTextStorageId: args.textStorageId,
      stage: 'ai_queued',
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const setStage = internalMutation({
  args: {
    resumeId: v.id('resumes'),
    stage: v.string(),
    aiAttempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.resumeId);
    if (row === null || !row.isActive) return { ok: false as const };
    await ctx.db.patch(args.resumeId, {
      stage: args.stage,
      ...(args.aiAttempts !== undefined ? { aiAttempts: args.aiAttempts } : {}),
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const markFailed = internalMutation({
  args: { resumeId: v.id('resumes'), reason: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.resumeId);
    if (row === null || !row.isActive) return { ok: false as const };
    await ctx.db.patch(args.resumeId, {
      extractionStatus: 'failed',
      stage: 'failed',
      failureReason: args.reason.slice(0, 400),
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/**
 * Store the AI draft and merge the safe fields into the profile row.
 *
 * Merge rules (fill only when EMPTY — user edits always win):
 * - country / city / summary: fill when empty.
 * - services (from roles) and skills: fill when empty.
 * - fullName is NOT merged here: the wizard owns the name field, so the
 *   draft is applied client-side through applyExtracted.
 */
export const setExtractedProfile = internalMutation({
  args: {
    resumeId: v.id('resumes'),
    profile: v.any(),
    attempts: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.resumeId);
    if (row === null || !row.isActive || row.extractionStatus !== 'processing') {
      return { ok: false as const, filled: [] as string[] };
    }
    const now = Date.now();
    await ctx.db.patch(args.resumeId, {
      extractedProfile: args.profile,
      extractionStatus: 'completed',
      stage: 'ready',
      aiAttempts: args.attempts,
      appliedAt: now,
      updatedAt: now,
    });
    const filled = await mergeExtractionIntoProfile(ctx, row.userId, args.profile);
    return { ok: true as const, filled };
  },
});

/** Fill-only-empty merge of the AI draft into the account's ICP row. */
async function mergeExtractionIntoProfile(
  ctx: MutationCtx,
  userId: string,
  extracted: unknown,
): Promise<string[]> {
  if (typeof extracted !== 'object' || extracted === null) return [];
  const e = extracted as Record<string, unknown>;
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('userId', userId))
    .unique();
  if (profile === null) return [];

  const patch: Partial<Doc<'profiles'>> = { updatedAt: Date.now() };
  const filled: string[] = [];

  const country = typeof e.country === 'string' ? e.country.trim() : '';
  if (country !== '' && (profile.country ?? '') === '') {
    patch.country = country.slice(0, 80);
    filled.push('country');
  }
  const city = typeof e.city === 'string' ? e.city.trim() : '';
  if (city !== '' && (profile.city ?? '') === '') {
    patch.city = city.slice(0, 80);
    filled.push('city');
  }
  const summary = typeof e.summary === 'string' ? e.summary.trim() : '';
  if (summary !== '' && (profile.summary ?? '') === '') {
    patch.summary = summary.slice(0, 1200);
    filled.push('summary');
  }
  const skills = stringListOf(e.skills);
  if (skills !== undefined && profile.skills.length === 0) {
    patch.skills = skills;
    filled.push('skills');
  }
  const roles = stringListOf(e.roles);
  if (roles !== undefined && profile.services.length === 0) {
    patch.services = roles;
    filled.push('services');
  }

  if (filled.length > 0) await ctx.db.patch(profile._id, patch);
  return filled;
}

function stringListOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.trim().slice(0, 60);
    if (text === '') continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 40) break;
  }
  return out;
}
