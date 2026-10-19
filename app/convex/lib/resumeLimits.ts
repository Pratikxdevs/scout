// Resume pipeline size limits, shared by the attach mutation (V8) and the
// Node extraction action so the two can never disagree.

/** Hard upload cap for resume files (10 MB). */
export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

/** Extracted text fits inline in the resume row below this; above it the
 *  extraction action stores the text as a blob and only saves the ref. */
export const INLINE_TEXT_LIMIT = 900 * 1024;

/** Hard cap on extracted text we are willing to keep (bytes). A 10 MB PDF
 *  can inflate into megabytes of text; beyond this the resume is rejected
 *  honestly instead of being truncated into a half-profile. */
export const MAX_EXTRACTED_TEXT_BYTES = 4 * 1024 * 1024;
