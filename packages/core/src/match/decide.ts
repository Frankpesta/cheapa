/**
 * Matcher decision (04 §4.3, 13 §13.4): exact keys first, then a weighted score over
 * image, text and attribute agreement, with hard vetoes. Similarities are inputs: image
 * and text embeddings arrive with phase 05; until then text falls back to title tokens
 * and image-led departments only merge on exact keys.
 */
import type { Department, Variant } from '../types.js';
import {
  DEFAULT_THRESHOLDS,
  IMAGE_LED,
  PHASH_MAX_DISTANCE,
  vetoReason,
  WEIGHTS,
  type MatchThresholds,
} from './rules.js';

export interface MatchItem {
  department: Department;
  category: string | null;
  title: string;
  brand?: string | null | undefined;
  model?: string | null | undefined;
  modelNumber?: string | null | undefined;
  gtin?: string | null | undefined;
  variant: Variant;
  /** 64-bit perceptual hash of the main image (phase 05). */
  phash?: bigint | null | undefined;
}

export interface Candidate extends MatchItem {
  productId: string;
  /** Cosine similarity of image embeddings, 0..1, when both have one (phase 05). */
  imageSim?: number;
  /** Cosine similarity of title embeddings, 0..1, when both have one (phase 05). */
  textSim?: number;
}

export type MatchDecision =
  | { kind: 'merge'; productId: string; score: number; via: ExactKey | 'score' }
  | { kind: 'review'; productId: string; score: number; via: 'score' }
  | { kind: 'new'; score: number; reason: string };

/** Words that say nothing about which product it is. */
const NOISE = new Set([
  'for',
  'and',
  'with',
  'the',
  'a',
  'of',
  'in',
  'women',
  'womens',
  'ladies',
  'lady',
  'men',
  'mens',
  'new',
  'quality',
  'original',
  'fashion',
  'stylish',
  'classy',
  'elegant',
  'unique',
  'beautiful',
  'sexy',
  'luxury',
]);

export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((t) => t.length > 1 && !NOISE.has(t)),
  );
}

/** Dice coefficient over title tokens: the text similarity until embeddings exist. */
export function titleSimilarity(a: string, b: string): number {
  const x = titleTokens(a);
  const y = titleTokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared += 1;
  return (2 * shared) / (x.size + y.size);
}

/** Brand, model and category agreement, 0..1 (soft attributes never count). */
export function attributeAgreement(a: MatchItem, b: MatchItem): number {
  const parts: number[] = [];
  if (a.brand && b.brand) parts.push(a.brand.toLowerCase() === b.brand.toLowerCase() ? 1 : 0);
  else if (a.brand || b.brand) parts.push(0.5);
  if (a.model && b.model) parts.push(titleSimilarity(a.model, b.model));
  if (a.category && b.category) parts.push(a.category === b.category ? 1 : 0);
  return parts.length === 0 ? 0.5 : parts.reduce((s, p) => s + p, 0) / parts.length;
}

export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

const clean = (s: string | null | undefined) => s?.toLowerCase().replace(/[^a-z0-9]/g, '') || undefined;

/** Exact-key shortcuts (13 §13.4): GTIN; brand + model number; supplier photo (phash ≤ 6). */
export type ExactKey = 'gtin' | 'model_number' | 'brand_model' | 'phash';

export function exactKey(a: MatchItem, b: MatchItem): ExactKey | null {
  if (a.gtin && b.gtin && a.gtin === b.gtin) return 'gtin';
  // Electronics (04 §4.2): brand + model + exact variant IS the product. Vetoes already
  // ruled out a storage/RAM conflict; storage must be known on both sides.
  if (
    a.department === 'electronics' &&
    clean(a.brand) &&
    clean(a.brand) === clean(b.brand) &&
    clean(a.model) &&
    clean(a.model) === clean(b.model) &&
    a.variant.storageGb !== undefined &&
    b.variant.storageGb !== undefined
  ) {
    return 'brand_model';
  }
  if (
    clean(a.brand) &&
    clean(a.brand) === clean(b.brand) &&
    clean(a.modelNumber) &&
    clean(a.modelNumber) === clean(b.modelNumber)
  ) {
    return 'model_number';
  }
  if (
    a.phash != null &&
    b.phash != null &&
    a.category !== null &&
    a.category === b.category &&
    a.variant.audience === b.variant.audience &&
    hammingDistance(a.phash, b.phash) <= PHASH_MAX_DISTANCE
  ) {
    return 'phash';
  }
  return null;
}

/**
 * Weighted score over the signals we have. Image-led departments with no image signal
 * return null: text alone may not merge two dresses.
 */
export function score(listing: MatchItem, candidate: Candidate): number | null {
  const w = WEIGHTS[listing.department];
  const image = candidate.imageSim;
  if (image === undefined && IMAGE_LED.has(listing.department)) return null;
  const text = candidate.textSim ?? titleSimilarity(listing.title, candidate.title);
  const attributes = attributeAgreement(listing, candidate);
  const parts: [number, number][] = [
    ...(image !== undefined ? [[w.image, image] as [number, number]] : []),
    [w.text, text],
    [w.attributes, attributes],
  ];
  const total = parts.reduce((s, [weight]) => s + weight, 0);
  return parts.reduce((s, [weight, value]) => s + weight * value, 0) / total;
}

/** The best candidate decides: merge, review (provisional merge), or a new product. */
export function decideMatch(
  listing: MatchItem,
  candidates: readonly Candidate[],
  thresholds: MatchThresholds = DEFAULT_THRESHOLDS,
): MatchDecision {
  const allowed = candidates.filter((c) => vetoReason(listing, c) === null);
  for (const c of allowed) {
    const via = exactKey(listing, c);
    if (via) return { kind: 'merge', productId: c.productId, score: 1, via };
  }
  let best: { c: Candidate; s: number } | undefined;
  for (const c of allowed) {
    const s = score(listing, c);
    if (s !== null && (!best || s > best.s)) best = { c, s };
  }
  if (!best) {
    const reason =
      candidates.length === 0 ? 'no candidates' : allowed.length === 0 ? 'all vetoed' : 'no image signal';
    return { kind: 'new', score: 0, reason };
  }
  const s = Math.round(best.s * 1000) / 1000;
  if (s >= thresholds.merge) return { kind: 'merge', productId: best.c.productId, score: s, via: 'score' };
  if (s >= thresholds.review) return { kind: 'review', productId: best.c.productId, score: s, via: 'score' };
  return { kind: 'new', score: s, reason: 'below review threshold' };
}
