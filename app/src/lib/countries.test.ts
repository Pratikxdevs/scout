import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, flagFor, matchCountry } from './countries.ts';

describe('COUNTRIES', () => {
  it('covers the ISO 3166-1 set with unique codes', () => {
    assert.ok(COUNTRIES.length >= 240);
    const codes = new Set(COUNTRIES.map((c) => c.code));
    assert.equal(codes.size, COUNTRIES.length);
    assert.ok(COUNTRIES.every((c) => /^[A-Z]{2}$/.test(c.code) && c.name !== ''));
  });
});

describe('matchCountry', () => {
  it('matches exact and aliased names to the canonical entry', () => {
    assert.equal(matchCountry('India'), 'India');
    assert.equal(matchCountry('USA'), 'United States');
    assert.equal(matchCountry('uk'), 'United Kingdom');
    assert.equal(matchCountry('  germany '), 'Germany');
  });
  it('returns "" when nothing matches confidently', () => {
    assert.equal(matchCountry(''), '');
    assert.equal(matchCountry('Atlantis'), '');
  });
});

describe('flagFor', () => {
  it('renders regional-indicator emoji for valid codes only', () => {
    assert.equal(flagFor('US'), '🇺🇸');
    assert.equal(flagFor('in'), '🇮🇳');
    assert.equal(flagFor('usa'), '');
    assert.equal(flagFor(''), '');
  });
});
