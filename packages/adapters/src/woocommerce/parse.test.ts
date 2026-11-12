/**
 * WooCommerce platform fixtures (CLAUDE.md rule 5; 09 §9.1 acceptance: variant handling
 * and price units). Real signed-out Store API responses from four stores on 2026-11-12,
 * trimmed to a few products, descriptions removed.
 */
import { normalizeListing } from '@cheapa/core';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { loadFixture, testStore } from '../testing.js';
import type { PoliteHttpClient, RawListing, StoreRef } from '../types.js';
import { parseListings } from '../validate.js';
import { productsUrl, wooAdapter } from './index.js';
import { decodeEntities, lastPage } from './parse.js';

const FIXTURES = fileURLToPath(new URL('./__fixtures__/', import.meta.url));
const STORES = {
  okriks: testStore({ name: 'Okriks', domain: 'okriks.com', platform: 'woocommerce', tier: 2 }),
  meshhairline: testStore({
    name: 'Mesh Hairline',
    domain: 'meshhairline.com',
    platform: 'woocommerce',
    tier: 2,
  }),
  essentialshub: testStore({
    name: 'Essentials Hub',
    domain: 'essentialshub.com',
    platform: 'woocommerce',
    tier: 2,
  }),
  crypsbeauty: testStore({
    name: 'Cryps Beauty',
    domain: 'crypsbeauty.com',
    platform: 'woocommerce',
    tier: 2,
  }),
} satisfies Record<string, StoreRef>;
type Shop = keyof typeof STORES;
const page = (shop: Shop) =>
  loadFixture(FIXTURES, `${shop}-products.json`, productsUrl(`https://${STORES[shop].domain}`, 1));

function parse(shop: Shop): RawListing[] {
  const { listings, rejected } = parseListings(wooAdapter, page(shop), STORES[shop]);
  expect(rejected).toEqual([]);
  return listings;
}
const byTitle = (listings: RawListing[], title: string) => listings.find((l) => l.title.startsWith(title))!;
const NAIRA_STORES: Shop[] = ['okriks', 'meshhairline', 'essentialshub'];

describe('woocommerce parse: every naira fixture', () => {
  it.each(NAIRA_STORES)('%s: valid listings on the store’s own domain', (shop) => {
    const listings = parse(shop);
    expect(listings.length).toBeGreaterThan(0);
    for (const l of listings) {
      expect(new URL(l.sourceUrl).host.replace(/^www\./, '')).toBe(STORES[shop].domain);
      expect(l.imageUrl).toMatch(/^https:\/\//);
    }
  });

  it('matches the reviewed snapshot', () => {
    expect(NAIRA_STORES.map((shop) => ({ shop, listings: parse(shop) }))).toMatchSnapshot();
  });
});

describe('woocommerce price units (09 §9.1: convert carefully)', () => {
  it('minor unit 2: "200000" is ₦2,000', () => {
    expect(byTitle(parse('okriks'), 'UK 12-14 – Dynasty Wine Bustier Top').priceKobo).toBe(200_000);
  });

  it('minor unit 0: "27000" is ₦27,000', () => {
    expect(byTitle(parse('essentialshub'), 'Anua PDRN Hyaluronic Acid').priceKobo).toBe(2_700_000);
  });

  it('a high-end wig at ₦1,450,000 stays exact to the kobo', () => {
    expect(byTitle(parse('meshhairline'), 'Diamond Lux Custom Made Frontal').priceKobo).toBe(145_000_000);
  });

  it('refuses a store whose API answers in another currency', () => {
    expect(() => wooAdapter.parse(page('crypsbeauty'), STORES.crypsbeauty)).toThrow(/USD, not NGN/);
  });
});

describe('woocommerce products', () => {
  it('thrift: an out-of-stock one-off and its size in the title', () => {
    const okriks = parse('okriks');
    expect(byTitle(okriks, '40D- M And S Brown Light Padded Bra').inStock).toBe(false);
    const top = byTitle(okriks, 'UK 12-14 – Dynasty Wine Bustier Top');
    expect(top.inStock).toBe(true);
    expect(normalizeListing(top)).toMatchObject({ department: 'clothing', category: 'tops' });
  });

  it('decodes WordPress entities in names and categories', () => {
    expect(decodeEntities('Tops &amp; Jackets &#8211; Women&#039;s')).toBe("Tops & Jackets – Women's");
    expect(parse('okriks').every((l) => !/&#?\w+;/.test(l.title))).toBe(true);
  });

  it('variable wigs: hard options (length, frontal type) are recorded on the listing', () => {
    const frontal = byTitle(parse('meshhairline'), 'Diamond Lux Custom Made Frontal');
    expect(frontal.attributes).toMatchObject({
      options: { 'Available Lengths': ['24 inches'], 'Frontal Type': ['11 x 6', '12 x 6', '13x6'] },
    });
    expect(normalizeListing(frontal).department).toBe('hair');
  });

  it('beauty brand and size come through for matching', () => {
    const mist = byTitle(parse('essentialshub'), 'Anua PDRN Hyaluronic Acid');
    expect(normalizeListing(mist)).toMatchObject({
      department: 'beauty',
      variant: { netContent: { value: 100, unit: 'ml' } },
    });
  });
});

describe('woocommerce discover', () => {
  it('reads the page count from x-wp-totalpages and pages 100 at a time', async () => {
    expect(lastPage({ 'x-wp-totalpages': '29' })).toBe(29);
    expect(lastPage({})).toBe(1);
    const http: PoliteHttpClient = {
      get: (url) =>
        Promise.resolve({
          url,
          status: 200,
          headers: { 'x-wp-totalpages': '3' },
          body: '[]',
          notModified: false,
        }),
    };
    const log = { debug() {}, info() {}, warn() {}, error() {} };
    const urls: string[] = [];
    for await (const ref of wooAdapter.discover(
      { http, log, signal: new AbortController().signal },
      STORES.okriks,
    )) {
      urls.push(ref.url);
    }
    expect(urls).toEqual([
      'https://okriks.com/wp-json/wc/store/v1/products?per_page=100',
      'https://okriks.com/wp-json/wc/store/v1/products?per_page=100&page=2',
      'https://okriks.com/wp-json/wc/store/v1/products?per_page=100&page=3',
    ]);
  });

  it('fails loudly when the Store API is disabled', () => {
    const raw = { ...page('okriks'), format: 'json' as const, body: { code: 'rest_no_route' } };
    expect(() => wooAdapter.parse(raw, STORES.okriks)).toThrow(ParseError);
  });
});
