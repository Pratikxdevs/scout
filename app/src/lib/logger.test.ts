import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  redact,
  addPiiFields,
  configureLogger,
  setTransport,
  startRequest,
  endRequest,
  currentRequestId,
  flush,
  stopLogger,
  readBuffer,
  isHttpsUrl,
  logger,
  type LogLine,
} from './logger.ts';

describe('redact', () => {
  it('redacts secret-named keys at any depth', () => {
    const out = redact({
      user: 'bob',
      password: 'hunter2',
      nested: { api_token: 'abc', keep: 1 },
      list: [{ authorization: 'Bearer x', ok: true }],
    });
    assert.equal(out.user, 'bob');
    assert.equal(out.password, '[redacted]');
    assert.equal(out.nested.api_token, '[redacted]');
    assert.equal(out.nested.keep, 1);
    assert.equal(out.list[0].authorization, '[redacted]');
    assert.equal(out.list[0].ok, true);
  });

  it('matches case-insensitively and redacts personal data', () => {
    const out = redact({ Email: 'a@b.c', PHONE: '123', ssn: '000', note: 'hi' });
    assert.equal(out.Email, '[redacted]');
    assert.equal(out.PHONE, '[redacted]');
    assert.equal(out.ssn, '[redacted]');
    assert.equal(out.note, 'hi');
  });

  it('supports runtime PII extension', () => {
    addPiiFields(['employee_code']);
    assert.equal(redact({ employee_code: 'E1' }).employee_code, '[redacted]');
  });
});

describe('logger levels and ids', () => {
  beforeEach(() => {
    stopLogger();
    configureLogger({ env: 'development', ingestUrl: '' });
    setTransport(null);
    endRequest();
  });

  it('debug is off in production but info passes', () => {
    configureLogger({ env: 'production', ingestUrl: '' });
    assert.equal(logger.debug('e', 'm'), null);
    const line = logger.info('e', 'm');
    assert.ok(line && line.level === 'info');
  });

  it('every line carries request_id and session_id', () => {
    const { requestId } = startRequest('test-action');
    const line = logger.info('search-submit', 'query run', { q: 'react' }) as LogLine;
    assert.equal(line.request_id, requestId);
    assert.equal(line.request_id, currentRequestId());
    assert.ok(typeof line.session_id === 'string' && line.session_id.length > 0);
    assert.equal(line.service, 'scout-app');
    endRequest();
  });

  it('flush ships buffered lines through the transport', async () => {
    const seen: LogLine[][] = [];
    configureLogger({ env: 'development', ingestUrl: 'http://127.0.0.1:1/ingest' });
    setTransport(async (lines) => {
      seen.push(lines);
    });
    logger.info('a', 'one');
    logger.warn('b', 'two');
    await flush();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].length, 2);
    assert.equal(seen[0][0].event, 'a');
    stopLogger();
    setTransport(null);
  });

  it('readBuffer returns a copy that cannot drain the live buffer', async () => {
    configureLogger({ env: 'development', ingestUrl: '' });
    logger.info('buf', 'kept');
    const copy = readBuffer();
    assert.equal(copy.length, 1);
    copy.length = 0;
    assert.equal(readBuffer().length, 1);
    stopLogger();
  });

  it('isHttpsUrl enforces https except loopback http', () => {
    assert.equal(isHttpsUrl('https://x.convex.site/ingest'), true);
    assert.equal(isHttpsUrl('http://localhost:8000/ingest'), true);
    assert.equal(isHttpsUrl('http://127.0.0.1:1/ingest'), true);
    assert.equal(isHttpsUrl('http://192.168.1.5/ingest'), false);
    assert.equal(isHttpsUrl('http://example.com/ingest'), false);
    assert.equal(isHttpsUrl(''), false);
    assert.equal(isHttpsUrl('not-a-url'), false);
  });

  it('refuses to ship to plaintext remote ingest URLs', async () => {
    let called = 0;
    configureLogger({ env: 'development', ingestUrl: 'http://example.com/ingest' });
    setTransport(async () => { called++; });
    logger.info('x', 'must not ship');
    await flush();
    assert.equal(called, 0);
    setTransport(null);
    stopLogger();
  });
});
