/**
 * Sample data for the /dev/components gallery, copied from the design files' renderVals()
 * so components can be compared side by side with docs/design/screens. Dev only: screens
 * never use mock data (DESIGN.md "how to read").
 */
import type { Condition } from '@cheapa/core/client';
import type { ListingFlag } from '../components';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

export const listings: {
  store: string;
  condition: Condition;
  priceKobo: number;
  oldPriceKobo?: number;
  seen: Date;
  live?: boolean;
  flag?: ListingFlag;
  best?: boolean;
}[] = [
  { store: 'Jiji · Ikeja', condition: 'uk_used', priceKobo: 26_500_000, seen: hoursAgo(5) },
  { store: 'Slot', condition: 'new', priceKobo: 31_850_000, seen: hoursAgo(1), flag: 'cheapest', best: true },
  { store: 'Jumia', condition: 'new', priceKobo: 32_490_000, oldPriceKobo: 35_900_000, seen: hoursAgo(0.67) },
  { store: 'Pointek', condition: 'new', priceKobo: 33_500_000, seen: hoursAgo(0), live: true, flag: 'live' },
  { store: 'Jiji · Yaba', condition: 'uk_used', priceKobo: 13_900_000, seen: hoursAgo(24), flag: 'warn' },
];

export const chart30 = [
  35_900_000, 35_400_000, 35_900_000, 34_800_000, 34_200_000, 34_900_000, 33_900_000, 33_500_000, 33_800_000,
  32_900_000, 32_490_000, 32_800_000, 31_850_000,
];

export const confirmOptions = [
  { id: '128', title: '8GB / 128GB', subtitle: 'Most common in screenshots', priceKobo: 27_900_000 },
  { id: '256', title: '8GB / 256GB', subtitle: 'What we detected', priceKobo: 31_850_000 },
  { id: '512', title: '12GB / 512GB', subtitle: 'Top model', priceKobo: 38_900_000 },
];
