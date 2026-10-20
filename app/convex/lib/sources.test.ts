import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hostAllowed, isPostingUrl, resolveSources, sourceByKey, watchlistByKey } from './sources.ts';

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


describe('posting-URL gate', () => {
  it('keeps individual postings on an ATS', () => {
    const gh = sourceByKey('greenhouse')!;
    assert.equal(isPostingUrl('https://job-boards.greenhouse.io/stripe/jobs/123', gh), true);
  });

  it('drops board home pages', () => {
    const gh = sourceByKey('greenhouse')!;
    assert.equal(isPostingUrl('https://job-boards.greenhouse.io/', gh), false);
    assert.equal(isPostingUrl('https://job-boards.greenhouse.io/stripe', gh), false);
  });

  it('keeps locale-prefixed Workday paths (the posting marker is underneath)', () => {
    const wd = sourceByKey('workday')!;
    // A locale variant can 404, but the URL shape is still a posting —
    // that stub is caught later by the thin-page rule (agent fallback).
    assert.equal(isPostingUrl('https://flir.wd1.myworkdayjobs.com/fr-FR/flircareers/job/Software-Developer_REQ31047-1', wd), true);
    assert.equal(isPostingUrl('https://flir.wd1.myworkdayjobs.com/en-US/flircareers/job/Software-Developer_REQ31047-1', wd), true);
    // …but a locale path with no posting shape underneath is still dropped.
    assert.equal(isPostingUrl('https://flir.wd1.myworkdayjobs.com/fr-FR/flircareers/', wd), false);
  });

  it('requires a slug-ish path when the source has no marker', () => {
    const lever = sourceByKey('lever')!;
    assert.equal(isPostingUrl('https://jobs.lever.co/xsolla/2a094b06-bf3b-456a-a136-27c4545cfe00', lever), true);
    assert.equal(isPostingUrl('https://jobs.lever.co/', lever), false);
  });
});

describe('watchlist scopes', () => {
  it('turns a company into a scoped query', () => {
    const resolved = resolveSources(['w:greenhouse:stripe']);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0]?.scope, 'site:job-boards.greenhouse.io/stripe');
    assert.equal(resolved[0]?.hosts[0], 'job-boards.greenhouse.io');
  });

  it('drops unknown watchlist entries', () => {
    assert.equal(watchlistByKey('w:greenhouse:nope'), null);
    assert.deepEqual(resolveSources(['w:greenhouse:nope']), []);
  });
});
