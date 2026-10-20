import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planQueries } from './planner.ts';
import { SOURCES, resolveSources, sourceByKey } from './sources.ts';

describe('planQueries (scoped)', () => {
  it('emits one scoped query per source', () => {
    const sources = resolveSources(['reddit', 'linkedin']);
    const plan = planQueries('react developer', null, sources);
    assert.equal(plan.length, 2);
    assert.ok(plan[0].includes('site:reddit.com/r/forhire'));
    assert.ok(plan[1].includes('site:linkedin.com/jobs/view'));
    assert.ok(plan[0].startsWith('react developer'));
  });

  it('never puts two site: scopes in one query (the provider ANDs them)', () => {
    const sources = resolveSources(['reddit', 'naukri', 'freelancer']);
    for (const q of planQueries('dev', null, sources)) {
      assert.equal((q.match(/site:/g) ?? []).length, 1);
    }
  });

  it('falls back to a generic plan when no source is picked', () => {
    const plan = planQueries('react developer', { services: ['frontend'], industries: ['saas'], keywords: ['next.js'] });
    assert.equal(plan.length, 3);
    assert.ok(plan.some(q => q.includes('frontend')));
    assert.ok(plan.some(q => q.includes('next.js')));
  });

  it('handles an empty query without producing junk', () => {
    const plan = planQueries('   ', null, []);
    assert.equal(plan.length, 3);
    assert.ok(plan.every(q => q.trim().length > 0));
  });
});

describe('source registry', () => {
  it('knows every source it lists', () => {
    for (const s of SOURCES) {
      assert.ok(sourceByKey(s.key) !== null);
      assert.ok(s.scope.startsWith('site:'));
      assert.ok(s.hosts.length > 0);
    }
  });

  it('drops unknown and duplicate keys', () => {
    const resolved = resolveSources(['reddit', 'reddit', 'nope', 'linkedin']);
    assert.deepEqual(resolved.map(s => s.key), ['reddit', 'linkedin']);
  });

  it('returns nothing for an undefined list', () => {
    assert.deepEqual(resolveSources(undefined), []);
  });
});
