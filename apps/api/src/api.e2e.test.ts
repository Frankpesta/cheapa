/**
 * 01-foundation.md 1.5 acceptance: typed stub routes, 429 after the device limit,
 * uploads never touch disk; plus /health (1.3) and the request-id contract.
 */
import { HealthResponse, PriceHistoryResponse, ProductResponse, SearchResponse } from '@cheapa/core';
import { canonicalProducts, listings, priceHistory, stores } from '@cheapa/db/catalog';
import { readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Harness, image, multipart, pngBytes, startHarness } from './test/harness.js';

const DEVICE_LIMIT = 3;
const IP_LIMIT = 5;
let h: Harness;

const device = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const inject = (opts: Parameters<Harness['app']['inject']>[0]) => h.app.inject(opts);

beforeAll(async () => {
  h = await startHarness({
    RATE_LIMIT_IMAGE_PER_DEVICE_HOUR: String(DEVICE_LIMIT),
    RATE_LIMIT_IMAGE_PER_IP_HOUR: String(IP_LIMIT),
  });
});

afterAll(async () => {
  await h?.stop();
});

describe('GET /health', () => {
  it('reports every dependency ok', async () => {
    const res = await inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = HealthResponse.parse(res.json());
    expect(body.status).toBe('ok');
    expect(Object.values(body.checks).every((c) => c.ok)).toBe(true);
  });
});

describe('request id', () => {
  it('echoes a sane incoming x-request-id and replaces a bad one', async () => {
    const kept = await inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'caddy-abc-12345' },
    });
    expect(kept.headers['x-request-id']).toBe('caddy-abc-12345');
    const replaced = await inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'bad id; drop table' },
    });
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('POST /search/text', () => {
  it('returns a typed result', async () => {
    const res = await inject({
      method: 'POST',
      url: '/search/text',
      payload: { query: 'black satin slip dress' },
    });
    expect(res.statusCode).toBe(200);
    const body = SearchResponse.parse(res.json());
    expect(body.requestId).toBe(res.headers['x-request-id']);
  });

  it.each([{}, { query: 'x' }, { query: 'a'.repeat(201) }, { query: 'ok query', source: 'telepathy' }])(
    'rejects %j with 400 and issues',
    async (payload) => {
      const res = await inject({ method: 'POST', url: '/search/text', payload });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty('issues');
    },
  );
});

