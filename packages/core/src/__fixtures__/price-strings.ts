/**
 * Real price strings seen on public, signed-out listing pages on 2026-11-01.
 * Text as rendered (whitespace may be a regular or non-breaking space on the live site;
 * both are covered by the synthetic cases in money.test.ts).
 *
 * Konga: search and category pages render products client-side, so no strings could
 * be read from the HTML. Add Konga strings from its list API during 03-tier1-adapters.md 3.3.
 */
export interface PriceFixture {
  source: string;
  text: string;
  kind: 'exact' | 'from' | 'range';
  minKobo: number;
  maxKobo: number | null;
}

const exact = (source: string, text: string, naira: number): PriceFixture => ({
  source,
  text,
  kind: 'exact',
  minKobo: naira * 100,
  maxKobo: naira * 100,
});
const from = (source: string, text: string, naira: number): PriceFixture => ({
  source,
  text,
  kind: 'from',
  minKobo: naira * 100,
  maxKobo: null,
});
const range = (source: string, text: string, min: number, max: number): PriceFixture => ({
  source,
  text,
  kind: 'range',
  minKobo: min * 100,
  maxKobo: max * 100,
});

const JUMIA_PHONES = 'jumia /catalog/?q=tecno+camon';
const JUMIA_SHIRTS = 'jumia /catalog/?q=men+shirt';
const JUMIA_SNEAKERS = 'jumia /catalog/?q=sneakers';
const JIJI_PHONES = 'jiji /mobile-phones';
const JIJI_CLOTHING = 'jiji /clothing';
const JIJI_FILTERS = 'jiji /mobile-phones price filter';

export const realPriceStrings: PriceFixture[] = [
  // Jumia: electronics, current and strike-through
  exact(JUMIA_PHONES, '₦ 600,000', 600_000),
  exact(JUMIA_PHONES, '₦ 443,162', 443_162),
  exact(JUMIA_PHONES, '₦ 849,999', 849_999),
  exact(JUMIA_PHONES, '₦ 6,080', 6_080),
  exact(JUMIA_PHONES, '₦ 1,000,000', 1_000_000),
  exact(JUMIA_PHONES, '₦ 468,831', 468_831),
  // Jumia: clothing and shoes ("From" = cheapest size/colour variant)
  exact(JUMIA_SHIRTS, '₦ 8,940', 8_940),
  exact(JUMIA_SHIRTS, '₦ 3,002', 3_002),
  exact(JUMIA_SHIRTS, '₦ 142,590', 142_590),
  from(JUMIA_SHIRTS, 'From ₦ 13,340', 13_340),
  from(JUMIA_SHIRTS, 'From ₦ 10,087', 10_087),
  from(JUMIA_SHIRTS, 'From ₦ 6,816', 6_816),
  exact(JUMIA_SNEAKERS, '₦ 3,886', 3_886),
  from(JUMIA_SNEAKERS, 'From ₦ 17,500', 17_500),
  from(JUMIA_SNEAKERS, 'From ₦ 19,138', 19_138),
  // Jiji: classifieds
  exact(JIJI_PHONES, '₦ 117,500', 117_500),
  exact(JIJI_PHONES, '₦ 3,050,000', 3_050_000),
  exact(JIJI_PHONES, '₦ 80,000', 80_000),
  exact(JIJI_CLOTHING, '₦ 4,000', 4_000),
  exact(JIJI_CLOTHING, '₦ 89,900', 89_900),
  exact(JIJI_CLOTHING, '₦ 120,000', 120_000),
  // Jiji: abbreviated filter buckets
  range(JIJI_FILTERS, '93 - 250 K', 93_000, 250_000),
  range(JIJI_FILTERS, '690 K - 1.7 M', 690_000, 1_700_000),
  range(JIJI_FILTERS, '₦ 130 - 230 K', 130_000, 230_000),
];
