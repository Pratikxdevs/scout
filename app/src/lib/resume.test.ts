import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCX_MIME,
  PDF_MIME,
  RESUME_ACCEPT,
  resumeMimeForFile,
} from './resume.ts';

describe('resumeMimeForFile', () => {
  it('accepts PDF and DOCX by extension even without a browser MIME', () => {
    assert.equal(resumeMimeForFile({ name: 'cv.pdf', type: '' }), PDF_MIME);
    assert.equal(resumeMimeForFile({ name: 'CV.DOCX', type: '' }), DOCX_MIME);
  });

  it('falls back to the browser MIME for extensionless files', () => {
    assert.equal(resumeMimeForFile({ name: 'resume', type: PDF_MIME }), PDF_MIME);
    assert.equal(resumeMimeForFile({ name: 'resume', type: `${DOCX_MIME}; charset=binary` }), DOCX_MIME);
  });

  it('rejects legacy DOC, archives, images, and unknown files', () => {
    assert.equal(resumeMimeForFile({ name: 'cv.doc', type: 'application/msword' }), null);
    assert.equal(resumeMimeForFile({ name: 'cv.zip', type: 'application/zip' }), null);
    assert.equal(resumeMimeForFile({ name: 'photo.png', type: 'image/png' }), null);
    assert.equal(resumeMimeForFile({ name: 'resume', type: '' }), null);
  });

  it('offers both extensions in the file picker', () => {
    assert.match(RESUME_ACCEPT, /\.pdf/);
    assert.match(RESUME_ACCEPT, /\.docx/);
    assert.match(RESUME_ACCEPT, new RegExp(DOCX_MIME.replace(/[.]/g, '\\.')));
  });
});
