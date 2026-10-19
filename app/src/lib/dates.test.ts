import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applicationsThisWeek, avgResponseDays, parseMDY } from './dates.ts';
import type { Application } from '../types.ts';

const NOW = new Date(2026, 9, 18).getTime();

function app(patch: Partial<Application>): Application {
  return {
    id: 'a1', jobId: 'j1', title: 'Engineer', company: 'Acme',
    appliedDate: '10/18/26', status: 'UNDER REVIEW', ...patch,
  };
}

describe('parseMDY', () => {
  it('parses two- and four-digit years', () => {
    assert.equal(parseMDY('10/18/26'), new Date(2026, 9, 18).getTime());
    assert.equal(parseMDY('1/2/2026'), new Date(2026, 0, 2).getTime());
  });
  it('returns NaN for human strings', () => {
    assert.ok(Number.isNaN(parseMDY('today')));
    assert.ok(Number.isNaN(parseMDY('')));
  });
});

describe('applicationsThisWeek', () => {
  it('counts only the last seven days', () => {
    const apps = [
      app({ id: 'a', appliedDate: '10/18/26' }),
      app({ id: 'b', appliedDate: '10/12/26' }),
      app({ id: 'c', appliedDate: '10/10/26' }),
      app({ id: 'd', appliedDate: 'today' }),
    ];
    assert.equal(applicationsThisWeek(apps, NOW), 2);
  });
});

describe('avgResponseDays', () => {
  it('averages responses and ignores pending or withdrawn rows', () => {
    const apps = [
      app({ appliedDate: '10/10/26', updatedAt: '10/12/26', status: 'INTERVIEW SET' }),
      app({ id: 'a2', appliedDate: '10/14/26', updatedAt: '10/18/26', status: 'REJECTED' }),
      app({ id: 'a3', appliedDate: '10/01/26', status: 'UNDER REVIEW' }),
      app({ id: 'a4', appliedDate: '10/01/26', updatedAt: '10/02/26', status: 'WITHDRAWN' }),
    ];
    assert.equal(avgResponseDays(apps), 3);
  });
  it('returns null when nothing has responded', () => {
    assert.equal(avgResponseDays([app({})]), null);
    assert.equal(avgResponseDays([]), null);
  });
});
