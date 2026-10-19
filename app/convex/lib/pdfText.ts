"use node";

/**
 * PDF → text for the resume pipeline (unpdf: a serverless-friendly pdf.js
 * build). Text-layer extraction only — scans/photos yield (near-)empty text
 * and the pipeline fails honestly instead of inventing a profile.
 */
import { extractText } from 'unpdf';

/** Below this, the PDF almost certainly has no text layer (scanned image). */
export const MIN_READABLE_CHARS = 80;

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const result = await extractText(bytes, { mergePages: true });
  const text = result.text;
  const joined = Array.isArray(text) ? text.join('\n') : text;
  // Normalize the extraction artifacts pdf.js leaves behind.
  return joined
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
