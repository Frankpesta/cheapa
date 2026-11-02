import { Redis } from 'ioredis';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { Blocked, HttpError, ResponseTooLarge, RobotsDisallowed } from '../errors.js';
import { send, startServer, type Route, type TestServer } from '../test/server.js';
import { CHEAPA_USER_AGENT, PoliteHttp, type PoliteHttpOptions } from './client.js';
import { RedisDomainLimiter, type RateLimiter } from './limiter.js';
import { RobotsCache } from './robots.js';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
const ok =
  (body = '<html><title>Dress</title></html>'): Route =>
  (res) =>
    send(res, 200, body);
const robots =
  (text: string): Route =>
  (res) =>
    send(res, 200, text, { 'content-type': 'text/plain' });
const noLimit: RateLimiter = { acquire: () => Promise.resolve() };

let server: TestServer;
afterEach(() => server?.close());

async function setup(routes: Record<string, Route>, opts: Partial<PoliteHttpOptions> = {}) {
  server = await startServer({ '/robots.txt': robots('User-agent: *\nAllow: /\n'), ...routes });
  const http = new PoliteHttp({ limiter: noLimit, backoffBaseMs: 1, ...opts });
  return { http, url: (path: string) => server.origin + path };
}

describe('identity and headers', () => {
  it('sends the fixed CheapaBot UA and strips cookies, auth and UA overrides', async () => {
    const { http, url } = await setup({ '/p': ok() });
    const res = await http.get(url('/p'), {
      headers: { 'User-Agent': 'Mozilla/5.0', Cookie: 'session=1', Authorization: 'Bearer x', 'X-Ok': 'yes' },
    });
    expect(res).toMatchObject({ status: 200, notModified: false, body: '<html><title>Dress</title></html>' });
    const hit = server.hits.find((h) => h.path === '/p')!;
    expect(hit.headers['user-agent']).toBe(CHEAPA_USER_AGENT);
    expect(hit.headers['cookie']).toBeUndefined();
    expect(hit.headers['authorization']).toBeUndefined();
    expect(hit.headers['x-ok']).toBe('yes');
    expect(hit.headers['accept']).toContain('text/html');
  });

  it('sends conditional headers and reports 304 as notModified', async () => {
    const { http, url } = await setup({
      '/p': (res, hit) =>
        hit.headers['if-none-match'] === '"v1"' ? send(res, 304) : send(res, 200, 'x', { etag: '"v1"' }),
    });
    const first = await http.get(url('/p'));
    expect(first.headers['etag']).toBe('"v1"');
    const second = await http.get(url('/p'), { etag: '"v1"', lastModified: 'Sun, 01 Nov 2026 00:00:00 GMT' });
    expect(second).toMatchObject({ status: 304, notModified: true, body: '' });
    expect(server.hits.at(-1)!.headers['if-modified-since']).toBe('Sun, 01 Nov 2026 00:00:00 GMT');
  });
});

describe('robots.txt', () => {
  it('honours Disallow for CheapaBot and fetches robots.txt once', async () => {
    const { http, url } = await setup({
      '/robots.txt': robots('User-agent: CheapaBot\nDisallow: /cart\n\nUser-agent: *\nDisallow: /\n'),
      '/p': ok(),
      '/cart': ok(),
    });
    await expect(http.get(url('/p'))).resolves.toMatchObject({ status: 200 });
    await expect(http.get(url('/cart'))).rejects.toBeInstanceOf(RobotsDisallowed);
    await http.get(url('/p'));
    expect(server.count('/robots.txt')).toBe(1);
    expect(server.count('/cart')).toBe(0);
  });

  it('allows everything when robots.txt is missing (404)', async () => {
    const { http, url } = await setup({ '/robots.txt': (res) => send(res, 404), '/p': ok() });
    await expect(http.get(url('/p'))).resolves.toMatchObject({ status: 200 });
  });

  it('disallows everything while robots.txt is erroring (5xx)', async () => {
    const { http, url } = await setup({ '/robots.txt': (res) => send(res, 503), '/p': ok() });
    await expect(http.get(url('/p'))).rejects.toBeInstanceOf(RobotsDisallowed);
    expect(server.count('/robots.txt')).toBe(3); // 1 + 2 retries
    expect(server.count('/p')).toBe(0);
  });

  it('checks robots on every redirect hop', async () => {
    const { http, url } = await setup({
      '/robots.txt': robots('User-agent: *\nDisallow: /private\n'),
      '/go': (res) => send(res, 302, '', { location: '/private/item' }),
      '/private/item': ok(),
    });
    await expect(http.get(url('/go'))).rejects.toBeInstanceOf(RobotsDisallowed);
    expect(server.count('/private/item')).toBe(0);
  });

  it('shares one cache across clients in a process', async () => {
    const cache = new RobotsCache('CheapaBot');
    const { url } = await setup({ '/p': ok() });
    for (let i = 0; i < 2; i += 1) await new PoliteHttp({ limiter: noLimit, robots: cache }).get(url('/p'));
    expect(server.count('/robots.txt')).toBe(1);
  });
});

