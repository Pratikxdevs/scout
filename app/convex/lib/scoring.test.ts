import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { excerptSupported, scoreLead, skillMatchRatio } from './scoring.ts';
import { domainClass } from './urls.ts';

const page = 'We need a React developer for a 4 week project. Budget: $2000–$5000 fixed price.';

describe('excerptSupported (the evidence gate)', () => {
  it('accepts a verbatim excerpt', () => {
    assert.equal(excerptSupported(page, 'Budget: $2000–$5000 fixed price'), true);
  });

  it('rejects a paraphrase', () => {
    assert.equal(excerptSupported(page, 'the client pays about three thousand dollars'), false);
  });

  it('rejects too-short or too-long excerpts', () => {
    assert.equal(excerptSupported(page, 'Budget'), false);
    assert.equal(excerptSupported(page, 'x'.repeat(301)), false);
  });

  it('ignores case and whitespace differences but not wording', () => {
    assert.equal(excerptSupported(page, 'budget:   $2000–$5000   fixed price'), true);
    assert.equal(excerptSupported(page, 'Budget: $2000-$5000 fixed price'), false);
  });
});

describe('skillMatchRatio', () => {
  it('measures ICP skill overlap in the page text', () => {
    assert.equal(skillMatchRatio(['react', 'typescript'], 'React and TypeScript project'), 1);
    assert.equal(skillMatchRatio(['react', 'typescript'], 'a python script'), 0);
    assert.equal(skillMatchRatio([], 'anything'), 0);
  });
});

describe('scoreLead', () => {
  const base = {
    skillMatchRatio: 0.8,
    publishedAt: Date.now(),
    budget: { verified: true, min: 2000, max: 5000 },
    icpBudget: { min: 1000, max: 10000 },
    domain: 'upwork.com',
  };

  it('scores a good, fresh, funded lead high', () => {
    const s = scoreLead({ ...base, intent: 'hiring_now' });
    assert.ok(s.overall >= 70, `expected >= 70, got ${s.overall}`);
    assert.equal(s.intent, 95);
    assert.equal(s.budgetFit, 100);
  });

  it('never rewards an unknown date or an unstated budget', () => {
    const s = scoreLead({ ...base, intent: 'hiring_now', publishedAt: null, budget: { verified: false, min: null, max: null } });
    assert.equal(s.freshness, 0);
    assert.equal(s.budgetFit, 0);
    assert.ok(s.overall < scoreLead({ ...base, intent: 'hiring_now' }).overall);
  });

  it('scores an anti-freelance page at the bottom', () => {
    const s = scoreLead({ ...base, intent: 'anti_freelance', skillMatchRatio: 0 });
    assert.equal(s.intent, 5);
    // intent is the biggest weight: an ad flattens the lead far below a hire
    assert.ok(s.overall < 50, `expected < 50, got ${s.overall}`);
    assert.ok(s.overall < scoreLead({ ...base, intent: 'hiring_now' }).overall / 2);
  });

  it('keeps the weighted parts inside the whole', () => {
    const s = scoreLead({ ...base, intent: 'exploring' });
    const sum = s.intent * 0.30 + s.skill * 0.25 + s.freshness * 0.20 + s.budgetFit * 0.10 + s.sourceReliability * 0.15;
    assert.ok(Math.abs(sum - s.overall) <= 1, `weighted sum ${sum} vs overall ${s.overall}`);
  });

  it('always explains itself', () => {
    const s = scoreLead({ ...base, intent: 'hiring_now' });
    assert.ok(s.explanation.length > 10);
  });
});

describe('domainClass (source reliability)', () => {
  it('classifies the boards we hunt', () => {
    assert.equal(domainClass('upwork.com'), 'job_board');
    assert.equal(domainClass('naukri.com'), 'job_board');
    assert.equal(domainClass('linkedin.com'), 'job_board');
    assert.equal(domainClass('reddit.com'), 'community');
  });

  it('treats unknown hosts as low reliability', () => {
    assert.equal(domainClass('some-random-blog.xyz'), 'low');
  });
});
