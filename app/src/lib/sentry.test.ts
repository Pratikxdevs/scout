import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashUserId, initSentry, stagingErrorProbe } from './sentry.ts';

describe('frontend sentry privacy', () => {
  it('hashes emails to opaque ids (no email leakage)', () => {
    const a = hashUserId('j.carter@example.com');
    assert.match(a, /^u_[0-9a-f]{8}$/);
    assert.equal(hashUserId('j.carter@example.com'), a);
    assert.notEqual(hashUserId('other@example.com'), a);
    assert.ok(!a.includes('carter'));
  });

  it('stays inert without a DSN', () => {
    assert.equal(initSentry(), false);
  });

  it('staging probe is a no-op outside staging', () => {
    assert.equal(stagingErrorProbe(), 'not-staging');
  });
});
