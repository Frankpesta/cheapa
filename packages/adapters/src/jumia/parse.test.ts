/**
 * Jumia fixture tests (CLAUDE.md rule 5; 03-tier1-adapters.md 3.2 acceptance; 13.2).
 * Fixtures are real signed-out category pages from 2026-11-12, trimmed to their
 * window.__STORE__ products (see the comment at the top of each file).
 */
import { normalizeListing } from '@cheapa/core';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { loadFixture, testStore } from '../testing.js';
import type { PoliteHttpClient, RawListing } from '../types.js';
import { parseListings } from '../validate.js';
import { jumiaAdapter, START_PATHS } from './index.js';
import { lastPage, optionSizes } from './parse.js';

const FIXTURES = fileURLToPath(new URL('./__fixtures__/', import.meta.url));
const store = testStore({ name: 'Jumia', domain: 'www.jumia.com.ng' });
const page = (name: string, path = '/womens-dresses/') =>
  loadFixture(FIXTURES, name, `https://www.jumia.com.ng${path}`);
function parse(name: string): RawListing[] {
  const { listings, rejected } = parseListings(jumiaAdapter, page(name), store);
  expect(rejected).toEqual([]);
  return listings;
}
const bySku = (listings: RawListing[], sku: string) => listings.find((l) => l.externalId === sku)!;

const PAGES = [
  'womens-dresses-p1.html',
  'womens-lingerie-p1.html',
  'womens-high-heels-p1.html',
  'womens-fashion-wigs-p1.html',
  'womens-earrings-p1.html',
  'women-watches-p1.html',
];

