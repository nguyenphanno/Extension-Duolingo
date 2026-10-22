// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * HttpClient.test.ts — the layer that actually touches the network.
 *
 * `fetch` is stubbed at the global, so every assertion is about behaviour the
 * client owns: retry policy, error mapping, mutation spacing and the adaptive
 * throttle. No real sockets, no mock library.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpClient } from '../src/Core/Http/HttpClient.ts';
import { AppError } from '../src/Shared/Result.ts';

const realFetch = globalThis.fetch;
let calls: Array<{ url: string; init: RequestInit }> = [];

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function mockFetch(handler: Handler): void {
  calls = [];
  globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(handler(String(input), init));
  }) as typeof fetch;
}

/** A response that never settles until the request is aborted. */
const hangUntilAborted: Handler = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init.signal as AbortSignal | undefined;
    const fail = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal?.aborted) {
      fail();
      return;
    }
    signal?.addEventListener('abort', fail, { once: true });
  });

function client(overrides: Partial<{ timeoutMs: number; retries: number; minMutationGapMs: number }> = {}) {
  return new HttpClient(
    { Authorization: 'Bearer test-token' },
    { timeoutMs: 2000, retries: 0, minMutationGapMs: 0, ...overrides },
  );
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
});

describe('request', () => {
  it('returns the status and parsed body', async () => {
    mockFetch(() => json({ id: 7, username: 'ada' }));
    const response = await client().request<{ id: number }>('https://www.duolingo.com/2017-06-30/users/7');

    assert.equal(response.status, 200);
    assert.equal(response.data.id, 7);
    assert.equal(calls.length, 1);
  });

  it('sends the base headers with credentials omitted', async () => {
    mockFetch(() => json({}));
    await client().json('https://www.duolingo.com/2017-06-30/users/7');

    const { init } = calls[0];
    const headers = init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer test-token');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.cache, 'no-store');
  });

  it('only sets Content-Type when there is a body', async () => {
    mockFetch(() => json({}));
    const http = client();
    await http.json('https://www.duolingo.com/2017-06-30/users/7');
    await http.json('https://www.duolingo.com/2017-06-30/sessions', { method: 'POST', body: { a: 1 } });

    assert.equal((calls[0].init.headers as Record<string, string>)['Content-Type'], undefined);
    assert.equal((calls[1].init.headers as Record<string, string>)['Content-Type'], 'application/json');
    assert.equal(calls[1].init.body, JSON.stringify({ a: 1 }));
  });

  it('wraps a non-JSON body as { raw }', async () => {
    mockFetch(() => new Response('<html>oops</html>', { status: 200 }));
    const data = await client().json<{ raw: string }>('https://www.duolingo.com/x');

    assert.equal(data.raw, '<html>oops</html>');
  });

  it('returns null for an empty body', async () => {
    mockFetch(() => new Response('', { status: 200 }));
    assert.equal(await client().json('https://www.duolingo.com/x'), null);
  });
});

describe('error mapping', () => {
  it('maps 404 to a non-retryable HTTP error and does not retry it', async () => {
    mockFetch(() => json({ error: 'not found' }, 404));

    await assert.rejects(client({ retries: 2 }).json('https://www.duolingo.com/x'), (error: AppError) => {
      assert.equal(error.code, 'HTTP');
      assert.equal(error.status, 404);
      assert.equal(error.retryable, false);
      return true;
    });
    assert.equal(calls.length, 1);
  });

  it('maps 401 to UNAUTHORIZED', async () => {
    mockFetch(() => json({}, 401));
    await assert.rejects(client().json('https://www.duolingo.com/x'), (error: AppError) => {
      assert.equal(error.code, 'UNAUTHORIZED');
      assert.equal(error.status, 401);
      return true;
    });
  });

  it('uses the label in the error message', async () => {
    mockFetch(() => json({}, 500));
    await assert.rejects(client().json('https://www.duolingo.com/x', { label: 'Claim CHEST' }), /Claim CHEST → HTTP 500/);
  });

  it('retries a 500 and then succeeds', async () => {
    let attempt = 0;
    mockFetch(() => (++attempt === 1 ? json({}, 500) : json({ ok: true })));

    const data = await client({ retries: 1 }).json<{ ok: boolean }>('https://www.duolingo.com/x');

    assert.equal(data.ok, true);
    assert.equal(calls.length, 2);
  });

  it('throws once retries are exhausted', async () => {
    mockFetch(() => json({}, 503));

    await assert.rejects(client({ retries: 1 }).json('https://www.duolingo.com/x'), (error: AppError) => {
      assert.equal(error.status, 503);
      assert.equal(error.retryable, true);
      return true;
    });
    assert.equal(calls.length, 2);
  });
});

