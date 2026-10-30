/**
 * QA, API: logging. Two parts.
 *  1. The logger itself (api/src/logger.ts, tested directly: no server needed): the shape of a line, the levels, and above all that a secret
 *     never reaches a log: passwords, tokens, keys, connection strings, bank details, cost and margin, personal e-mail addresses.
 *  2. The live API: every answer, including refusals and errors, carries a unique X-Request-Id (so a user's problem can be found in the log), the
 *     web app is allowed to read it, and no answer ever contains a stack trace.
 */
import { expect, test } from '@playwright/test';
import { createLogger, emailDomain, errorFields, redact, type Level, type LogLevel } from '../../../api/src/logger';
import { API, call, tokenOf } from '../qa';

/** A logger that keeps what it writes, so a test can read the lines. */
function capture(level: LogLevel = 'debug') {
  const lines: { level: Level; line: string }[] = [];
  const logger = createLogger((l, line) => lines.push({ level: l, line }), level);
  return { logger, lines, parsed: () => lines.map((l) => JSON.parse(l.line) as Record<string, unknown>) };
}

test.describe('the log line', () => {
  test('is one JSON object with a time, a level, a message and the fields given', () => {
    const { logger, lines, parsed } = capture();
    logger.info('request', { id: 'abc', status: 200, ms: 12 });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.line).not.toContain('\n');
    const line = parsed()[0]!;
    expect(line).toMatchObject({ level: 'info', msg: 'request', id: 'abc', status: 200, ms: 12 });
    expect(new Date(line.ts as string).toISOString()).toBe(line.ts);
  });

  test('fields cannot overwrite the time, level or message', () => {
    const { logger, parsed } = capture();
    logger.warn('real message', { ts: 'yesterday', level: 'debug', msg: 'forged' });
    expect(parsed()[0]).toMatchObject({ level: 'warn', msg: 'real message' });
    expect(parsed()[0]!.ts).not.toBe('yesterday');
  });

  test('an audit event is an info line marked audit with its event name', () => {
    const { logger, parsed } = capture();
    logger.audit('quote.issued', { quote: 'q1', user: 'u1' });
    expect(parsed()[0]).toMatchObject({ level: 'info', audit: true, event: 'quote.issued', msg: 'quote.issued', quote: 'q1', user: 'u1' });
  });

  test('a sink that throws never breaks the caller', () => {
    const logger = createLogger(() => { throw new Error('disk full'); }, 'debug');
    expect(() => logger.error('boom', { a: 1 })).not.toThrow();
  });

  test('something that cannot be turned into text still gives a line', () => {
    const { logger, lines } = capture();
    const hostile = { get boom(): never { throw new Error('getter exploded'); } };
    expect(() => logger.info('odd', { hostile })).not.toThrow();
    expect(JSON.parse(lines[0]!.line)).toMatchObject({ msg: "odd", note: "fields could not be written" });
  });
});

test.describe('levels', () => {
  const levels: [LogLevel, Level[]][] = [
    ['debug', ['debug', 'info', 'warn', 'error']], ['info', ['info', 'warn', 'error']], ['warn', ['warn', 'error']], ['error', ['error']], ['silent', []],
  ];
  for (const [setting, expected] of levels) {
    test(`${setting}: writes ${expected.length ? expected.join(', ') : 'nothing'}`, () => {
      const { logger, lines } = capture(setting);
      logger.debug('d'); logger.info('i'); logger.warn('w'); logger.error('e'); logger.audit('a.b');
      const written = new Set(lines.map((l) => l.level));
      for (const l of ['debug', 'info', 'warn', 'error'] as Level[]) expect(written.has(l), `${setting} / ${l}`).toBe(expected.includes(l));
    });
  }

  test('the level can be changed while running', () => {
    const { logger, lines } = capture('error');
    logger.info('hidden');
    logger.setLevel('info');
    logger.info('shown');
    expect(lines.map((l) => JSON.parse(l.line).msg)).toEqual(['shown']);
    expect(logger.level()).toBe('info');
  });
});

test.describe('secrets never reach the log', () => {
  const SECRETS = ['hunter2', 's3cr3t-value', 'eyJhbGciOi.payload.sig', 'mongodb+srv://user:pw@cluster.example', 'abcd efgh ijkl mnop', '123456789012', 'HDFC0001234', '123456.00', '41.5'];

  test('fields named like a secret are replaced, whatever the letter case and however deep', () => {
    const { logger, lines } = capture();
    logger.info('x', {
      password: 'hunter2', PASSWORD: 'hunter2', smtp_pass: 'abcd efgh ijkl mnop', SMTP_PASS: 'abcd efgh ijkl mnop', client_secret: 's3cr3t-value', token: 'eyJhbGciOi.payload.sig', access_token: 'eyJhbGciOi.payload.sig',
      Authorization: 'Bearer eyJhbGciOi.payload.sig', cookie: 's3cr3t-value', apiKey: 's3cr3t-value', api_key: 's3cr3t-value', MONGODB_URI: 'mongodb+srv://user:pw@cluster.example', connectionString: 'mongodb+srv://user:pw@cluster.example',
      bank: { account_no: '123456789012', ifsc: 'HDFC0001234', swift: 'HDFCINBB', ad_code: '0000000' }, cost_rate: '123456.00', margin: { total: '41.5' },
      nested: { deeper: { password: 'hunter2', list: [{ token: 's3cr3t-value' }] } },
    });
    const text = lines[0]!.line;
    for (const secret of SECRETS) expect(text, secret).not.toContain(secret);
    expect(text).toContain('[redacted]');
  });

  test('harmless fields are kept as they are', () => {
    const { logger, parsed } = capture();
    logger.info('x', { quote: 'q1', number: 'JM/Q/001/2026-27', total: '34190.00', currency: 'USD', status: 'sent', user: 'u1', ms: 5 });
    expect(parsed()[0]).toMatchObject({ quote: 'q1', number: 'JM/Q/001/2026-27', total: '34190.00', currency: 'USD', status: 'sent', user: 'u1', ms: 5 });
  });

  test('an e-mail address is reduced to its domain', () => {
    expect(emailDomain('Ali@Buyer.Example')).toBe('@buyer.example');
    expect(emailDomain('a@b@c.com')).toBe('@c.com');
    for (const none of [null, undefined, '', 'no-at-sign', '@']) expect(emailDomain(none), String(none)).toBe('');
  });

  test('an error gives its message, and its stack only when asked', () => {
    const e = new Error('Gmail said no');
    expect(errorFields(e).error).toBe('Gmail said no');
    expect(errorFields(e).stack).toContain('Error: Gmail said no');
    expect(errorFields(e, false).stack).toBeUndefined();
    expect(errorFields('plain text')).toEqual({ error: 'plain text' });
    expect(errorFields(undefined).error).toBe('undefined');
  });

  test('an Error object inside fields is written as its message, without a stack', () => {
    const { logger, lines } = capture();
    logger.error('x', { cause: new Error('inner problem') });
    expect(lines[0]!.line).toContain('inner problem');
    expect(lines[0]!.line).not.toMatch(/\bat \w+.*\.(ts|js):\d+/);
  });
});

