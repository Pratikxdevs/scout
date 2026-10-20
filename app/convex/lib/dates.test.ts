import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRelativeDate, relativeDateIn } from './dates.ts';

const NOW = Date.parse('2026-10-21T12:00:00.000Z');
const DAY = 86_400_000;

describe('relativeDateIn', () => {
  it('reads day ages', () => {
    const ts = relativeDateIn('posted 3 days ago', NOW);
    assert.ok(ts !== null);
    assert.equal(ts, NOW - 3 * DAY);
  });

  it('reads month and year ages', () => {
    assert.equal(relativeDateIn('2mo ago', NOW), NOW - 2 * 2_592_000_000);
    assert.equal(relativeDateIn('1 year ago', NOW), NOW - 31_536_000_000);
  });

  it('finds the age inside a longer sentence', () => {
    const text = 'Company: Acme · Location: Remote · 5 days ago · Apply now';
    assert.equal(relativeDateIn(text, NOW), NOW - 5 * DAY);
  });

  it('returns null when the page states no age', () => {
    assert.equal(relativeDateIn('No date on this page at all', NOW), null);
    assert.equal(relativeDateIn('', NOW), null);
  });

  it('ignores nonsense values', () => {
    assert.equal(relativeDateIn('0 days ago', NOW), null);
    assert.equal(relativeDateIn('many days ago', NOW), null);
  });

  it('knows a relative date from a real one', () => {
    assert.equal(isRelativeDate('3d ago'), true);
    assert.equal(isRelativeDate('2026-01-04'), false);
  });
});
