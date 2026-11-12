import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../normalize/index.js';
import { RawListing, type RawListingInput } from '../types.js';
import {
  decideMatch,
  exactKey,
  hammingDistance,
  titleSimilarity,
  type Candidate,
  type MatchItem,
} from './decide.js';
import { newProduct } from './canonical.js';
import { vetoReason } from './rules.js';

/** A listing as the matcher sees it, through the real normalizer. */
function item(title: string, extra: Partial<RawListingInput> = {}): MatchItem {
  const n = normalizeListing(
    RawListing.parse({
      externalId: 'x',
      sourceUrl: 'https://s.ng/p',
      title,
      priceKobo: 100,
      inStock: true,
      ...extra,
    }),
  );
  return {
    department: n.department,
    category: n.category,
    title: n.title,
    brand: n.brand ?? null,
    model: n.model ?? null,
    modelNumber: n.modelNumber ?? null,
    gtin: n.gtin ?? null,
    variant: n.variant,
  };
}
const candidate = (
  productId: string,
  title: string,
  extra: Partial<RawListingInput> & Partial<Candidate> = {},
): Candidate => {
  const { imageSim, textSim, phash, ...raw } = extra;
  return {
    ...item(title, raw),
    productId,
    ...(imageSim !== undefined ? { imageSim } : {}),
    ...(textSim !== undefined ? { textSim } : {}),
    ...(phash !== undefined ? { phash } : {}),
  };
};

describe('beauty: brand + product line, shade and size are hard', () => {
  it('merges the same gloss across stores on text and attributes', () => {
    const d = decideMatch(item('Fenty Beauty Gloss Bomb Lip Luminizer 9ml'), [
      candidate('p1', 'FENTY BEAUTY Gloss Bomb Universal Lip Luminizer 9ml'),
    ]);
    expect(d).toMatchObject({ kind: 'merge', productId: 'p1', via: 'score' });
  });

  it('never merges different sizes or shades', () => {
    expect(vetoReason(item('Lattafa Khamrah EDP 100ml'), item('Lattafa Khamrah EDP 50ml'))).toBe('size');
    expect(
      vetoReason(
        item('Fenty Pro Filtr Foundation Shade 330 32ml'),
        item('Fenty Pro Filtr Foundation Shade 220 32ml'),
      ),
    ).toBe('shade');
  });
});

describe('electronics: storage and RAM are hard', () => {
  it('merges the same phone, vetoes another storage', () => {
    const listing = item('Samsung Galaxy A07 6.7" 4GB RAM/128GB ROM - Black');
    expect(
      decideMatch(listing, [candidate('p1', 'Samsung Galaxy A07 4GB/128GB Dual SIM Blue')]),
    ).toMatchObject({
      kind: 'merge',
      productId: 'p1',
      via: 'brand_model',
    });
    expect(
      decideMatch(listing, [candidate('p2', 'Samsung Galaxy A07 6.7" 4GB RAM/64GB ROM - Black')]),
    ).toMatchObject({
      kind: 'new',
      reason: 'all vetoed',
    });
  });
});

describe('fashion: the photo carries the match (13 §13.4)', () => {
  const dress = item('Ladies Satin Slip Midi Dress - Wine');

  it('never merges two dresses on text alone', () => {
    const d = decideMatch(dress, [candidate('p1', 'Satin Slip Midi Dress Wine for Ladies')]);
    expect(d).toEqual({ kind: 'new', score: 0, reason: 'no image signal' });
  });

  it('merges a near-identical photo, queues a merely similar one for review', () => {
    expect(
      decideMatch(dress, [candidate('p1', 'Satin Slip Midi Dress Wine', { imageSim: 0.97 })]),
    ).toMatchObject({
      kind: 'merge',
    });
    expect(
      decideMatch(dress, [candidate('p1', 'Satin Slip Midi Dress Wine', { imageSim: 0.72 })]),
    ).toMatchObject({
      kind: 'review',
    });
    expect(
      decideMatch(dress, [candidate('p1', 'Satin Slip Midi Dress Wine', { imageSim: 0.4 })]),
    ).toMatchObject({
      kind: 'new',
      reason: 'below review threshold',
    });
  });

  it('pack count, audience and item type are hard; size and colour are not', () => {
    expect(vetoReason(item('3 Pcs Cotton Panties for Ladies'), item('Cotton Panties for Ladies'))).toBe(
      'pack count',
    );
    expect(vetoReason(item("Women's Leather Slippers"), item("Men's Leather Slippers"))).toBe('audience');
    expect(vetoReason(item('Satin Slip Dress'), item('Satin Slip Skirt'))).toBe('item type');
    expect(
      vetoReason(item('Satin Slip Dress Size S Black'), item('Satin Slip Dress Size XL Wine')),
    ).toBeNull();
    expect(vetoReason(item('Unisex Leather Slippers'), item("Women's Leather Slippers"))).toBeNull();
  });

  it('wig length, texture and lace are hard', () => {
    const wig = item('20" Body Wave 13x4 HD Lace Frontal Wig Human Hair');
    expect(vetoReason(wig, item('22" Body Wave 13x4 HD Lace Frontal Wig Human Hair'))).toBe('hair length');
    expect(vetoReason(wig, item('20" Deep Wave 13x4 HD Lace Frontal Wig Human Hair'))).toBe('hair texture');
    expect(vetoReason(wig, item('20" Body Wave 4x4 Closure Wig Human Hair'))).not.toBeNull();
  });

  it('brands must agree when both are known', () => {
    expect(vetoReason(item('Zara Satin Slip Dress'), item('H&M Satin Slip Dress'))).toBe('brand');
    expect(vetoReason(item('Zara Satin Slip Dress'), item('Satin Slip Dress'))).toBeNull();
  });
});

