import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS } from './limits.ts';

describe('LIMITS (backend caps)', () => {
  it('keeps the hunt bounded', () => {
    assert.ok(LIMITS.SEARCH.MAX_URLS_PER_RUN <= 50);
    assert.ok(LIMITS.SEARCH.MAX_BATCHES_PER_RUN * LIMITS.SEARCH.BATCH_SIZE >= 20);
    assert.ok(LIMITS.SEARCH.BATCH_SIZE <= 5, 'the provider batches 5 URLs per call');
    assert.ok(LIMITS.SEARCH.MAX_RUNNING_PER_USER <= 10);
  });

  it('keeps the agent fallback rare and short', () => {
    assert.ok(LIMITS.AGENT.MAX_PROCESS_SECONDS <= 120);
    assert.ok(LIMITS.AGENT.MAX_PER_RUN <= 2);
  });

  it('caps the contact meter', () => {
    assert.ok(LIMITS.PIPELINE.CONTACT_CAP > 0);
  });

  it('keeps excerpts inside a sane document size', () => {
    assert.ok(LIMITS.PAGE.MAX_EXCERPT_CHARS > 500);
    assert.ok(LIMITS.PAGE.MAX_EXCERPT_CHARS <= 60_000);
  });
});
