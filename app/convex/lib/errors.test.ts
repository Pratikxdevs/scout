import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConvexError } from 'convex/values';
import { fail, isScoutFailure, type ErrorCode } from './errors.ts';

const CODES: ErrorCode[] = [
  'INVALID_INPUT', 'UNAUTHENTICATED', 'NOT_FOUND', 'FORBIDDEN', 'CAP_REACHED',
  'SEARCH_ACTIVE', 'PROVIDER_UNCONFIGURED', 'PROVIDER_ERROR', 'INTERNAL',
];

describe('fail (backend error taxonomy)', () => {
  it('carries the code, the message and the retry flag', () => {
    const err = fail('CAP_REACHED', 'You already have 5 hunts in flight.', false);
    assert.ok(err instanceof ConvexError);
    assert.equal(err.data.code, 'CAP_REACHED');
    assert.equal(err.data.message, 'You already have 5 hunts in flight.');
    assert.equal(err.data.retryable, false);
  });

  it('marks provider errors as retryable when asked', () => {
    const err = fail('PROVIDER_ERROR', 'TinyFish HTTP 503', true);
    assert.equal(err.data.retryable, true);
  });

  it('is recognised by isScoutFailure', () => {
    assert.equal(isScoutFailure(fail('INVALID_INPUT', 'nope')), true);
    assert.equal(isScoutFailure(new Error('plain')), false);
    assert.equal(isScoutFailure('string'), false);
  });

  it('only ever uses codes from the taxonomy', () => {
    for (const code of CODES) {
      assert.ok(fail(code, 'x') instanceof ConvexError);
    }
  });
});
