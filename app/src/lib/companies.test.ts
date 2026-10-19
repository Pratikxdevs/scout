import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCompanyCatalog, COMPANY_PROFILES } from '../data/companies.ts';
import type { Job } from '../types.ts';

function job(company: string, id: string): Job {
  return {
    id, title: 'Engineer', company, location: 'Remote', compensation: '$150k',
    description: 'Build things', requirements: ['TypeScript'], match: 80,
    url: `https://example.com/${id}`, posted: 'today', type: 'Full-time',
  };
}

describe('buildCompanyCatalog', () => {
  it('counts roles from the live feed and ignores company case', () => {
    const rows = buildCompanyCatalog([job('Stripe', '1'), job('stripe', '2')]);
    assert.equal(rows.find((r) => r.name === 'Stripe')?.openRoles, 2);
  });

  it('keeps every editorial profile with an honest zero when the feed is empty', () => {
    const rows = buildCompanyCatalog([]);
    assert.equal(rows.length, COMPANY_PROFILES.length);
    assert.ok(rows.every((r) => r.openRoles === 0));
  });

  it('adds feed-only employers without inventing research copy', () => {
    const rows = buildCompanyCatalog([job('Acme Robotics', '1')]);
    const acme = rows.find((r) => r.name === 'Acme Robotics');
    assert.equal(acme?.openRoles, 1);
    assert.equal(acme?.sector, 'Other');
    assert.equal(acme?.hq, undefined);
    assert.match(acme?.about ?? '', /not available yet/);
  });

  it('sorts companies with open roles first', () => {
    const rows = buildCompanyCatalog([job('Apple', '1')]);
    assert.equal(rows[0].name, 'Apple');
    assert.ok(rows.slice(1).every((r) => r.openRoles === 0));
  });
});
