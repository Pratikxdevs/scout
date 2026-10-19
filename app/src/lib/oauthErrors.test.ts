import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { oauthErrorCopy } from './oauthErrors.ts';

describe('oauth error copy', () => {
  it('maps known callback failures to actionable copy', () => {
    assert.match(oauthErrorCopy('account_not_linked') ?? '', /Connected logins/);
    assert.match(oauthErrorCopy('state_mismatch') ?? '', /localhost:2992/);
    assert.match(oauthErrorCopy('invalid_code') ?? '', /try again/);
    assert.match(oauthErrorCopy('oauth_provider_not_found') ?? '', /not configured/);
  });

  it('keeps unknown codes visible instead of swallowing them', () => {
    assert.match(oauthErrorCopy('weird_new_code') ?? '', /weird_new_code/);
    assert.equal(oauthErrorCopy(null), null);
    assert.equal(oauthErrorCopy(''), null);
  });
});
