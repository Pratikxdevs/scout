"use node";

import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { DOCX_MIME, PDF_MIME, sniffResumeFormat } from '../lib/resumeFiles';
import { MIN_READABLE_CHARS, extractPdfText } from '../lib/pdfText';
import { extractDocxText } from '../lib/docxText';
import { INLINE_TEXT_LIMIT, MAX_EXTRACTED_TEXT_BYTES } from '../lib/resumeLimits';
import {
  buildProfileMessages, isEmptyProfile, parseExtractedProfile, MAX_COMPLETION_TOKENS,
} from '../lib/aiProfile';
import { completeJson, llmKey } from '../providers/llm';

/**
 * Resume pipeline, step 1 (Node runtime — PDF parsing needs Node APIs).
 *
 * attach() schedules this action: it extracts the text layer, stores it
 * (inline or as a storage blob), then hands off to the AI step.
 *
 * The LLM never sees the PDF or DOCX — only extracted plain text. There is
 * no OCR: a scanned PDF fails honestly instead of being sent to the model.
 * Every exit path is honest — either a user-visible failureReason or a
 * clean no-op when the row was superseded mid-flight.
 */

const MAX_ATTEMPTS = 3;      // network/parse retries
const MAX_WAIT_TRIES = 20;   // rate-limit waits only, each ≤ 30s

