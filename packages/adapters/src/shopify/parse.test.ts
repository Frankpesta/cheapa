/**
 * Shopify platform fixtures (CLAUDE.md rule 5; 09 §9.1 acceptance: variant handling and
 * price units). Real signed-out /products.json and /meta.json responses from four
 * Nigerian stores on 2026-11-12, trimmed to a few products, descriptions removed.
 */
import { normalizeListing } from '@cheapa/core';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { loadFixture, testStore } from '../testing.js';
import type { PoliteHttpClient, RawListing, StoreRef } from '../types.js';
import { parseListings } from '../validate.js';
import { productsUrl, shopifyAdapter } from './index.js';
import { lastPage } from './parse.js';

const FIXTURES = fileURLToPath(new URL('./__fixtures__/', import.meta.url));
const STORES = {
  garmisland: testStore({ name: 'Garmisland', domain: 'garmisland.com', platform: 'shopify', tier: 2 }),
  brandlistry: testStore({
    name: 'Brandlistry Nigeria',
    domain: 'www.brandlistry.ng',
    platform: 'shopify',
    tier: 2,
  }),
  shopmaju: testStore({ name: 'Shop Maju', domain: 'shopmaju.com', platform: 'shopify', tier: 2 }),
  kuddy: testStore({ name: 'Kuddy Cosmetics', domain: 'kuddycosmetics.com', platform: 'shopify', tier: 2 }),
} satisfies Record<string, StoreRef>;
type Shop = keyof typeof STORES;

function parse(shop: Shop): RawListing[] {
  const store = STORES[shop];
  const raw = loadFixture(FIXTURES, `${shop}-products.json`, productsUrl(`https://${store.domain}`, 1));
  const { listings, rejected } = parseListings(shopifyAdapter, raw, store);
  expect(rejected).toEqual([]);
  return listings;
}
const byTitle = (listings: RawListing[], title: string) => listings.filter((l) => l.title.startsWith(title));

