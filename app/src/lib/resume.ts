/** Resume file gates shared by the wizard and HTTP service. */
export const PDF_MIME = 'application/pdf';
export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type ResumeMime = typeof PDF_MIME | typeof DOCX_MIME;

export const RESUME_ACCEPT =
  `.pdf,.docx,${PDF_MIME},${DOCX_MIME}`;

/** Extension wins when present (the user's intent); the browser type is the
 *  fallback for extensionless files. Null means unsupported. */
export function resumeMimeForFile(file: { name: string; type: string }): ResumeMime | null {
  if (/\.docx$/i.test(file.name)) return DOCX_MIME;
  if (/\.pdf$/i.test(file.name)) return PDF_MIME;
  const type = file.type.split(';')[0]?.trim().toLowerCase() ?? '';
  if (type === PDF_MIME) return PDF_MIME;
  if (type === DOCX_MIME) return DOCX_MIME;
  return null;
}
