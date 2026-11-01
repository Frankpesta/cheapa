import { describe, expect, it } from 'vitest';
import { realPriceStrings } from './__fixtures__/price-strings.js';
import {
  formatNaira,
  formatPrice,
  minorUnitsToKobo,
  nairaToKobo,
  parsePrice,
  PriceParseError,
  toKobo,
} from './money.js';

describe('parsePrice: real strings from Jumia and Jiji', () => {
  it('has at least 15 real strings', () => {
    expect(realPriceStrings.length).toBeGreaterThanOrEqual(15);
  });

  it.each(realPriceStrings)('$source: $text', ({ text, kind, minKobo, maxKobo }) => {
    expect(parsePrice(text)).toEqual({ kind, minKobo, maxKobo });
  });
});

describe('parsePrice: formats named in 01-foundation.md 1.2', () => {
  it.each([
    ['₦1,250,000', 125_000_000],
    ['N1.25m', 125_000_000],
    ['1250000', 125_000_000],
    ['₦ 45,000.00', 4_500_000],
  ])('%s', (text, kobo) => {
    expect(toKobo(text)).toBe(kobo);
  });
});

describe('parsePrice: spacing, entities and currency markers', () => {
  it.each([
    ['₦ 600,000', 60_000_000], // non-breaking space
    ['₦ 600,000', 60_000_000], // narrow no-break space
    ['&#8358;4,500', 450_000], // HTML entity left in scraped text
    ['NGN 15,000', 1_500_000],
    ['N15,000', 1_500_000],
    ['  ₦  8,940  ', 894_000],
    ['₦45,000.5', 4_500_050],
  ])('%j', (text, kobo) => {
    expect(toKobo(text)).toBe(kobo);
  });
});

describe('parsePrice: Instagram / WhatsApp style shorthand', () => {
  it.each([
    ['4.5k', 450_000],
    ['₦4.5K', 450_000],
    ['15k', 1_500_000],
    ['1.2M', 120_000_000],
    ['N2.5 million', 250_000_000],
    ['₦ 1.05m', 105_000_000],
  ])('%s', (text, kobo) => {
    expect(toKobo(text)).toBe(kobo);
  });
});

describe('parsePrice: from and range prices (fashion sizes, variants)', () => {
  it('"From" keeps the lowest amount and an unknown upper bound', () => {
    expect(parsePrice('From ₦ 4,860')).toEqual({ kind: 'from', minKobo: 486_000, maxKobo: null });
    expect(parsePrice('Starting at ₦3,500')).toEqual({ kind: 'from', minKobo: 350_000, maxKobo: null });
  });

  it('parses ranges with any dash', () => {
    const expected = { kind: 'range', minKobo: 608_000, maxKobo: 1_000_000 };
    expect(parsePrice('₦ 6,080 - ₦ 10,000')).toEqual(expected);
    expect(parsePrice('₦6,080 – ₦10,000')).toEqual(expected);
    expect(parsePrice('₦6,080 to ₦10,000')).toEqual(expected);
  });

  it('toKobo refuses from and range prices', () => {
    expect(() => toKobo('From ₦ 13,340')).toThrow(PriceParseError);
    expect(() => toKobo('₦ 6,080 - ₦ 10,000')).toThrow(PriceParseError);
  });
});

describe('parsePrice: no price and bad input', () => {
  it.each(['Contact for price', 'Call for price', 'Negotiable', 'DM for price', ''])('%j is null', (text) => {
    expect(parsePrice(text)).toBeNull();
  });

  it.each([
    '$25.00',
    '€40',
    'USD 100',
    '£12',
    'abc',
    '₦',
    '₦ 0',
    '₦ 10,000 - ₦ 5,000',
    '₦1,000.505',
    '1 - 2 - 3',
  ])('%j throws', (text) => {
    expect(() => parsePrice(text)).toThrow(PriceParseError);
  });

  it('toKobo throws on a missing price', () => {
    expect(() => toKobo('Contact for price')).toThrow(PriceParseError);
  });
});

describe('nairaToKobo', () => {
  it('converts JSON naira numbers without float drift', () => {
    expect(nairaToKobo(45_000)).toBe(4_500_000);
    expect(nairaToKobo(0.1 + 0.2)).toBe(30);
    expect(nairaToKobo(19.99)).toBe(1_999);
  });

  it('rejects negatives and non-finite values', () => {
    expect(() => nairaToKobo(-1)).toThrow(RangeError);
    expect(() => nairaToKobo(Number.NaN)).toThrow(RangeError);
  });
});

describe('minorUnitsToKobo (WooCommerce Store API prices)', () => {
  it.each([
    ['4500000', 2, 4_500_000],
    ['45000', 0, 4_500_000],
    ['450000', 1, 4_500_000],
    ['45000000', 3, 4_500_000],
    ['45000005', 3, 4_500_001], // rounds half up
    [4500000, 2, 4_500_000],
  ] as const)('%s with minor unit %i', (amount, unit, kobo) => {
    expect(minorUnitsToKobo(amount, unit)).toBe(kobo);
  });

  it('rejects non-digit amounts and odd minor units', () => {
    expect(() => minorUnitsToKobo('45,000', 2)).toThrow(PriceParseError);
    expect(() => minorUnitsToKobo('-100', 2)).toThrow(PriceParseError);
    expect(() => minorUnitsToKobo('100', 7)).toThrow(RangeError);
  });
});

describe('formatNaira', () => {
  it.each([
    [125_000_000, '₦1,250,000'],
    [31_850_000, '₦318,500'],
    [100, '₦1'],
    [0, '₦0'],
    [4_500_050, '₦45,000.50'],
    [4_500_005, '₦45,000.05'],
    [-2_300_000, '-₦23,000'],
  ])('%i -> %s', (kobo, text) => {
    expect(formatNaira(kobo)).toBe(text);
  });

  it('rejects non-integer kobo', () => {
    expect(() => formatNaira(1.5)).toThrow(RangeError);
  });

  it('round-trips with toKobo', () => {
    for (const kobo of [100, 894_000, 125_000_000, 4_500_050]) {
      expect(toKobo(formatNaira(kobo))).toBe(kobo);
    }
  });
});

describe('formatPrice', () => {
  it('formats each kind', () => {
    expect(formatPrice({ kind: 'exact', minKobo: 894_000, maxKobo: 894_000 })).toBe('₦8,940');
    expect(formatPrice({ kind: 'from', minKobo: 1_334_000, maxKobo: null })).toBe('From ₦13,340');
    expect(formatPrice({ kind: 'range', minKobo: 608_000, maxKobo: 1_000_000 })).toBe('₦6,080 – ₦10,000');
  });
});