describe('exact keys', () => {
  it('GTIN and brand + model number merge without scoring', () => {
    const a = { ...item('Some Retinol Serum 30ml'), gtin: '8809640733129' };
    expect(exactKey(a, { ...item('Different words entirely'), gtin: '8809640733129' })).toBe('gtin');
    const b = { ...item('Nike Air Force 1 07 White'), modelNumber: 'CW2288-111' };
    expect(exactKey(b, { ...item('Nike AF1 Triple White'), modelNumber: 'cw2288 111' })).toBe('model_number');
  });

  it('a supplier photo (phash distance ≤ 6) merges within the same category and audience', () => {
    const dress = { ...item('Ladies Satin Slip Dress'), phash: 0x0f0f0f0f0f0f0f0fn };
    const near = { ...candidate('p1', 'Women Silky Slip Gown Party'), phash: 0x0f0f0f0f0f0f0f3fn };
    const far = { ...candidate('p2', 'Women Silky Slip Gown Party'), phash: 0xf0f0f0f0f0f0f0f0n };
    expect(hammingDistance(0x0f0f0f0f0f0f0f0fn, 0x0f0f0f0f0f0f0f3fn)).toBe(2);
    expect(decideMatch(dress, [far, near])).toMatchObject({ kind: 'merge', productId: 'p1', via: 'phash' });
    const shoe = { ...candidate('p3', 'Ladies Satin Slippers'), phash: 0x0f0f0f0f0f0f0f0fn };
    expect(exactKey(dress, shoe)).toBeNull();
  });

  it('a vetoed candidate can’t win through an exact key', () => {
    const a = { ...item('Lattafa Khamrah EDP 100ml'), gtin: '6291108735411' };
    expect(
      decideMatch(a, [{ ...candidate('p1', 'Lattafa Khamrah EDP 50ml'), gtin: '6291108735411' }]),
    ).toMatchObject({
      kind: 'new',
    });
  });
});

describe('titleSimilarity', () => {
  it('ignores filler words and case', () => {
    expect(titleSimilarity('Elegant Ladies Satin Slip Dress', 'satin slip dress')).toBe(1);
    expect(titleSimilarity('Satin Slip Dress', 'Denim Jacket')).toBe(0);
  });
});

describe('newProduct', () => {
  it('names the product by brand, model and hard variant, with a stable unique suffix', () => {
    const phone = item('Samsung Galaxy A07 6.7" 4GB RAM/128GB ROM - Black');
    const p = newProduct({ ...phone, listingId: '00000000-0000-4000-8000-000000000001' });
    expect(p.slug).toMatch(/^samsung-galaxy-a07-128gb-4gb-ram-[0-9a-f]{6}$/);
    expect(p.variant).toEqual({ storageGb: 128, ramGb: 4 });
    expect(newProduct({ ...phone, listingId: '00000000-0000-4000-8000-000000000001' }).slug).toBe(p.slug);
  });

  it('keeps only hard attributes on the product (no sizes or colours)', () => {
    const dress = item("Women's Satin Slip Dress - Wine | Sizes S-XL");
    const p = newProduct({ ...dress, listingId: 'l1' });
    expect(p.variant).toEqual({ audience: 'women', packCount: 1 });
    expect(p.slug).toMatch(/^women-s-satin-slip-dress-wine-sizes-s-xl-[0-9a-f]{6}$/);
  });
});
