import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseUtm } from './utm.ts';

describe('parseUtm', () => {
  it('picks known params and ignores the rest', () => {
    assert.deepEqual(parseUtm('?utm_source=google&utm_medium=cpc&foo=1'), {
      utm_source: 'google',
      utm_medium: 'cpc',
    });
  });
  it('returns empty for missing or malformed input', () => {
    assert.deepEqual(parseUtm(''), {});
    assert.deepEqual(parseUtm('?foo=1'), {});
    assert.deepEqual(parseUtm('?utm_source='), {});
  });
  it('trims and caps lengths', () => {
    assert.deepEqual(parseUtm('?utm_source=%20x%20'), { utm_source: 'x' });
    const long = 'a'.repeat(500);
    const out = parseUtm(`?utm_source=${long}`);
    assert.equal(out.utm_source?.length, 200);
  });
});
