import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDraft, appendSignature } from './outreachDraft.ts';

describe('parseDraft', () => {
  it('keeps company and job context through a round-trip', () => {
    const raw = {
      jobId: 'JW-101', jobTitle: 'Frontend Engineer', company: 'Stripe',
      to: 'recruiter@stripe.com', subject: 'Quick intro', body: 'Hi there',
    };
    assert.deepEqual(parseDraft(raw), raw);
  });

  it('accepts the old inbox handoff shape (missing company)', () => {
    assert.deepEqual(
      parseDraft({ jobId: 'j1', to: 'a@b.co', subject: 'Hi', body: 'Body' }),
      { jobId: 'j1', jobTitle: undefined, company: undefined, to: 'a@b.co', subject: 'Hi', body: 'Body' },
    );
  });

  it('rejects junk and fully empty records', () => {
    assert.equal(parseDraft(null), null);
    assert.equal(parseDraft('draft'), null);
    assert.equal(parseDraft({}), null);
    assert.equal(parseDraft({ subject: 42, body: [] }), null);
  });

  it('coerces non-string fields instead of throwing', () => {
    assert.deepEqual(
      parseDraft({ jobId: 7, company: null, to: 'a@b.co', subject: 'Hi', body: 'Body' }),
      { jobId: undefined, jobTitle: undefined, company: undefined, to: 'a@b.co', subject: 'Hi', body: 'Body' },
    );
  });
});

describe('appendSignature', () => {
  it('adds a trimmed signature exactly once', () => {
    const sig = '  Best regards,\nAlex  ';
    const once = appendSignature('Hi there', sig);
    assert.equal(once, 'Hi there\n\nBest regards,\nAlex');
    assert.equal(appendSignature(once, sig), once);
  });

  it('leaves the body untouched when no signature is set', () => {
    assert.equal(appendSignature('Hi there', '   '), 'Hi there');
  });
});
