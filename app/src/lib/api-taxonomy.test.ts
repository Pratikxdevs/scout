import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, isHttpsApiUrl, toUserMessage } from '../services/api.ts';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('toUserMessage', () => {
  it('passes server messages through verbatim', () => {
    assert.equal(
      toUserMessage({ code: 'CAP_REACHED', status: 409, message: 'daily cap reached (5/day). Nothing was submitted.' }),
      'daily cap reached (5/day). Nothing was submitted.',
    );
  });

  it('prefixes held states distinctly from caps', () => {
    assert.equal(
      toUserMessage({ code: 'HELD', status: 200, message: 'captcha required' }),
      'Waiting on you: captcha required',
    );
  });

  it('maps codes to honest copies when the server is silent', () => {
    assert.equal(toUserMessage({ code: 'NETWORK', status: 0, message: '' }), "Couldn't reach the server — try again.");
    assert.equal(toUserMessage({ code: 'UNAUTHENTICATED', status: 401, message: '' }), 'Log in again to continue.');
    assert.equal(toUserMessage({ code: 'NOT_FOUND', status: 404, message: '' }), 'That item no longer exists.');
    assert.equal(toUserMessage({ code: 'CAP_REACHED', status: 409, message: '' }), 'Daily cap reached — nothing was submitted.');
    assert.equal(toUserMessage({ code: 'DRAFT_LOCKED', status: 409, message: '' }), 'That draft is already approved — nothing was changed.');
    assert.equal(toUserMessage({ code: 'SEARCH_ACTIVE', status: 409, message: '' }), 'A search is already running — wait for it to finish.');
    assert.equal(toUserMessage({ code: 'INVALID_INPUT', status: 400, message: '' }), 'Check the highlighted fields and try again.');
    assert.equal(toUserMessage({ code: 'INVALID_TRANSITION', status: 409, message: '' }), "That action isn't available right now — refresh and try again.");
    assert.equal(toUserMessage({ code: 'BODY_TOO_LARGE', status: 413, message: '' }), 'That was too large to send — try a smaller batch.');
    assert.equal(toUserMessage({ code: 'HELD', status: 200, message: '' }), 'Waiting on you: complete the browser step — nothing was auto-solved.');
    assert.equal(toUserMessage({ code: 'WEIRD', status: 500, message: '' }), 'Server hiccup — nothing was lost, try again.');
    assert.equal(toUserMessage(null), 'Server hiccup — nothing was lost, try again.');
  });
});

describe('isHttpsApiUrl', () => {
  it('enforces https except loopback http', () => {
    assert.equal(isHttpsApiUrl('https://x.convex.site'), true);
    assert.equal(isHttpsApiUrl('http://localhost:3000'), true);
    assert.equal(isHttpsApiUrl('http://127.0.0.1:8000'), true);
    assert.equal(isHttpsApiUrl('http://10.0.0.5'), false);
    assert.equal(isHttpsApiUrl('http://example.com'), false);
    assert.equal(isHttpsApiUrl('not-a-url'), false);
  });
});

describe('apiFetch', () => {  it('returns the envelope on success', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { ok: true, rows: [1], demo: true })) as typeof fetch;
    const body = await apiFetch<{ rows: number[] }>('/applications');
    assert.deepEqual(body.rows, [1]);
  });

  it('throws a typed ApiError on {ok:false} envelopes', async () => {
    globalThis.fetch = (async () => jsonResponse(409, { ok: false, code: 'CAP_REACHED', message: '', demo: true })) as typeof fetch;
    await assert.rejects(apiFetch('/applications', { method: 'POST', body: {} }), (e: unknown) => {
      const err = e as { code: string; status: number };
      return err.code === 'CAP_REACHED' && err.status === 409;
    });
  });

  it('maps bare 401s to UNAUTHENTICATED', async () => {
    globalThis.fetch = (async () => new Response('unauthorized', { status: 401 })) as typeof fetch;
    await assert.rejects(apiFetch('/usage'), (e: unknown) => {
      return (e as { code: string }).code === 'UNAUTHENTICATED';
    });
  });

  it('maps network failure to NETWORK', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('down'))) as typeof fetch;
    await assert.rejects(apiFetch('/usage'), (e: unknown) => {
      return (e as { code: string }).code === 'NETWORK';
    });
  });

  it('sends credentials + request id headers', async () => {
    let seen: Record<string, string> = {};
    let creds: RequestCredentials | undefined;
    globalThis.fetch = ((...args: [RequestInfo | URL, RequestInit?]) => {
      const init = args[1];
      seen = { ...(init?.headers as Record<string, string>) };
      creds = init?.credentials;
      return Promise.resolve(jsonResponse(200, { ok: true, demo: true }));
    }) as typeof fetch;
    await apiFetch('/usage');
    assert.equal(creds, 'include');
    assert.ok(typeof seen['X-Request-Id'] === 'string' && seen['X-Request-Id'].length > 0);
  });
});