describe('blocks: stop, never retry', () => {
  it('throws Blocked on the saved 429 response after a single request', async () => {
    const { http, url } = await setup({
      '/p': (res) => send(res, 429, fixture('429-too-many-requests.html')),
    });
    const err = await http.get(url('/p')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Blocked);
    expect((err as Blocked).reason).toBe('status_429');
    expect(server.count('/p')).toBe(1);
  });

  it('throws Blocked on 403', async () => {
    const { http, url } = await setup({ '/p': (res) => send(res, 403, 'Forbidden') });
    await expect(http.get(url('/p'))).rejects.toMatchObject({ name: 'Blocked', reason: 'status_403' });
  });

  it('throws Blocked on a Cloudflare challenge served with 503 or 200', async () => {
    const page = fixture('cloudflare-challenge.html');
    const { http, url } = await setup({
      '/a': (res) => send(res, 503, page),
      '/b': (res) => send(res, 200, page),
    });
    await expect(http.get(url('/a'))).rejects.toMatchObject({ reason: 'challenge' });
    await expect(http.get(url('/b'))).rejects.toMatchObject({ reason: 'challenge' });
    expect(server.count('/a')).toBe(1);
  });

  it('throws Blocked when robots.txt itself is 403', async () => {
    const { http, url } = await setup({ '/robots.txt': (res) => send(res, 403), '/p': ok() });
    await expect(http.get(url('/p'))).rejects.toBeInstanceOf(Blocked);
  });
});

describe('retries', () => {
  it('retries 5xx and succeeds', async () => {
    const { http, url } = await setup({
      '/p': (res, _hit, n) => (n < 3 ? send(res, 502) : send(res, 200, 'ok')),
    });
    await expect(http.get(url('/p'))).resolves.toMatchObject({ status: 200, body: 'ok' });
    expect(server.count('/p')).toBe(3);
  });

  it('gives up after 2 retries with HttpError', async () => {
    const { http, url } = await setup({ '/p': (res) => send(res, 500) });
    await expect(http.get(url('/p'))).rejects.toMatchObject({ name: 'HttpError', status: 500 });
    expect(server.count('/p')).toBe(3);
  });

  it('returns other 4xx to the adapter (e.g. 404 = listing gone)', async () => {
    const { http, url } = await setup({});
    await expect(http.get(url('/gone'))).resolves.toMatchObject({ status: 404 });
    expect(server.count('/gone')).toBe(1);
  });

  it('times out a hanging response and retries it', async () => {
    const { http, url } = await setup({ '/slow': () => undefined }, { timeoutMs: 100 });
    await expect(http.get(url('/slow'))).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(server.count('/slow')).toBe(3);
  });

  it('does not retry when the caller aborts', async () => {
    const { http, url } = await setup({ '/slow': () => undefined });
    const controller = new AbortController();
    const pending = http.get(url('/slow'), { signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toThrow();
    expect(server.count('/slow')).toBe(1);
  });

  it('caps redirects', async () => {
    const { http, url } = await setup({ '/loop': (res) => send(res, 301, '', { location: '/loop' }) });
    await expect(http.get(url('/loop'))).rejects.toBeInstanceOf(HttpError);
  });
});

describe('size cap', () => {
  it('rejects a declared Content-Length over the cap', async () => {
    const { http, url } = await setup({ '/big': ok('x'.repeat(2048)) }, { maxBytes: 1024 });
    await expect(http.get(url('/big'))).rejects.toBeInstanceOf(ResponseTooLarge);
  });

  it('rejects a streamed body that grows past the cap', async () => {
    const { http, url } = await setup(
      {
        '/stream': (res) => {
          res.writeHead(200, { 'content-type': 'text/html' });
          for (let i = 0; i < 4; i += 1) res.write('y'.repeat(512));
          res.end();
        },
      },
      { maxBytes: 1024 },
    );
    await expect(http.get(url('/stream'))).rejects.toBeInstanceOf(ResponseTooLarge);
  });
});

describe('rate limit with two concurrent workers (Redis)', () => {
  it('keeps requests to one domain at most maxRps apart', async () => {
    const redisA = new Redis(inject('redisUrl'));
    const redisB = new Redis(inject('redisUrl'));
    try {
      server = await startServer({ '/robots.txt': robots('User-agent: *\nAllow: /\n'), '/p': ok() });
      // Unique key prefix: other files share this Redis.
      const prefix = `test:${Date.now()}:`;
      const workers = [redisA, redisB].map(
        (r) => new PoliteHttp({ limiter: new RedisDomainLimiter(r, prefix), maxRps: 3 }),
      );
      await Promise.all(Array.from({ length: 6 }, (_, i) => workers[i % 2]!.get(`${server.origin}/p`)));
      const times = server.hits.map((h) => h.at).sort((a, b) => a - b);
      expect(times).toHaveLength(8); // 2 robots.txt (one per worker cache) + 6 pages
      for (let i = 1; i < times.length; i += 1) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(300);
    } finally {
      redisA.disconnect();
      redisB.disconnect();
    }
  });
});
