import { describe, expect, it } from 'vitest';
import { CrawlPolicy, MAX_RPS, NormalizedListing, RawListing, type RawListingInput } from './types.js';

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
        colours: ['White'],
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

  it('accepts a wig with a full hair spec', () => {
    const listing = RawListing.parse({
      ...base,
      title: '13x4 HD Lace Frontal Bone Straight Human Hair Wig 24 Inch 180% Density',
      variant: {
        audience: 'women',
        colours: ['Natural Black'],
        hair: {
          lengthInches: 24,
          texture: 'bone straight',
          densityPct: 180,
          lace: '13x4 HD',
          fibre: 'human',
        },
      },
    });
    expect(listing.variant?.hair?.lengthInches).toBe(24);
  });

  it('accepts a beauty product with shade and net content', () => {
    const listing = RawListing.parse({
      ...base,
      title: 'Matte Foundation 30ml - Mocha',
      condition: 'new',
      variant: { shade: 'Mocha', netContent: { value: 30, unit: 'ml' } },
    });
    expect(listing.variant?.netContent).toEqual({ value: 30, unit: 'ml' });
  });

  it('accepts heels with heel height and material', () => {
    const listing = RawListing.parse({
      ...base,
      variant: {
        audience: 'women',
        heelHeightCm: 10,
        material: 'PU leather',
        sizes: [{ system: 'EU', value: '39' }],
      },
    });
    expect(listing.variant?.heelHeightCm).toBe(10);
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
    ['unknown hair fibre', { variant: { hair: { fibre: 'mixed' } } }],
    ['unknown net content unit', { variant: { netContent: { value: 30, unit: 'litres' } } }],
    ['negative heel height', { variant: { heelHeightCm: -1 } }],
    ['empty colour', { variant: { colours: [''] } }],
  ])('rejects %s', (_label, patch) => {
    expect(RawListing.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});

describe('NormalizedListing', () => {
  it('requires condition, department, category, variant and confidence', () => {
    expect(NormalizedListing.safeParse(base).success).toBe(false);
    const ok = NormalizedListing.safeParse({
      ...base,
      condition: 'new',
      department: 'clothing',
      category: 'mens-tshirts',
      variant: { packCount: 2 },
      extractionConfidence: 0.7,
    });
    expect(ok.success).toBe(true);
  });
});

describe('CrawlPolicy', () => {
  it('caps maxRps at MAX_RPS and requires it to be positive', () => {
    expect(CrawlPolicy.parse({ robotsOk: true, maxRps: 3 })).toEqual({ robotsOk: true, maxRps: 3 });
    expect(CrawlPolicy.safeParse({ robotsOk: true, maxRps: MAX_RPS + 1 }).success).toBe(false);
    expect(CrawlPolicy.safeParse({ robotsOk: true, maxRps: 0 }).success).toBe(false);
  });
});
