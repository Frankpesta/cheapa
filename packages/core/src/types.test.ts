import { describe, expect, it } from 'vitest';
import { NormalizedListing, RawListing, type RawListingInput } from './types.js';

const base: RawListingInput = {
  externalId: 'DO123MW',
  sourceUrl: 'https://www.jumia.com.ng/touphy-cotton-set-123.html',
  title: "TOUPHY T-Shirts +Shorts 100% Cotton Men's Short Sleeve Set-White",
  priceKobo: 894_000,
  inStock: true,
};

describe('RawListing', () => {
  it('applies defaults', () => {
    const listing = RawListing.parse(base);
    expect(listing).toMatchObject({
      priceKind: 'exact',
      currency: 'NGN',
      categoryPath: [],
      sponsored: false,
      attributes: {},
    });
  });

  it('accepts a multi-size fashion listing with a "From" price', () => {
    const listing = RawListing.parse({
      ...base,
      priceKind: 'from',
      oldPriceKobo: 2_880_000,
      variant: {
        colour: 'White',
        packCount: 2,
        audience: 'men',
        sizes: [
          { system: 'letter', value: 'M' },
          { system: 'letter', value: 'XXXL' },
        ],
      },
    });
    expect(listing.variant?.sizes).toHaveLength(2);
  });

  it('accepts shoe sizes and Jiji classifieds fields', () => {
    const listing = RawListing.parse({
      ...base,
      condition: 'used',
      sellerName: 'Thriftbykelly',
      region: 'Lagos, Ikeja',
      variant: { sizes: [{ system: 'EU', value: '42' }] },
    });
    expect(listing.region).toBe('Lagos, Ikeja');
  });

  it.each([
    ['float kobo', { priceKobo: 8940.5 }],
    ['zero price', { priceKobo: 0 }],
    ['negative old price', { oldPriceKobo: -1 }],
    ['non-NGN currency', { currency: 'USD' }],
    ['bad url', { sourceUrl: 'not a url' }],
    ['bad gtin', { gtin: '12345' }],
    ['range without max', { priceKind: 'range' }],
    ['max below min', { priceKind: 'range', priceMaxKobo: 100 }],
    ['zero pack count', { variant: { packCount: 0 } }],
    ['unknown audience', { variant: { audience: 'adults' } }],
  ])('rejects %s', (_label, patch) => {
    expect(RawListing.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});

describe('NormalizedListing', () => {
  it('requires condition, category, variant and confidence', () => {
    expect(NormalizedListing.safeParse(base).success).toBe(false);
    const ok = NormalizedListing.safeParse({
      ...base,
      condition: 'new',
      category: 'mens-tshirts',
      variant: { packCount: 2 },
      extractionConfidence: 0.7,
    });
    expect(ok.success).toBe(true);
  });
});
