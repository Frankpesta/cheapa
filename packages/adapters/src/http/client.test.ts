import { Redis } from 'ioredis';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { Blocked, HttpError, ResponseTooLarge, RobotsDisallowed } from '../errors.js';
import { send, startServer, type Route, type TestServer } from '../test-server.js';
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

  it('treats 401/403 on robots.txt as no rules (RFC 9309), but 403 on a page as blocked', async () => {
    const { http, url } = await setup({
      '/robots.txt': (res) => send(res, 403, '<Error><Code>AccessDenied</Code></Error>'),
      '/p': ok(),
      '/private': (res) => send(res, 403),
    });
    await expect(http.get(url('/p'))).resolves.toMatchObject({ status: 200 });
    await expect(http.get(url('/private'))).rejects.toBeInstanceOf(Blocked);
  });

  it('throws Blocked when robots.txt itself is 429', async () => {
    const { http, url } = await setup({ '/robots.txt': (res) => send(res, 429), '/p': ok() });
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
    const controller = new AbortController();
    // Abort once the server has the request (not after a fixed delay, which flakes under load).
    const { http, url } = await setup({ '/slow': () => controller.abort() });
    const pending = http.get(url('/slow'), { signal: controller.signal });
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

describe('robots.txt Crawl-delay', () => {
  /** Records the rps each request was limited at. */
  const recordingLimiter = (calls: { domain: string; rps: number; maxWaitMs?: number }[]): RateLimiter => ({
    acquire: (domain, rps, _signal, maxWaitMs) => {
      calls.push({ domain, rps, ...(maxWaitMs !== undefined ? { maxWaitMs } : {}) });
      return Promise.resolve();
    },
  });

  it('limits the host to one request per Crawl-delay seconds', async () => {
    const calls: { domain: string; rps: number }[] = [];
    server = await startServer({
      '/robots.txt': robots('User-agent: *\nCrawl-delay: 150\n'),
      '/img.jpg': ok('x'),
    });
    const http = new PoliteHttp({ limiter: recordingLimiter(calls), maxRps: 2 });
    await http.getBytes(server.origin + '/img.jpg');
    expect(calls.map((c) => c.rps)).toEqual([2, 1 / 150]);
  });

  it('passes maxSlotWaitMs through and skips the limiter when holding a reserved slot', async () => {
    const calls: { domain: string; rps: number; maxWaitMs?: number }[] = [];
    server = await startServer({ '/robots.txt': robots('User-agent: *\nAllow: /\n'), '/img.jpg': ok('x') });
    const http = new PoliteHttp({ limiter: recordingLimiter(calls) });
    await http.getBytes(server.origin + '/img.jpg', { maxSlotWaitMs: 5000 });
    expect(calls.at(-1)).toMatchObject({ maxWaitMs: 5000 });
    const before = calls.length;
    await http.getBytes(server.origin + '/img.jpg', { maxSlotWaitMs: 5000, slotAt: Date.now() });
    expect(calls.length).toBe(before);
    expect(server.count('/img.jpg')).toBe(2);
  });
});

describe('getBytes (listing images)', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00]);
  const image: Route = (res) => {
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(png.length) });
    res.end(png);
  };

  it('returns the bytes untouched with an image Accept header', async () => {
    let accept = '';
    const { http, url } = await setup({
      '/img.png': (res, hit, n) => {
        accept = String(hit.headers['accept'] ?? '');
        image(res, hit, n);
      },
    });
    const res = await http.getBytes(url('/img.png'));
    expect(Buffer.from(res.bytes).equals(png)).toBe(true);
    expect(accept).toMatch(/^image\//);
  });

  it('applies the per-request size cap', async () => {
    const { http, url } = await setup({ '/img.png': image });
    await expect(http.getBytes(url('/img.png'), { maxBytes: 4 })).rejects.toBeInstanceOf(ResponseTooLarge);
  });

  it('throws on a 404 and treats 403 as blocked', async () => {
    const { http, url } = await setup({
      '/gone.png': (res) => send(res, 404, 'nope'),
      '/no.png': (res) => send(res, 403, 'no'),
    });
    await expect(http.getBytes(url('/gone.png'))).rejects.toBeInstanceOf(HttpError);
    await expect(http.getBytes(url('/no.png'))).rejects.toBeInstanceOf(Blocked);
  });

  it('honours robots.txt', async () => {
    server = await startServer({
      '/robots.txt': robots('User-agent: *\nDisallow: /img\n'),
      '/img.png': image,
    });
    const http = new PoliteHttp({ limiter: noLimit, backoffBaseMs: 1 });
    await expect(http.getBytes(server.origin + '/img.png')).rejects.toBeInstanceOf(RobotsDisallowed);
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
      // The limiter spaces departures 333 ms apart; arrival times carry event-loop jitter when
      // the whole repo tests in parallel. No gap under 250 ms, and 300 ms+ on average.
      const gaps = times.slice(1).map((t, i) => t - times[i]!);
      for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(250);
      expect(gaps.reduce((a, g) => a + g, 0) / gaps.length).toBeGreaterThanOrEqual(300);
    } finally {
      redisA.disconnect();
      redisB.disconnect();
    }
  });
});
