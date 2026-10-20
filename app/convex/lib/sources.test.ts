import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hostAllowed, resolveSources } from './sources.ts';

const scoped = resolveSources(['reddit', 'linkedin']);

describe('hostAllowed', () => {
  it('accepts the hosts of the run’s sources (incl. subdomains)', () => {
    assert.equal(hostAllowed('https://www.reddit.com/r/forhire/comments/x', scoped), true);
    assert.equal(hostAllowed('https://uk.linkedin.com/jobs/view/123', scoped), true);
  });

  it('rejects pages from other boards when the run is scoped', () => {
    assert.equal(hostAllowed('https://www.upwork.com/freelance-jobs/react-js/', scoped), false);
    assert.equal(hostAllowed('https://www.freelancer.com/projects/x', scoped), false);
  });

  it('allows any public page when the run has no scope', () => {
    assert.equal(hostAllowed('https://www.upwork.com/freelance-jobs/react-js/', []), true);
  });

  it('rejects unparseable urls', () => {
    assert.equal(hostAllowed('not a url', scoped), false);
    assert.equal(hostAllowed('', scoped), false);
  });

  it('does not treat a lookalike domain as a match', () => {
    assert.equal(hostAllowed('https://notreddit.com/x', scoped), false);
    assert.equal(hostAllowed('https://reddit.com.evil.dev/x', scoped), false);
  });
});