describe('jumia parse: every fixture', () => {
  it.each(PAGES)('%s: every product becomes a valid listing', (name) => {
    const listings = parse(name);
    expect(listings.length).toBeGreaterThan(0);
    for (const l of listings) {
      expect(new URL(l.sourceUrl).host).toBe('www.jumia.com.ng');
      expect(l.imageUrl).toMatch(/^https:\/\/ng\.jumia\.is\//);
      expect(l.categoryPath[0]).toBeTruthy();
      expect(l.sponsored).toBe(false);
    }
  });

  it('matches the reviewed snapshot', () => {
    expect(PAGES.map((name) => ({ name, listings: parse(name) }))).toMatchSnapshot();
  });
});

describe('jumia parse: the cases that matter for fashion', () => {
  const dresses = parse('womens-dresses-p1.html');

  it('a normal product: SKU, brand, full title, store breadcrumb', () => {
    expect(bySku(dresses, 'FA203MW5PA2KONAFAMZ')).toMatchObject({
      title: 'Gorgeous And Exquisite Ladies Cooperate Gown',
      priceKobo: 1_050_000,
      priceKind: 'exact',
      inStock: true,
      sourceUrl: expect.stringMatching(/^https:\/\/www\.jumia\.com\.ng\/.+\.html$/) as unknown,
    });
    expect(bySku(dresses, 'BR325MW7H927TNAFAMZ')).toMatchObject({
      brand: 'Trendyol',
      title: 'Trendyol Knitted Casual Dress - Mink',
      categoryPath: ['Fashion', "Women's Fashion", 'Clothing', 'Dresses', 'Casual Dresses'],
      attributes: { officialStore: true, jumiaExpress: true },
    });
  });

  it('a discounted product keeps the strike-through price', () => {
    expect(bySku(dresses, 'BR325MW86QEWPNAFAMZ')).toMatchObject({
      priceKobo: 661_000,
      oldPriceKobo: 1_700_000,
    });
  });

  it('a multi-size item with a "From" price', () => {
    expect(bySku(dresses, 'BR325MW7H927TNAFAMZ')).toMatchObject({
      priceKind: 'from',
      priceKobo: 685_000,
      variant: { sizes: ['36', '38', '40'].map((value) => ({ system: 'EU', value })) },
    });
  });

  it('a sold-out size is dropped from sizes and recorded, and never sets the price', () => {
    const dress = bySku(dresses, 'BR325MW86QEWPNAFAMZ');
    expect(dress.variant?.sizes).toEqual([{ system: 'EU', value: '34' }]);
    expect(dress.attributes.soldOutSizes).toEqual(['36', '38', '40']);
    expect(dress.priceKind).toBe('exact');
    const heels = bySku(parse('womens-high-heels-p1.html'), 'BR171FS4DKOPDNAFAMZ');
    expect(heels).toMatchObject({ variant: { sizes: [{ system: 'US', value: '8' }] }, inStock: true });
    expect(heels.attributes.soldOutSizes).toEqual(['8.5', '9.5', '10']);
  });

  it('an out-of-stock product (derived fixture)', () => {
    const [soldOut] = parse('derived-sold-out.html');
    expect(soldOut).toMatchObject({ externalId: 'BR325MW7H927TNAFAMZ', inStock: false });
    expect(soldOut!.variant).toBeUndefined();
    expect(soldOut!.priceKobo).toBeGreaterThan(0);
  });

  it('multipacks keep their count in the title for the normalizer', () => {
    const lingerie = parse('womens-lingerie-p1.html');
    const pants = bySku(lingerie, 'FA203SL7Z06UXNAFAMZ');
    expect(pants.title).toBe('Sexy Ladies Cotton Pant 6pcs');
    expect(normalizeListing(pants).variant.packCount).toBe(6);
    const earrings = bySku(parse('womens-earrings-p1.html'), 'FA203FC4BSUM9NAFAMZ');
    expect(normalizeListing(earrings)).toMatchObject({ category: 'earrings', variant: { packCount: 9 } });
  });

  it('normalizes into the right women’s categories', () => {
    const categories = (name: string) => parse(name).map((l) => normalizeListing(l).category);
    expect(new Set(categories('womens-dresses-p1.html'))).toEqual(new Set(['dresses']));
    expect(categories('womens-fashion-wigs-p1.html').every((c) => c === 'wigs')).toBe(true);
    expect(normalizeListing(parse('womens-dresses-p1.html')[0]!).variant.audience).toBe('women');
  });
});

describe('jumia size options', () => {
  it.each([
    ['EU 38', false, [{ system: 'EU', value: '38' }]],
    ['US 8.5', true, [{ system: 'US', value: '8.5' }]],
    ['EU L', false, [{ system: 'letter', value: 'L' }]],
    ['CH XXL', false, [{ system: 'letter', value: '2XL' }]],
    [
      'M/L',
      false,
      [
        { system: 'letter', value: 'M' },
        { system: 'letter', value: 'L' },
      ],
    ],
    ['ONE SIZE FITS ALL', false, [{ system: 'letter', value: 'One Size' }]],
    ['39', true, [{ system: 'EU', value: '39' }]],
    ['34', false, [{ system: 'numeric', value: '34' }]],
    ['Black', false, []],
    ['12 inches', false, []],
    ['1B # (Including Website)', false, []],
  ])('%s', (name, shoes, sizes) => {
    expect(optionSizes(name, shoes)).toEqual(sizes);
  });
});

describe('jumia pages', () => {
  it('reads the page count from the "Last Page" link', () => {
    expect(lastPage(page('womens-dresses-p1.html').body as string)).toBe(50);
    expect(lastPage(page('womens-high-heels-p1.html').body as string)).toBe(3);
    expect(lastPage('<html></html>')).toBe(1);
  });

  it('fails loudly when __STORE__ disappears, but accepts an empty category', () => {
    const broken = {
      ...page('womens-dresses-p1.html'),
      format: 'html' as const,
      body: '<html><body>Maintenance</body></html>',
    };
    expect(() => jumiaAdapter.parse(broken, store)).toThrow(ParseError);
    const empty = { ...broken, body: '<script>window.__STORE__={"products":[]};</script>' };
    expect(jumiaAdapter.parse(empty, store)).toEqual([]);
  });

  it('discover walks categories by page only (robots.txt forbids sort, filter and search params)', async () => {
    const heels = page('womens-high-heels-p1.html').body as string;
    const empty = '<script>window.__STORE__={"products":[]};</script>';
    const requested: string[] = [];
    const http: PoliteHttpClient = {
      get(url) {
        requested.push(url);
        return Promise.resolve({
          url,
          status: 200,
          headers: {},
          body: url.includes('womens-high-heels') ? heels : empty,
          notModified: false,
        });
      },
    };
    const log = { debug() {}, info() {}, warn() {}, error() {} };
    const refs: string[] = [];
    for await (const ref of jumiaAdapter.discover({ http, log, signal: new AbortController().signal }, store))
      refs.push(ref.url);

    expect(requested).toHaveLength(START_PATHS.length);
    expect(refs.filter((u) => u.includes('womens-high-heels'))).toEqual([
      'https://www.jumia.com.ng/womens-high-heels/',
      'https://www.jumia.com.ng/womens-high-heels/?page=2',
      'https://www.jumia.com.ng/womens-high-heels/?page=3',
    ]);
    expect(refs).toHaveLength(START_PATHS.length + 2);
    for (const url of refs) expect(new URL(url).search).toMatch(/^(\?page=\d+)?$/);
  });
});