describe('adaptive throttle', () => {
  it('widens the gap and parks the client after a 429', async () => {
    mockFetch(() => json({}, 429, { 'Retry-After': '2' }));
    const http = client();
    const before = Date.now();

    await assert.rejects(http.json('https://www.duolingo.com/x'), (error: AppError) => {
      assert.equal(error.code, 'RATE_LIMITED');
      assert.equal(error.retryAfterMs, 2000);
      return true;
    });

    const pacing = http.pacing;
    assert.equal(pacing.factor, 1.75);
    assert.equal(pacing.rateLimitHits, 1);
    assert.ok(pacing.holdUntil !== null && pacing.holdUntil >= before + 1900);
  });

  it('compounds the factor but caps it', async () => {
    mockFetch(() => json({}, 429));
    const http = client();

    for (let hit = 0; hit < 6; hit += 1) {
      await assert.rejects(http.json('https://www.duolingo.com/x'));
    }

    assert.equal(http.pacing.factor, 6);
    assert.equal(http.pacing.rateLimitHits, 6);
  });

  it('ignores an unparseable Retry-After but still throttles', async () => {
    mockFetch(() => json({}, 429, { 'Retry-After': 'soon' }));
    const http = client();

    await assert.rejects(http.json('https://www.duolingo.com/x'));
    assert.equal(http.pacing.factor, 1.75);
    assert.equal(http.pacing.holdUntil, null);
  });

  it('reads an HTTP-date Retry-After', async () => {
    const at = new Date(Date.now() + 5000).toUTCString();
    mockFetch(() => json({}, 429, { 'Retry-After': at }));
    const http = client();

    await assert.rejects(http.json('https://www.duolingo.com/x'), (error: AppError) => {
      assert.ok(error.retryAfterMs !== undefined && error.retryAfterMs > 3000);
      return true;
    });
  });

  it('starts neutral', () => {
    assert.deepEqual(client().pacing, { factor: 1, holdUntil: null, rateLimitHits: 0 });
  });
});

describe('cancellation and timeout', () => {
  it('reports CANCELLED when the signal is already aborted', async () => {
    mockFetch(hangUntilAborted);
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      client().json('https://www.duolingo.com/x', { signal: controller.signal }),
      (error: AppError) => {
        assert.equal(error.code, 'CANCELLED');
        assert.equal(error.retryable, false);
        return true;
      },
    );
  });

  it('reports CANCELLED when aborted mid-flight', async () => {
    mockFetch(hangUntilAborted);
    const controller = new AbortController();
    const pending = client().json('https://www.duolingo.com/x', { signal: controller.signal });

    setTimeout(() => controller.abort(), 5);

    await assert.rejects(pending, (error: AppError) => {
      assert.equal(error.code, 'CANCELLED');
      return true;
    });
  });

  it('reports a retryable TIMEOUT when the request outlives timeoutMs', async () => {
    mockFetch(hangUntilAborted);

    await assert.rejects(client({ timeoutMs: 20 }).json('https://www.duolingo.com/x'), (error: AppError) => {
      assert.equal(error.code, 'TIMEOUT');
      assert.equal(error.retryable, true);
      return true;
    });
  });
});

describe('mutation spacing', () => {
  it('spaces consecutive mutations', async () => {
    mockFetch(() => json({}));
    const http = client({ minMutationGapMs: 60 });
    const started = Date.now();

    await http.json('https://www.duolingo.com/a', { method: 'POST', body: {} });
    await http.json('https://www.duolingo.com/b', { method: 'PATCH', body: {} });

    assert.ok(Date.now() - started >= 55, 'second mutation should wait for the minimum gap');
  });

  it('does not space reads', async () => {
    mockFetch(() => json({}));
    const http = client({ minMutationGapMs: 60 });
    const started = Date.now();

    await http.json('https://www.duolingo.com/a');
    await http.json('https://www.duolingo.com/b');

    assert.ok(Date.now() - started < 40, 'reads must not be throttled');
  });
});
