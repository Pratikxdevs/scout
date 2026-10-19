import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeHttpUrl } from './urls.ts';

describe('isSafeHttpUrl', () => {
  it('accepts https and http', () => {
    assert.equal(isSafeHttpUrl('https://stripe.com/jobs'), true);
    assert.equal(isSafeHttpUrl('http://example.com/a?b=1'), true);
  });
  it('accepts same-origin relative paths', () => {
    assert.equal(isSafeHttpUrl('/jobs'), true);
    assert.equal(isSafeHttpUrl('/logos/stripe.svg'), true);
  });
  it('rejects dangerous schemes', () => {
    assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
    assert.equal(isSafeHttpUrl('data:text/html,<h1>x</h1>'), false);
    assert.equal(isSafeHttpUrl('vbscript:msgbox(1)'), false);
    assert.equal(isSafeHttpUrl('//evil.com/x'), false);
  });
  it('rejects non-strings and blanks', () => {
    assert.equal(isSafeHttpUrl(''), false);
    assert.equal(isSafeHttpUrl('   '), false);
    assert.equal(isSafeHttpUrl(null), false);
    assert.equal(isSafeHttpUrl(undefined), false);
    assert.equal(isSafeHttpUrl(42), false);
    assert.equal(isSafeHttpUrl('not a url'), false);
  });
});

