/**
 * What "the same product" means, per department (04 §4.2–4.3, overridden for fashion and
 * beauty by 13-fashion-and-beauty.md 13.4). Hard attributes split products and veto a
 * match; soft ones (size, colour, condition) are shown per listing.
 */
import type { Department, Variant } from '../types.js';

export interface MatchWeights {
  image: number;
  text: number;
  attributes: number;
}

/** 13 §13.4: image-led for fashion and hair, text-led for beauty and electronics. */
export const WEIGHTS: Record<Department, MatchWeights> = {
  clothing: { image: 0.65, text: 0.15, attributes: 0.2 },
  shoes: { image: 0.65, text: 0.15, attributes: 0.2 },
  bags_accessories: { image: 0.65, text: 0.15, attributes: 0.2 },
  hair: { image: 0.65, text: 0.15, attributes: 0.2 },
  beauty: { image: 0.3, text: 0.4, attributes: 0.3 },
  electronics: { image: 0.35, text: 0.45, attributes: 0.2 },
  other: { image: 0.5, text: 0.3, attributes: 0.2 },
};

/**
 * Departments where the photo carries the match. Without an image similarity they never
 * merge on text alone: a wrong fashion merge is worse than a missed one (13 §13.4).
 */
export const IMAGE_LED: ReadonlySet<Department> = new Set(['clothing', 'shoes', 'bags_accessories', 'hair']);

export interface MatchThresholds {
  /** ≥ this: merge. */
  merge: number;
  /** ≥ this (and < merge): merge provisionally and queue for review. */
  review: number;
}
export const DEFAULT_THRESHOLDS: MatchThresholds = { merge: 0.82, review: 0.65 };

/** Supplier-photo match: perceptual-hash distance at or under this, same category and audience. */
export const PHASH_MAX_DISTANCE = 6;

/**
 * The hard attributes of a listing, the ones a canonical product stores in `variant`.
 * Sizes, colours and condition are soft and never stored on the product.
 */
export function hardVariant(department: Department, v: Variant): Variant {
  const pick = <K extends keyof Variant>(...keys: K[]): Variant =>
    Object.fromEntries(keys.filter((k) => v[k] !== undefined).map((k) => [k, v[k]]));
  switch (department) {
    case 'clothing':
    case 'shoes':
    case 'bags_accessories':
      return { ...pick('audience'), packCount: v.packCount ?? 1 };
    case 'hair':
      return pick('hair', 'packCount');
    case 'beauty':
      return { ...pick('shade', 'netContent'), packCount: v.packCount ?? 1 };
    case 'electronics':
      return pick('storageGb', 'ramGb', 'screenInches', 'capacity');
    default:
      return {};
  }
}

const norm = (s: string | undefined) =>
  s
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Both known and different. Unknown on either side never vetoes. */
function conflict<T>(
  a: T | undefined,
  b: T | undefined,
  eq: (x: T, y: T) => boolean = (x, y) => x === y,
): boolean {
  return a !== undefined && b !== undefined && !eq(a, b);
}

export interface Comparable {
  department: Department;
  category: string | null;
  brand?: string | null | undefined;
  variant: Variant;
}

/**
 * Why two items can't be the same product, or null. Applies to listing-vs-product and
 * listing-vs-listing alike.
 */
export function vetoReason(a: Comparable, b: Comparable): string | null {
  if (a.department !== b.department) return 'department';
  if (a.category && b.category && a.category !== b.category) return 'item type';
  if (conflict(norm(a.brand ?? undefined), norm(b.brand ?? undefined))) return 'brand';
  const x = hardVariant(a.department, a.variant);
  const y = hardVariant(b.department, b.variant);
  if (conflict(x.audience, y.audience) && x.audience !== 'unisex' && y.audience !== 'unisex')
    return 'audience';
  if (conflict(x.packCount, y.packCount)) return 'pack count';
  if (conflict(x.storageGb, y.storageGb)) return 'storage';
  if (conflict(x.ramGb, y.ramGb)) return 'ram';
  if (conflict(x.screenInches, y.screenInches)) return 'screen size';
  if (conflict(x.capacity, y.capacity, (p, q) => p.value === q.value && p.unit === q.unit)) return 'capacity';
  if (conflict(norm(x.shade), norm(y.shade))) return 'shade';
  if (conflict(x.netContent, y.netContent, (p, q) => p.value === q.value && p.unit === q.unit)) return 'size';
  const h = x.hair;
  const k = y.hair;
  if (h && k) {
    if (conflict(h.lengthInches, k.lengthInches)) return 'hair length';
    if (conflict(norm(h.texture), norm(k.texture))) return 'hair texture';
    if (conflict(h.densityPct, k.densityPct)) return 'hair density';
    if (conflict(norm(h.lace), norm(k.lace))) return 'lace';
    if (conflict(h.fibre, k.fibre)) return 'fibre';
  }
  return null;
}