describe('POST /search/image', () => {
  it('accepts a PNG and returns a typed result', async () => {
    const res = await inject({
      method: 'POST',
      url: '/search/image',
      ...withDevice(image(pngBytes(), { source: 'share' }), 1),
    });
    expect(res.statusCode).toBe(200);
    SearchResponse.parse(res.json());
  });

  it('rejects files that are not images, whatever their Content-Type', async () => {
    const res = await inject({
      method: 'POST',
      url: '/search/image',
      ...withDevice(image(Buffer.from('not an image')), 2),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects images over 5 MB with 413', async () => {
    const res = await inject({
      method: 'POST',
      url: '/search/image',
      ...withDevice(image(pngBytes(5 * 1024 * 1024 + 1)), 3),
    });
    expect(res.statusCode).toBe(413);
  });

  it('rejects a missing image field and non-multipart bodies', async () => {
    const wrongField = multipart([
      { name: 'photo', value: pngBytes(), filename: 'a.png', type: 'image/png' },
    ]);
    expect(
      (await inject({ method: 'POST', url: '/search/image', ...withDevice(wrongField, 4) })).statusCode,
    ).toBe(400);
    expect(
      (await inject({ method: 'POST', url: '/search/image', payload: { imageUrl: 'x' } })).statusCode,
    ).toBe(400);
  });

  it('never writes the upload to disk', async () => {
    // A distinctive size so any temp file holding this upload can be recognised.
    const size = 1_234_567;
    const started = Date.now() - 1_000;
    const res = await inject({
      method: 'POST',
      url: '/search/image',
      ...withDevice(image(pngBytes(size)), 5),
    });
    expect(res.statusCode).toBe(200);
    expect(await recentFilesOfSize(tmpdir(), size, started)).toEqual([]);
  });
});

describe('rate limiting', () => {
  it(`returns 429 after ${DEVICE_LIMIT} image searches from one device, with retry-after`, async () => {
    const codes: number[] = [];
    for (let i = 0; i < DEVICE_LIMIT + 1; i++) {
      codes.push(
        (
          await inject({
            method: 'POST',
            url: '/search/image',
            ...withDevice(image(), 100),
            remoteAddress: '10.0.0.1',
          })
        ).statusCode,
      );
    }
    expect(codes).toEqual([200, 200, 200, 429]);
    const last = await inject({
      method: 'POST',
      url: '/search/image',
      ...withDevice(image(), 100),
      remoteAddress: '10.0.0.1',
    });
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits requests without a device id by IP at the device limit', async () => {
    const codes: number[] = [];
    for (let i = 0; i < DEVICE_LIMIT + 1; i++) {
      codes.push(
        (await inject({ method: 'POST', url: '/search/image', ...image(), remoteAddress: '10.0.0.2' }))
          .statusCode,
      );
    }
    expect(codes.at(-1)).toBe(429);
  });

  it(`caps one IP at ${IP_LIMIT} across many device ids (backstop)`, async () => {
    const codes: number[] = [];
    for (let i = 0; i < IP_LIMIT + 1; i++) {
      codes.push(
        (
          await inject({
            method: 'POST',
            url: '/search/image',
            ...withDevice(image(), 200 + i),
            remoteAddress: '10.0.0.3',
          })
        ).statusCode,
      );
    }
    expect(codes).toEqual([...Array<number>(IP_LIMIT).fill(200), 429]);
  });

  it('does not rate-limit text search', async () => {
    for (let i = 0; i < DEVICE_LIMIT + 2; i++) {
      const res = await inject({
        method: 'POST',
        url: '/search/text',
        payload: { query: 'wig' },
        remoteAddress: '10.0.0.4',
      });
      expect(res.statusCode).toBe(200);
    }
  });
});

describe('products', () => {
  it('404s unknown products and 400s malformed ids', async () => {
    expect((await inject({ method: 'GET', url: '/products/no-such-thing' })).statusCode).toBe(404);
    expect((await inject({ method: 'GET', url: '/products/Bad_Slug' })).statusCode).toBe(400);
    expect((await inject({ method: 'GET', url: '/products/not-a-uuid/history' })).statusCode).toBe(400);
  });

  it('returns a product and its daily cheapest history', async () => {
    const { db } = h.catalog;
    const [store] = await db
      .insert(stores)
      .values({ name: 'Jumia', domain: 'www.jumia.com.ng', platform: 'custom', tier: 1, status: 'active' })
      .returning();
    const [product] = await db
      .insert(canonicalProducts)
      .values({
        slug: 'black-satin-slip-dress',
        title: 'Black satin slip dress',
        department: 'clothing',
        category: 'dresses',
      })
      .returning();
    const [listing] = await db
      .insert(listings)
      .values({
        storeId: store!.id,
        externalId: 'e2e-1',
        sourceUrl: 'https://www.jumia.com.ng/e2e-1',
        title: 'Black satin slip dress',
        priceKobo: 1_850_000,
        inStock: true,
        canonicalProductId: product!.id,
      })
      .returning();
    await db.insert(priceHistory).values([
      { listingId: listing!.id, priceKobo: 1_900_000, inStock: true },
      { listingId: listing!.id, priceKobo: 1_850_000, inStock: true },
      { listingId: listing!.id, priceKobo: 1_500_000, inStock: false }, // out of stock: ignored
    ]);

    const res = await inject({ method: 'GET', url: '/products/black-satin-slip-dress' });
    expect(res.statusCode).toBe(200);
    expect(ProductResponse.parse(res.json()).productId).toBe(product!.id);

    const hist = await inject({ method: 'GET', url: `/products/${product!.id}/history?days=7` });
    expect(hist.statusCode).toBe(200);
    const body = PriceHistoryResponse.parse(hist.json());
    expect(body.points).toHaveLength(1);
    expect(body.points[0]?.minPriceKobo).toBe(1_850_000);
  });
});

describe('GET /health when a dependency is down', () => {
  it('returns 503 degraded and names the failing check', async () => {
    // A second app whose cache Redis points at a closed port: same effect as the
    // server being down, without stopping the shared container.
    const down = await startHarness({ REDIS_CACHE_URL: 'redis://127.0.0.1:1' });
    try {
      const res = await down.app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(503);
      const body = HealthResponse.parse(res.json());
      expect(body.status).toBe('degraded');
      expect(body.checks.redisCache.ok).toBe(false);
      expect(body.checks.catalogDb.ok).toBe(true);
    } finally {
      await down.stop();
    }
  });
});

function withDevice<T extends { headers: Record<string, string> }>(req: T, n: number): T {
  return { ...req, headers: { ...req.headers, 'x-cheapa-device': device(n) } };
}

async function recentFilesOfSize(dir: string, size: number, since: number): Promise<string[]> {
  const found: string[] = [];
  for (const name of await readdir(dir).catch(() => [])) {
    const info = await stat(join(dir, name)).catch(() => null);
    if (info?.isFile() && info.size >= size && info.mtimeMs >= since) found.push(name);
  }
  return found;
}
