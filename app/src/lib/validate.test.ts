import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidEmail, isValidJob, validJobs } from './validate.ts';

const GOOD = {
  id: 'JW-101',
  title: 'Senior Fullstack Engineer',
  company: 'Stripe',
  location: 'Remote / Global',
  compensation: '$150k – $180k',
  description: 'Lead the flagship dashboards.',
  requirements: ['React'],
  match: 98,
  url: 'https://stripe.com/jobs',
  posted: '2h ago',
  type: 'Full-time',
};

describe('isValidJob', () => {
  it('accepts a well-formed job', () => {
    assert.equal(isValidJob(GOOD), true);
  });
  it('rejects malformed rows', () => {
    assert.equal(isValidJob(null), false);
    assert.equal(isValidJob({}), false);
    assert.equal(isValidJob({ ...GOOD, type: 'Freelance' }), false);
    assert.equal(isValidJob({ ...GOOD, match: '98' }), false);
    assert.equal(isValidJob({ ...GOOD, requirements: 'React' }), false);
  });
});

describe('validJobs', () => {
  it('filters a mixed list and rejects non-arrays', () => {
    assert.deepEqual(validJobs([GOOD, null, { ...GOOD, id: 7 }]).length, 1);
    assert.deepEqual(validJobs(null), []);
    assert.deepEqual(validJobs({}), []);
  });
});

describe('isValidEmail', () => {
  it('accepts normal addresses and trims', () => {
    assert.equal(isValidEmail('you@example.com'), true);
    assert.equal(isValidEmail('  you@example.com  '), true);
  });
  it('rejects malformed addresses', () => {
    assert.equal(isValidEmail(''), false);
    assert.equal(isValidEmail('no-at-here'), false);
    assert.equal(isValidEmail('a@b'), false);
    assert.equal(isValidEmail('a@b@c.com'), false);
    assert.equal(isValidEmail('a b@c.com'), false);
  });
});
