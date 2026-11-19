/**
 * Search ranking (05 §5.3, 13 §13.5). Pure: hits in, ranked product ids out.
 *
 * Thresholds are v1 and provisional: tune them on the owner's 200-screenshot test set
 * (13 §13.9). Image cosines are SigLIP raw cosines; IMAGE_SIM_RANGE (core) calibrates them.
 */
import { imageEvidence, titleTokens, type Department, type Variant } from '@cheapa/core';

/** Raw image cosine at or above which a product counts as the exact item. */
export const EXACT_IMAGE_MIN = 0.92;
/** Lookalike bands (13 §13.5): very close >= 0.90, close from LOOKALIKE_MIN_SIM. */
export const VERY_CLOSE_SIM = 0.9;
/** Below this best score (or with fewer than 3 products), ask live stores (05 §5.3 step 4). */
export const LOW_CONFIDENCE_SCORE = 0.6;
/** Text-only searches: products need at least this score. */
export const TEXT_EXACT_MIN = 0.5;
/** Two products this close in score that differ only by variant: ask which (step 5). */
export const AMBIGUITY_GAP = 0.05;
/** MiniLM cosines run high between any two titles in one category; rescale like images. */
const TEXT_SIM_RANGE = { lo: 0.45, hi: 0.85 };

export interface Hit {
  listingId: string;
  productId: string | null;
  /** Raw cosine (vector hits) or the listing title (full-text hits). */
  sim?: number;
  title?: string;
}

export interface ProductMeta {
  productId: string;
  brand: string | null;
  model: string | null;
  department: Department;
  category: string | null;
  variant: Variant;
}

export interface Ranked {
  productId: string;
  score: number;
  /** Best raw image cosine over the product's listings, when the visual path ran. */
  imageSim?: number;
}

export interface RankInput {
  imageHits: readonly Hit[];
  textVecHits: readonly Hit[];
  ftsHits: readonly Hit[];
  /** The text the read path searched with (vision searchQuery or the typed query). */
  query: string | null;
  brand?: string | null;
  model?: string | null;
}

const rescale = (v: number, lo: number, hi: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Share of the query's tokens found in a title. */
export function tokenCoverage(query: string, title: string): number {
  const q = titleTokens(query);
  if (q.size === 0) return 0;
  const t = titleTokens(title);
  let hit = 0;
  for (const token of q) if (t.has(token)) hit++;
  return hit / q.size;
}

function maxBy(hits: readonly Hit[], value: (h: Hit) => number): Map<string, number> {
  const out = new Map<string, number>();
  for (const h of hits) {
    if (!h.productId) continue;
    const v = value(h);
    if (v > (out.get(h.productId) ?? -Infinity)) out.set(h.productId, v);
  }
  return out;
}

/** score = 0.5 visual + 0.5 text when both paths ran, else the one that did, + brand/model. */
export function rankProducts(input: RankInput, meta: ReadonlyMap<string, ProductMeta>): Ranked[] {
  const image = maxBy(input.imageHits, (h) => h.sim ?? 0);
  const textVec = maxBy(input.textVecHits, (h) => rescale(h.sim ?? 0, TEXT_SIM_RANGE.lo, TEXT_SIM_RANGE.hi));
  const query = input.query;
  const fts = query
    ? maxBy(input.ftsHits, (h) => tokenCoverage(query, h.title ?? ''))
    : new Map<string, number>();
  const visualRan = input.imageHits.length > 0;
  const textRan = input.textVecHits.length > 0 || input.ftsHits.length > 0;

  const ids = new Set([...image.keys(), ...textVec.keys(), ...fts.keys()]);
  const out: Ranked[] = [];
  for (const productId of ids) {
    const m = meta.get(productId);
    if (!m) continue;
    const raw = image.get(productId);
    const visual = raw === undefined ? 0 : imageEvidence(raw);
    const text = Math.max(textVec.get(productId) ?? 0, fts.get(productId) ?? 0);
    let score = visualRan && textRan ? 0.5 * visual + 0.5 * text : visualRan ? visual : text;
    if (input.brand && m.brand) score += same(input.brand, m.brand) ? 0.1 : -0.2;
    if (same(input.model, m.model)) score += 0.15;
    out.push({
      productId,
      score: Math.min(1, Math.max(0, score)),
      ...(raw !== undefined ? { imageSim: raw } : {}),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Image search: the same item by picture, or by brand and model the vision read named. */
export function isExactImageMatch(
  r: Ranked,
  m: ProductMeta | undefined,
  brand?: string | null,
  model?: string | null,
) {
  if ((r.imageSim ?? 0) >= EXACT_IMAGE_MIN) return true;
  return !!m && same(brand, m.brand) && same(model, m.model);
}

export interface Shelf {
  department?: Department;
  category?: string | null;
  audience?: Variant['audience'];
}

/** Lookalikes stay on the detected shelf: same department, category and audience (13 §13.5). */
export function onShelf(m: ProductMeta, shelf: Shelf): boolean {
  if (shelf.department && m.department !== shelf.department) return false;
  if (shelf.category && m.category && m.category !== shelf.category) return false;
  const a = shelf.audience;
  const b = m.variant.audience;
  if (a && b && a !== b && a !== 'unisex' && b !== 'unisex') return false;
  return true;
}

export const lookalikeBand = (sim: number): 'very_close' | 'close' =>
  sim >= VERY_CLOSE_SIM ? 'very_close' : 'close';

/** Band first, then cheapest first within the band (rule 7: match quality, then price). */
export function sortLookalikes<T extends { band: 'very_close' | 'close'; cheapestKobo: number }>(
  cards: T[],
): T[] {
  const rank = { very_close: 0, close: 1 } as const;
  return [...cards].sort((a, b) => rank[a.band] - rank[b.band] || a.cheapestKobo - b.cheapestKobo);
}

/** The top two products are one model in two variants with near-equal scores. */
export function variantAmbiguity(
  top: readonly Ranked[],
  meta: ReadonlyMap<string, ProductMeta>,
): [string, string] | null {
  const [a, b] = top;
  if (!a || !b || a.score - b.score > AMBIGUITY_GAP) return null;
  const ma = meta.get(a.productId);
  const mb = meta.get(b.productId);
  if (!ma || !mb || !ma.model || !same(ma.brand, mb.brand) || !same(ma.model, mb.model)) return null;
  return JSON.stringify(ma.variant) === JSON.stringify(mb.variant) ? null : [a.productId, b.productId];
}

export function isLowConfidence(exact: readonly Ranked[]): boolean {
  return exact.length < 3 || (exact[0]?.score ?? 0) < LOW_CONFIDENCE_SCORE;
}
