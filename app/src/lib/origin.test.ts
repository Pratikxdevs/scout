import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalLoopbackRedirect } from './origin.ts';

describe('loopback canonicalization (OAuth state-cookie origin)', () => {
  it('bounces 127.0.0.1 to localhost preserving port/path/query/hash', () => {
    assert.equal(
      canonicalLoopbackRedirect('http://127.0.0.1:2992/login?x=1#y'),
      'http://localhost:2992/login?x=1#y',
    );
  });

  it('leaves localhost, LAN, staging, and prod origins untouched', () => {
    assert.equal(canonicalLoopbackRedirect('http://localhost:2992/'), null);
    assert.equal(canonicalLoopbackRedirect('http://192.168.1.20:2992/'), null);
    assert.equal(canonicalLoopbackRedirect('http://localhost:8090/'), null);
    assert.equal(canonicalLoopbackRedirect('https://app.jobwzrd.io/jobs'), null);
    assert.equal(canonicalLoopbackRedirect('not a url'), null);
  });
});