test.describe('what is kept short and safe', () => {
  test('long text is cut, long lists are shortened, deep objects stop, loops are broken', () => {
    expect(String(redact('x'.repeat(1000))).length).toBeLessThan(400);
    expect(String(redact('x'.repeat(1000)))).toContain('1000 characters');
    const list = redact(Array.from({ length: 100 }, (_, i) => i)) as unknown[];
    expect(list.length).toBe(21);
    expect(String(list[20])).toContain('80 more');
    const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    expect(JSON.stringify(redact(deep))).toContain('[object]');
    const loop: Record<string, unknown> = { name: 'x' };
    loop.self = loop;
    expect(JSON.stringify(redact(loop))).toContain('[circular]');
  });

  test('dates, ids, bigints, buffers, functions and odd values are all written as text', () => {
    const out = redact({ when: new Date('2026-10-29T10:00:00Z'), id: { toHexString: () => 'a'.repeat(24) }, big: 12n, buf: Buffer.alloc(5), fn: () => 1, sym: Symbol('s'), nothing: null, nope: undefined, bad: new Date('x') }) as Record<string, unknown>;
    expect(out).toMatchObject({ when: '2026-10-29T10:00:00.000Z', id: 'a'.repeat(24), big: '12', buf: '[5 bytes]', fn: '[function]', sym: '[symbol]', nothing: null, bad: 'invalid date' });
  });
});

test.describe('the live API: request ids', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  test('every kind of answer carries an X-Request-Id: ok, refused, not found, bad request, too large', async ({ request }) => {
    const token = await tokenOf('admin');
    const answers = [
      await request.get(`${API.replace('/api/v1', '')}/health`),
      await call(request, null, 'GET', '/me'),
      await call(request, token, 'GET', '/me'),
      await call(request, token, 'GET', '/no-such-route'),
      await call(request, token, 'POST', '/quotes/calculate', { lines: 'nope' }),
      await request.post(`${API}/buyers`, { headers: { 'Content-Type': 'application/json' }, data: '{bad', failOnStatusCode: false }),
      await request.post(`${API}/buyers`, { headers: { 'Content-Type': 'application/json' }, data: JSON.stringify({ notes: 'x'.repeat(1_300_000) }), failOnStatusCode: false }),
    ];
    expect(answers.map((a) => a.status())).toEqual([200, 401, 200, 404, 400, 400, 413]);
    for (const a of answers) expect(a.headers()['x-request-id'], String(a.status())).toMatch(UUID);
  });

  test('every request gets a different id', async ({ request }) => {
    const ids = await Promise.all(Array.from({ length: 25 }, () => call(request, null, 'GET', '/me').then((r) => r.headers()['x-request-id'])));
    expect(new Set(ids).size).toBe(25);
  });

  test('the web app\'s address is allowed to read the request id (so it can show it with an error)', async ({ request }) => {
    const origin = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:5173').origin;
    const res = await call(request, null, 'GET', '/me', undefined, { Origin: origin });
    expect(res.headers()['access-control-expose-headers']?.toLowerCase()).toContain('x-request-id');
  });

  test('a caller never gets a stack trace, a file path or a database message, even for an internal error path', async ({ request }) => {
    const token = await tokenOf('admin');
    const answers = [
      await call(request, token, 'GET', `/buyers/${'z'.repeat(30)}`),
      await call(request, token, 'GET', '/quotes?limit=abc&offset=-1'),
      await call(request, token, 'POST', '/buyers', { company_name: { $ne: null } }),
      await call(request, null, 'GET', '/files/quote-pdf/%00'),
      await request.post(`${API}/buyers`, { headers: { 'Content-Type': 'application/json' }, data: '{bad', failOnStatusCode: false }),
    ];
    for (const a of answers) {
      const text = await a.text();
      expect(text).not.toMatch(/\bat \w+.*\(|node_modules|\.(ts|js):\d+|C:\\|MongoServerError|MongoError|mongodb|ECONN|stack/i);
      expect(a.status()).toBeLessThan(500);
    }
  });
});
