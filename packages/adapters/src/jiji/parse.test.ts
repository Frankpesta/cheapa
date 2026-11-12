/**
 * Jiji fixture tests (CLAUDE.md rule 5; 03-tier1-adapters.md 3.4; 13 §13.2, 13.9).
 * Fixtures are real signed-out listing-API pages from 2026-11-12 (newest first), with
 * seller identity and free-text descriptions anonymised.
 */
import { normalizeListing } from '@cheapa/core';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { loadFixture, testStore } from '../testing.js';
import type { JsonValue, PoliteHttpClient, RawListing } from '../types.js';
import { parseListings } from '../validate.js';
import { CATEGORIES, jijiAdapter, listingUrl } from './index.js';
import { lastPage, parseSizeAttr } from './parse.js';

const FIXTURES = fileURLToPath(new URL('./__fixtures__/', import.meta.url));
const store = testStore({ name: 'Jiji', domain: 'jiji.ng' });
const SLUGS = ['clothing', 'bags', 'shoes', 'jewellery-and-watches', 'hair-beauty', 'makeup'];
const pathOf = (slug: string) => [...CATEGORIES.find((c) => c.slug === slug)!.path];
const page = (file: string, slug = 'clothing') =>
  loadFixture(FIXTURES, file, listingUrl('https://jiji.ng', slug, 1), { meta: { slug, path: pathOf(slug) } });
function parse(file: string, slug?: string): RawListing[] {
  const { listings, rejected } = parseListings(jijiAdapter, page(file, slug), store);
  expect(rejected).toEqual([]);
  return listings;
}
const byId = (listings: RawListing[], id: string) => listings.find((l) => l.externalId === id)!;

describe('jiji parse: every fixture', () => {
  it.each(SLUGS)('%s: every priced ad becomes a valid listing', (slug) => {
    const listings = parse(`${slug}-p1.json`, slug);
    expect(listings).toHaveLength(20);
    for (const l of listings) {
      expect(new URL(l.sourceUrl).host).toBe('jiji.ng');
      expect(l.imageUrl).toMatch(/^https:\/\/pictures-nigeria\.jijistatic\.net\//);
      expect(l.region).toBeTruthy();
      expect(l.categoryPath).toEqual(pathOf(slug));
      expect(l.attributes).not.toHaveProperty('details');
    }
  });

  it('matches the reviewed snapshot', () => {
    expect(SLUGS.map((slug) => ({ slug, listings: parse(`${slug}-p1.json`, slug) }))).toMatchSnapshot();
  });
});

describe('jiji parse: classifieds specifics', () => {
  const clothing = parse('clothing-p1.json');

  it('keeps a shop-name title as is, with the image and category to match on (13 §13.2)', () => {
    const shop = byId(clothing, '56019439');
    expect(shop).toMatchObject({
      title: 'Lily Fashion',
      priceKobo: 1_000_000,
      region: 'Abia, Umuahia',
      variant: { sizes: [{ system: 'letter', value: 'M' }], audience: 'women' },
    });
    expect(normalizeListing(shop)).toMatchObject({ department: 'clothing', category: null });
  });

  it('labels paid TOP ads as sponsored', () => {
    expect(byId(clothing, '56020152').sponsored).toBe(true);
    expect(byId(clothing, '56019439').sponsored).toBe(false);
  });

  it('takes audience from the Gender attribute, even for men’s items in the clothing category', () => {
    expect(byId(clothing, '56020152').variant).toMatchObject({ audience: 'men' });
  });

  it('keeps the business seller display name, never more', () => {
    const named = clothing.find((l) => l.sellerName)!;
    expect(named.sellerName).toMatch(/^Seller \d+$/);
    expect(Object.keys(named.attributes).sort()).toEqual(expect.arrayContaining(['repostKey', 'sellerId']));
  });

  it('reads shoe sizes as EU and wigs into the hair department', () => {
    const shoes = parse('shoes-p1.json', 'shoes');
    expect(byId(shoes, '56019568').variant?.sizes?.map((s) => `${s.system}:${s.value}`)).toEqual([
      'EU:37',
      'EU:38',
      'EU:39',
      'EU:40',
      'EU:41',
      'EU:42',
    ]);
    const wig = byId(parse('hair-beauty-p1.json', 'hair-beauty'), '56011994');
    expect(normalizeListing(wig)).toMatchObject({
      department: 'hair',
      category: 'wigs',
      variant: { hair: { lengthInches: 30, texture: 'Body Wave', fibre: 'human' } },
    });
  });

  it('collapses a repost by the same seller and skips "contact for price" (03 §3.4)', () => {
    const listings = parse('derived-repost-and-no-price.json');
    expect(listings.map((l) => l.externalId)).toEqual(['56019439', '56020152']);
  });
});

describe('jiji sizes and pages', () => {
  it.each([
    ['XL, XXL, 3XL', false, ['letter:XL', 'letter:2XL', 'letter:3XL']],
    ['One Size / No Size', false, ['letter:One Size']],
    ['39, 40.5', true, ['EU:39', 'EU:40.5']],
    ['44', false, ['numeric:44']],
    [undefined, false, []],
  ])('%s', (value, shoes, expected) => {
    expect(parseSizeAttr(value, shoes).map((s) => `${s.system}:${s.value}`)).toEqual(expected);
  });

  it('caps the page count at Jiji’s 1,000-page limit', () => {
    expect(lastPage(page('clothing-p1.json').body)).toBe(1000);
    expect(lastPage(page('makeup-p1.json', 'makeup').body)).toBe(43);
    expect(lastPage({})).toBe(1);
  });

  it('fails loudly when the API shape changes', () => {
    const broken = {
      ...page('clothing-p1.json'),
      format: 'json' as const,
      body: { status: 'redirect' } as JsonValue,
    };
    expect(() => jijiAdapter.parse(broken, store)).toThrow(ParseError);
  });

  it('discover pages each category newest-first through the listing API only', async () => {
    const makeup = JSON.stringify(page('makeup-p1.json', 'makeup').body);
    const requested: string[] = [];
    const http: PoliteHttpClient = {
      get(url) {
        requested.push(url);
        const body =
          new URL(url).searchParams.get('slug') === 'makeup'
            ? makeup
            : '{"adverts_list":{"adverts":[],"total_pages":1}}';
        return Promise.resolve({ url, status: 200, headers: {}, body, notModified: false });
      },
    };
    const log = { debug() {}, info() {}, warn() {}, error() {} };
    const refs: { url: string; path: unknown }[] = [];
    for await (const ref of jijiAdapter.discover(
      { http, log, signal: new AbortController().signal },
      store,
    )) {
      refs.push({ url: ref.url, path: ref.meta?.path });
    }
    expect(requested).toHaveLength(CATEGORIES.length);
    const makeupRefs = refs.filter((r) => r.url.includes('slug=makeup'));
    expect(makeupRefs).toHaveLength(43);
    expect(makeupRefs[1]).toEqual({
      url: 'https://jiji.ng/api_web/v1/listing?slug=makeup&sort=new&webp=true&page=2',
      path: ['Beauty & Personal Care', 'Make-Up'],
    });
    for (const { url } of refs) expect(new URL(url).pathname).toBe('/api_web/v1/listing');
  });
});
