import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, domainClass, isAllowedFetchable } from './urls.ts';

describe('canonicalUrl', () => {
  it('strips tracking params and normalises the path', () => {
    assert.equal(
      canonicalUrl('https://www.upwork.com/jobs/abc/?utm_source=x&ref=1'),
      'https://www.upwork.com/jobs/abc',
    );
  });

  it('keeps meaningful query params', () => {
    assert.equal(canonicalUrl('https://example.com/jobs?id=42'), 'https://example.com/jobs?id=42');
  });

  it('rejects non-http(s) and malformed urls', () => {
    assert.equal(canonicalUrl('javascript:alert(1)'), null);
    assert.equal(canonicalUrl('not a url'), null);
    assert.equal(canonicalUrl(''), null);
  });
});

describe('isAllowedFetchable (SSRF guard)', () => {
  it('allows public https pages', () => {
    assert.equal(isAllowedFetchable('https://www.upwork.com/freelance-jobs/x/'), true);
  });

  it('refuses loopback, private and non-http targets', () => {
    assert.equal(isAllowedFetchable('http://127.0.0.1:3000/admin'), false);
    assert.equal(isAllowedFetchable('http://localhost:8080/'), false);
    assert.equal(isAllowedFetchable('http://169.254.169.254/latest/meta-data/'), false);
    assert.equal(isAllowedFetchable('http://10.0.0.5/'), false);
    assert.equal(isAllowedFetchable('file:///etc/passwd'), false);
    assert.equal(isAllowedFetchable('ftp://example.com/x'), false);
  });
});

describe('domainClass', () => {
  it('is stable and total', () => {
    for (const host of ['upwork.com', 'reddit.com', 'linkedin.com', 'naukri.com', 'unknown.dev']) {
      assert.ok(['company', 'job_board', 'news', 'community', 'low'].includes(domainClass(host)));
    }
  });
});
