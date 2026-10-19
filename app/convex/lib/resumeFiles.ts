// Resume upload gates. Zero imports — pure and unit-testable.
//
// PDF and DOCX are the only accepted resume formats. Two layers because no
// single layer sees everything:
// - normalizeResumeContentType: metadata gate for mutations (cheap). The
//   storage contentType is set on real browser uploads and unset for blobs
//   written through ctx.storage.store — unset means "unknown", so the caller
//   falls back to the declared file name.
// - sniffResumeFormat: decisive byte gate for the extraction worker, which
//   is the only place with byte access. Bytes posted as a PDF/DOCX but
//   failing the sniff fail extraction loudly instead of poisoning the
//   pipeline.

export const PDF_MIME = 'application/pdf';
export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type ResumeMime = typeof PDF_MIME | typeof DOCX_MIME;

export const PDF_MAGIC = '%PDF-';

/** True when the platform reported a contentType at all. */
export function hasReportedContentType(
  contentType: string | null | undefined,
): boolean {
  return contentType !== undefined && contentType !== null && contentType.trim() !== '';
}

/** Normalize a reported contentType; null means unsupported (or empty). */
export function normalizeResumeContentType(
  contentType: string | null | undefined,
): ResumeMime | null {
  if (!hasReportedContentType(contentType)) return null;
  const base = (contentType as string).split(';')[0]?.trim().toLowerCase() ?? '';
  if (base === PDF_MIME) return PDF_MIME;
  if (base === DOCX_MIME) return DOCX_MIME;
  return null;
}

/** Extension fallback when storage metadata has no contentType. */
export function resumeMimeForFileName(fileName: string): ResumeMime | null {
  if (/\.docx$/i.test(fileName)) return DOCX_MIME;
  if (/\.pdf$/i.test(fileName)) return PDF_MIME;
  return null;
}

/**
 * Byte sniff for the extraction worker. DOCX is a ZIP container; the deeper
 * validation (word/document.xml, inflate limits) happens in docxText.ts.
 */
export function sniffResumeFormat(head: Uint8Array): ResumeMime | null {
  if (head.length >= PDF_MAGIC.length) {
    let pdf = true;
    for (let i = 0; i < PDF_MAGIC.length; i += 1) {
      if (head[i] !== PDF_MAGIC.charCodeAt(i)) {
        pdf = false;
        break;
      }
    }
    if (pdf) return PDF_MIME;
  }
  if (
    head.length >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    head[2] === 0x03 &&
    head[3] === 0x04
  ) {
    return DOCX_MIME;
  }
  return null;
}
