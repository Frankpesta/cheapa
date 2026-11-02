/**
 * Exercises the adapter contract end to end with a minimal example adapter: discover
 * pages through a fake PoliteHttpClient, fetch returns a RawPayload, parse is pure and
 * validated at the boundary, and the registry resolves stores to adapters.
 */
import { parsePrice } from '@cheapa/core';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Blocked, ParseError, RobotsDisallowed } from './errors.js';
import { AdapterRegistry, normalizeDomain } from './registry.js';
import { loadFixture, testStore } from './testing.js';
import type {
  AdapterContext,
  JsonValue,
  PoliteHttpClient,
  ProductRef,
  RawListingInput,
  RawPayload,
  SourceAdapter,
} from './types.js';
import { parseListings, validateListings } from './validate.js';

const FIXTURES = fileURLToPath(new URL('./__fixtures__/', import.meta.url));
const ORIGIN = 'https://www.example.ng';

interface ExampleProduct {
  sku: string;
  name: string;
  url: string;
  price: string;
  oldPrice?: string;
  available: boolean;
  image?: string;
  brand?: string;
  sizes?: string[];
}
interface ExamplePage {
  page: number;
  totalPages: number;
  products: ExampleProduct[];
}

const searchUrl = (page: number) => `${ORIGIN}/api/search?q=dress&page=${page}`;

const example: SourceAdapter = {
  id: 'example',
  kind: 'custom',
  domains: ['www.example.ng'],
  needsBrowser: false,

  async *discover(ctx) {
    for (let page = 1, totalPages = 1; page <= totalPages && !ctx.signal.aborted; page += 1) {
      const res = await ctx.http.get(searchUrl(page), { accept: 'json', signal: ctx.signal });
      totalPages = (JSON.parse(res.body) as ExamplePage).totalPages;
      yield { kind: 'page', url: searchUrl(page), meta: { page } };
    }
  },

  async fetch(ctx, ref) {
    const res = await ctx.http.get(ref.url, { accept: 'json', signal: ctx.signal });
    return {
      ref,
      url: res.url,
      fetchedAt: new Date().toISOString(),
      format: 'json',
      body: JSON.parse(res.body) as JsonValue,
    };
  },

  parse(raw) {
    if (raw.format !== 'json') throw new ParseError('example', `expected json, got ${raw.format}`);
    const rows: RawListingInput[] = [];
    for (const p of (raw.body as unknown as ExamplePage).products) {
      const price = parsePrice(p.price);
      if (!price) continue; // "Call for price": nothing to compare
      const old = p.oldPrice ? parsePrice(p.oldPrice) : null;
      rows.push({
        externalId: p.sku,
        sourceUrl: new URL(p.url, ORIGIN).toString(),
        title: p.name,
        priceKobo: price.minKobo,
        priceKind: price.kind,
        ...(price.kind === 'range' && price.maxKobo ? { priceMaxKobo: price.maxKobo } : {}),
        ...(old ? { oldPriceKobo: old.minKobo } : {}),
        inStock: p.available,
        ...(p.image ? { imageUrl: p.image } : {}),
        ...(p.brand ? { brand: p.brand } : {}),
        ...(p.sizes
          ? { variant: { sizes: p.sizes.map((value) => ({ system: 'letter' as const, value })) } }
          : {}),
      });
    }
    return rows;
  },
};

function fakeContext(pages: Record<string, string>): AdapterContext & { requested: string[] } {
  const requested: string[] = [];
  const http: PoliteHttpClient = {
    get(url) {
      requested.push(url);
      const body = pages[url];
      if (body === undefined) return Promise.reject(new Blocked(url, 'status_403'));
      return Promise.resolve({ url, status: 200, headers: {}, body, notModified: false });
    },
  };
  const noop = () => undefined;
  const log = { debug: noop, info: noop, warn: noop, error: noop };
  return { http, log, signal: new AbortController().signal, requested };
}

const page = (n: number, totalPages: number) => JSON.stringify({ page: n, totalPages, products: [] });

