/**
 * Scoring for `pnpm bench:vision` (05 §5.2): brand, model and variant exact match
 * against hand labels, compared after case and spacing are normalised.
 */
import type { VisionResult } from '@cheapa/ml';
import { z } from 'zod';

export const VisionLabel = z.object({
  file: z.string().min(1),
  /** Free tag for the report: instagram, whatsapp, tiktok, product. */
  source: z.string().default('unknown'),
  isProduct: z.boolean().default(true),
  category: z.string().nullable().default(null),
  brand: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  variant: z.record(z.string(), z.string()).default({}),
  priceNaira: z.number().nullable().default(null),
});
export type VisionLabel = z.infer<typeof VisionLabel>;

export interface LabelScore {
  isProduct: boolean;
  brand: boolean;
  model: boolean;
  /** Every labelled variant key matched. Labels with no variant count as a match. */
  variant: boolean;
  /** Labelled price read correctly; null when the label has no price. */
  price: boolean | null;
}

export const norm = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export function scoreResult(label: VisionLabel, result: VisionResult): LabelScore {
  const variants = Object.entries(label.variant);
  return {
    isProduct: label.isProduct === result.isProduct,
    brand: norm(label.brand) === norm(result.brand),
    model: norm(label.model) === norm(result.model),
    variant: variants.every(([k, v]) => norm(result.variant[k]) === norm(v)),
    price: label.priceNaira === null ? null : result.priceSeen === Math.round(label.priceNaira * 100),
  };
}

export interface Tally {
  n: number;
  isProduct: number;
  brand: number;
  model: number;
  variant: number;
  allThree: number;
  priceN: number;
  price: number;
}

export function emptyTally(): Tally {
  return { n: 0, isProduct: 0, brand: 0, model: 0, variant: 0, allThree: 0, priceN: 0, price: 0 };
}

export function addScore(t: Tally, s: LabelScore): void {
  t.n++;
  t.isProduct += Number(s.isProduct);
  t.brand += Number(s.brand);
  t.model += Number(s.model);
  t.variant += Number(s.variant);
  t.allThree += Number(s.brand && s.model && s.variant);
  if (s.price !== null) {
    t.priceN++;
    t.price += Number(s.price);
  }
}