describe('shopify parse: every fixture', () => {
  it.each(Object.keys(STORES) as Shop[])('%s: valid listings on the store’s own domain', (shop) => {
    const listings = parse(shop);
    expect(listings.length).toBeGreaterThan(0);
    for (const l of listings) {
      expect(new URL(l.sourceUrl).host).toBe(STORES[shop].domain);
      // Some products have no image at all (Kuddy); when there is one it's Shopify's CDN.
      if (l.imageUrl) expect(l.imageUrl).toMatch(/^https:\/\/cdn\.shopify\.com\//);
      expect(l.attributes.productId).toBeTruthy();
    }
  });

  it('matches the reviewed snapshot', () => {
    expect(
      (Object.keys(STORES) as Shop[]).map((shop) => ({ shop, listings: parse(shop) })),
    ).toMatchSnapshot();
  });
});

describe('shopify variants', () => {
  it('price units: "65000.00" naira strings become kobo', () => {
    const [jacket] = byTitle(parse('garmisland'), 'Garm Island Zip Along Jacket in Anthracite grey');
    expect(jacket!.priceKobo).toBe(6_500_000);
  });

  it('garment sizes stay on one listing; sold-out sizes are recorded, not offered', () => {
    const [jacket] = byTitle(parse('garmisland'), 'Garm Island Zip Along Jacket in Anthracite grey');
    expect(jacket).toMatchObject({
      inStock: true,
      variant: { sizes: ['M', 'L', 'XL', '2XL'].map((value) => ({ system: 'letter', value })) },
      attributes: { soldOutSizes: ['S'] },
    });
  });

  it('word sizes ("SMALL", "MEDIUM") and colours are soft too', () => {
    const [raven] = byTitle(parse('shopmaju'), 'Raven set');
    expect(raven).toMatchObject({
      variant: {
        sizes: ['S', 'M', 'L'].map((value) => ({ system: 'letter', value })),
        colours: ['Green and pink', 'Blue and pink'],
      },
    });
    expect(byTitle(parse('shopmaju'), 'Raven set')).toHaveLength(1);
  });

  it('ring sizes are sizes, not separate products', () => {
    const rings = byTitle(parse('garmisland'), 'Nike Repeat Swoosh Ring');
    expect(rings).toHaveLength(1);
    expect(rings[0]!.variant?.sizes).toEqual([{ system: 'numeric', value: '10' }]);
  });

  it('a hard option (beauty "Type") splits into one listing per value, each priced on its own', () => {
    const cream = byTitle(parse('brandlistry'), 'EVEN & PERFECT Colour Correction Cream');
    expect(cream.map((l) => l.title)).toEqual([
      'EVEN & PERFECT Colour Correction Cream LSF 20 - Anti Age',
      'EVEN & PERFECT Colour Correction Cream LSF 20 - Anti Redness',
    ]);
    for (const l of cream) {
      expect(l.externalId).toMatch(/^\d+:\d+$/);
      expect(new URL(l.sourceUrl).searchParams.get('variant')).toBe(l.externalId.split(':')[1]);
    }
  });

  it('keeps the compare-at price as the old price', () => {
    expect(byTitle(parse('brandlistry'), 'Ultimate Anti-Age Cream')[0]).toMatchObject({
      priceKobo: 16_000_000,
      oldPriceKobo: 17_600_000,
    });
  });

  it('an all-sold-out product is out of stock', () => {
    expect(byTitle(parse('garmisland'), 'Antioch suede jacket in camel')[0]!.inStock).toBe(false);
    expect(byTitle(parse('shopmaju'), 'THE RIO BOUBOU')[0]!.inStock).toBe(false);
  });

  it('vendor is the brand unless it is the store itself', () => {
    expect(byTitle(parse('brandlistry'), 'Ultimate Anti-Age Cream')[0]!.brand).toBe('Biodroga');
    expect(byTitle(parse('kuddy'), 'Makari Hair Treatment Oil')[0]!.brand).toBe('Makari');
    expect(byTitle(parse('kuddy'), 'Kuddy Perfect Color Match')[0]!.brand).toBeUndefined();
    expect(byTitle(parse('garmisland'), 'Garm Island Godspeed')[0]!.brand).toBeUndefined();
  });

  it('normalizes into women’s fashion and beauty', () => {
    const [kim] = byTitle(parse('shopmaju'), 'KIM DRESS');
    expect(normalizeListing(kim!)).toMatchObject({ department: 'clothing', category: 'dresses' });
    const [perfume] = byTitle(parse('kuddy'), 'Etlee Woody & Musky');
    expect(normalizeListing(perfume!)).toMatchObject({
      department: 'beauty',
      variant: { netContent: { value: 10, unit: 'ml' } },
    });
  });
});

describe('shopify discover', () => {
  const metaBody = (shop: Shop) =>
    JSON.stringify(loadFixture(FIXTURES, `${shop}-meta.json`, 'https://x/meta.json').body);
  const log = { debug() {}, info() {}, warn() {}, error() {} };
  async function refs(store: StoreRef, body: string): Promise<string[]> {
    const http: PoliteHttpClient = {
      get: (url) => Promise.resolve({ url, status: 200, headers: {}, body, notModified: false }),
    };
    const out: string[] = [];
    for await (const ref of shopifyAdapter.discover(
      { http, log, signal: new AbortController().signal },
      store,
    ))
      out.push(ref.url);
    return out;
  }

  it('pages 250 products at a time from /meta.json’s product count', async () => {
    expect(lastPage(8493)).toBe(34);
    const urls = await refs(STORES.shopmaju, metaBody('shopmaju'));
    expect(urls).toEqual([
      'https://shopmaju.com/products.json?limit=250',
      'https://shopmaju.com/products.json?limit=250&page=2',
    ]);
  });

  it('refuses a store that does not sell in naira (09 §9.1)', async () => {
    await expect(refs(STORES.shopmaju, '{"currency":"USD","published_products_count":10}')).rejects.toThrow(
      ParseError,
    );
  });

  it('fails loudly when /products.json is disabled', () => {
    const raw = {
      ...loadFixture(FIXTURES, 'shopmaju-products.json', 'https://shopmaju.com/products.json'),
      format: 'json' as const,
      body: { errors: 'Not Found' },
    };
    expect(() => shopifyAdapter.parse(raw, STORES.shopmaju)).toThrow(ParseError);
  });
});