describe('example adapter (fixture)', () => {
  const store = testStore({ domain: 'www.example.ng' });
  const raw = loadFixture(FIXTURES, 'example-search.json', searchUrl(1));

  it('parses valid rows into kobo listings and skips priceless ones', () => {
    const { listings, rejected } = parseListings(example, raw, store);
    expect(rejected).toEqual([]);
    expect(listings.map((l) => l.externalId)).toEqual(['EX-1001', 'EX-1002']);
    expect(listings[0]).toMatchObject({
      sourceUrl: 'https://www.example.ng/satin-slip-midi-dress-wine-1001.html',
      priceKobo: 1_250_000,
      priceKind: 'exact',
      oldPriceKobo: 1_800_000,
      currency: 'NGN',
      sponsored: false,
      variant: {
        sizes: [
          { system: 'letter', value: 'S' },
          { system: 'letter', value: 'M' },
          { system: 'letter', value: 'L' },
        ],
      },
    });
    expect(listings[1]).toMatchObject({ priceKobo: 14_500_000, priceKind: 'from' });
  });

  it('parse is pure: same payload, same output', () => {
    expect(example.parse(raw, store)).toEqual(example.parse(raw, store));
  });

  it('rejects a payload in the wrong format with ParseError', () => {
    const html: RawPayload = { ...raw, format: 'html', body: '<html></html>' };
    expect(() => example.parse(html, store)).toThrow(ParseError);
  });
});

describe('discover and fetch through PoliteHttpClient', () => {
  it('pages until totalPages and fetches a ref into a RawPayload', async () => {
    const ctx = fakeContext({ [searchUrl(1)]: page(1, 2), [searchUrl(2)]: page(2, 2) });
    const refs: ProductRef[] = [];
    for await (const ref of example.discover(ctx, testStore())) refs.push(ref);
    expect(refs).toEqual([
      { kind: 'page', url: searchUrl(1), meta: { page: 1 } },
      { kind: 'page', url: searchUrl(2), meta: { page: 2 } },
    ]);

    const payload = await example.fetch(ctx, refs[1]!);
    expect(payload).toMatchObject({ format: 'json', url: searchUrl(2), body: { page: 2 } });
  });

  it('lets Blocked propagate to the engine (no adapter-side workaround)', async () => {
    const ctx = fakeContext({});
    await expect(example.fetch(ctx, { kind: 'page', url: searchUrl(9) })).rejects.toBeInstanceOf(Blocked);
  });
});

describe('validateListings', () => {
  it('keeps good rows and reports bad ones with their externalId', () => {
    const good = { externalId: 'a', sourceUrl: 'https://x.ng/a', title: 'A', priceKobo: 100, inStock: true };
    const floatPrice = { ...good, externalId: 'b', priceKobo: 12.5 };
    const badRange = { ...good, externalId: 'c', priceKind: 'range' };
    const { listings, rejected } = validateListings([good, floatPrice, badRange, null]);
    expect(listings).toHaveLength(1);
    expect(rejected.map((r) => [r.index, r.externalId])).toEqual([
      [1, 'b'],
      [2, 'c'],
      [3, undefined],
    ]);
    expect(rejected[1]!.issues[0]!.path).toEqual(['priceMaxKobo']);
  });
});

describe('AdapterRegistry', () => {
  const woo: SourceAdapter = {
    ...example,
    id: 'platform:woocommerce',
    kind: 'platform',
    platform: 'woocommerce',
  };
  delete (woo as { domains?: unknown }).domains;
  const registry = new AdapterRegistry([example, woo]);

  it('prefers a custom adapter by domain, else the platform adapter', () => {
    expect(registry.forStore({ domain: 'EXAMPLE.ng', platform: 'custom' })?.id).toBe('example');
    expect(registry.forStore({ domain: 'shop.ng', platform: 'woocommerce' })?.id).toBe(
      'platform:woocommerce',
    );
    expect(registry.forStore({ domain: 'shop.ng', platform: 'shopify' })).toBeUndefined();
    expect(registry.get('example')).toBe(example);
  });

  it('refuses duplicate ids, domains and platforms', () => {
    expect(() => new AdapterRegistry([example, { ...example, id: 'other' }])).toThrow(/domain "example.ng"/);
    expect(() => new AdapterRegistry([example, example])).toThrow(/id "example"/);
    expect(() => new AdapterRegistry([woo, { ...woo, id: 'x' }])).toThrow(/platform "woocommerce"/);
  });

  it('requires custom adapters to list domains and others a platform', () => {
    expect(() => new AdapterRegistry([{ ...example, domains: [] }])).toThrow(/must list its domains/);
    expect(() => new AdapterRegistry([{ ...woo, platform: undefined }])).toThrow(/platform/);
  });

  it('normalizes domains', () => {
    expect(normalizeDomain(' WWW.Jumia.com.ng. ')).toBe('jumia.com.ng');
  });
});

describe('errors', () => {
  it('carry their own names for logs and instanceof checks', () => {
    const blocked = new Blocked('https://x.ng', 'status_429');
    expect(blocked.name).toBe('Blocked');
    expect(new RobotsDisallowed('https://x.ng/cart').name).toBe('RobotsDisallowed');
  });
});