export const extractResume = internalAction({
  args: { resumeId: v.id('resumes') },
  handler: async (ctx, args): Promise<void> => {
    const row = await ctx.runQuery(internal.resumes.getByIdInternal, { resumeId: args.resumeId });
    if (row === null || !row.isActive || row.extractionStatus !== 'pending') {
      return; // superseded or already settled
    }
    const started = await ctx.runMutation(internal.resumes.beginExtraction, { resumeId: args.resumeId });
    if (!started.ok) return;

    const fail = async (reason: string): Promise<void> => {
      await ctx.runMutation(internal.resumes.markFailed, { resumeId: args.resumeId, reason });
    };

    let text: string;
    try {
      const blob = await ctx.storage.get(row.storageId);
      if (blob === null) {
        await fail('The uploaded file is missing — re-upload your resume.');
        return;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const format = sniffResumeFormat(bytes);
      if (format === null) {
        await fail('That file is not a real PDF or DOCX — export your resume in one of those formats and re-upload.');
        return;
      }
      if (format !== row.mimeType) {
        await fail('The file contents do not match its name — re-export it as PDF or DOCX and re-upload.');
        return;
      }
      text = format === PDF_MIME ? await extractPdfText(bytes) : extractDocxText(bytes);
    } catch (e) {
      const kind = row.mimeType === DOCX_MIME ? 'DOCX' : 'PDF';
      await fail(`Could not read this ${kind} (${e instanceof Error ? e.message : 'unknown error'}) — try re-exporting it.`);
      return;
    }

    if (text.length < MIN_READABLE_CHARS) {
      await fail(row.mimeType === DOCX_MIME
        ? 'No readable text in this DOCX — re-save it as a text-based document and upload again.'
        : 'No readable text in this PDF — it looks scanned. Upload a text-based PDF export so the AI can read it.');
      return;
    }
    if (new TextEncoder().encode(text).length > MAX_EXTRACTED_TEXT_BYTES) {
      await fail('This resume expands into too much text to read — trim it to 2–3 pages and re-upload.');
      return;
    }

    const overInline = new TextEncoder().encode(text).length > INLINE_TEXT_LIMIT;
    let textBlobId: Id<'_storage'> | null = null;
    if (overInline) {
      textBlobId = await ctx.storage.store(new Blob([text], { type: 'text/plain' }));
    }
    const saved = overInline
      ? await ctx.runMutation(internal.resumes.setExtractedText, {
          resumeId: args.resumeId, textStorageId: textBlobId as Id<'_storage'>,
        })
      : await ctx.runMutation(internal.resumes.setExtractedText, { resumeId: args.resumeId, text });
    if (!saved.ok) {
      // A newer upload replaced this row while we were reading — keep the
      // store clean and leave the new row's pipeline alone.
      if (textBlobId !== null) await ctx.storage.delete(textBlobId);
      return;
    }

    // The AI step manages its own retries and waits.
    await ctx.scheduler.runAfter(0, internal.actions.resumePipeline.runAi, {
      resumeId: args.resumeId, attempt: 0, waitTries: 0,
    });
  },
});

/**
 * Resume pipeline, step 2: the LLM reads the extracted text and returns a
 * strict JSON profile draft. One OpenAI-compatible endpoint (Groq by
 * default) — the same provider the hunt pipeline scores leads with.
 *
 * Failures are honest and bounded: a 429 waits (≤20 waits, ≤30s each), a
 * network/parse failure retries (≤3 attempts), and the final failureReason
 * says what happened in plain words.
 */
export const runAi = internalAction({
  args: {
    resumeId: v.id('resumes'),
    attempt: v.number(),
    waitTries: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const row = await ctx.runQuery(internal.resumes.getByIdInternal, { resumeId: args.resumeId });
    if (row === null || !row.isActive || row.extractionStatus !== 'processing') {
      return; // superseded or already settled
    }
    if (llmKey(ctx) === null) {
      await ctx.runMutation(internal.resumes.markFailed, {
        resumeId: args.resumeId,
        reason: 'PROVIDER_UNCONFIGURED: LLM_API_KEY is not set on this Convex deployment — resume reading unavailable.',
      });
      return;
    }

    // Read the extracted text (inline or blob) — same for first try/retries.
    let text = row.extractedText ?? '';
    if (text === '' && row.extractedTextStorageId !== undefined) {
      const blob = await ctx.storage.get(row.extractedTextStorageId);
      if (blob !== null) text = await blob.text();
    }
    if (text.trim() === '') {
      await ctx.runMutation(internal.resumes.markFailed, {
        resumeId: args.resumeId,
        reason: 'No extracted text to analyze — re-upload your resume.',
      });
      return;
    }

    await ctx.runMutation(internal.resumes.setStage, {
      resumeId: args.resumeId, stage: 'ai_running', aiAttempts: args.attempt + 1,
    });

    const prompt = buildProfileMessages(text);
    let raw: unknown;
    try {
      raw = await completeJson<unknown>(ctx, [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ], { maxTokens: MAX_COMPLETION_TOKENS, temperature: 0.2 });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown error';
      const rateLimited = message.includes('429');
      if (rateLimited && args.waitTries < MAX_WAIT_TRIES) {
        await ctx.runMutation(internal.resumes.setStage, { resumeId: args.resumeId, stage: 'ai_wait' });
        await ctx.scheduler.runAfter(5_000, internal.actions.resumePipeline.runAi, {
          resumeId: args.resumeId, attempt: args.attempt, waitTries: args.waitTries + 1,
        });
        return;
      }
      if (args.attempt + 1 < MAX_ATTEMPTS) {
        await ctx.scheduler.runAfter(2_000 * (args.attempt + 1), internal.actions.resumePipeline.runAi, {
          resumeId: args.resumeId, attempt: args.attempt + 1, waitTries: args.waitTries,
        });
        return;
      }
      await ctx.runMutation(internal.resumes.markFailed, {
        resumeId: args.resumeId,
        reason: rateLimited
          ? 'The AI provider is rate-limiting right now — try again in a minute.'
          : 'The AI request failed — try again in a minute.',
      });
      return;
    }

    // The provider forces JSON, but the draft still goes through the strict
    // parser: clamps, caps, http(s)-only links, no invented fields.
    const parsed = parseExtractedProfile(JSON.stringify(raw));
    if (parsed === null || isEmptyProfile(parsed)) {
      if (args.attempt + 1 < MAX_ATTEMPTS) {
        await ctx.scheduler.runAfter(2_000 * (args.attempt + 1), internal.actions.resumePipeline.runAi, {
          resumeId: args.resumeId, attempt: args.attempt + 1, waitTries: args.waitTries,
        });
        return;
      }
      await ctx.runMutation(internal.resumes.markFailed, {
        resumeId: args.resumeId,
        reason: 'The AI could not read a profile from this resume — try a cleaner PDF or DOCX export.',
      });
      return;
    }

    await ctx.runMutation(internal.resumes.setExtractedProfile, {
      resumeId: args.resumeId, profile: parsed, attempts: args.attempt + 1,
    });
  },
});
