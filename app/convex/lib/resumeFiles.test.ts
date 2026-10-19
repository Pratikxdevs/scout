import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCX_MIME, PDF_MIME, hasReportedContentType, normalizeResumeContentType,
  resumeMimeForFileName, sniffResumeFormat,
} from './resumeFiles.ts';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('normalizeResumeContentType', () => {
  it('accepts the two supported types and ignores parameters', () => {
    assert.equal(normalizeResumeContentType('application/pdf'), PDF_MIME);
    assert.equal(normalizeResumeContentType('application/pdf; charset=binary'), PDF_MIME);
    assert.equal(normalizeResumeContentType(DOCX_MIME), DOCX_MIME);
  });

  it('rejects anything else and treats missing as unknown', () => {
    assert.equal(normalizeResumeContentType('text/plain'), null);
    assert.equal(normalizeResumeContentType('image/png'), null);
    assert.equal(normalizeResumeContentType(''), null);
    assert.equal(normalizeResumeContentType(undefined), null);
    assert.equal(hasReportedContentType(undefined), false);
    assert.equal(hasReportedContentType('application/pdf'), true);
  });
});

describe('resumeMimeForFileName', () => {
  it('falls back to the extension', () => {
    assert.equal(resumeMimeForFileName('cv.pdf'), PDF_MIME);
    assert.equal(resumeMimeForFileName('CV.DOCX'), DOCX_MIME);
    assert.equal(resumeMimeForFileName('notes.txt'), null);
  });
});

describe('sniffResumeFormat', () => {
  it('detects a PDF header', () => {
    const head = new TextEncoder().encode('%PDF-1.7\nrest');
    assert.equal(sniffResumeFormat(head), PDF_MIME);
  });

  it('detects a DOCX zip container', () => {
    assert.equal(sniffResumeFormat(bytes(0x50, 0x4b, 0x03, 0x04, 0x00)), DOCX_MIME);
  });

  it('refuses everything else', () => {
    assert.equal(sniffResumeFormat(bytes(0x89, 0x50, 0x4e, 0x47)), null);
    assert.equal(sniffResumeFormat(new Uint8Array(0)), null);
  });
});
