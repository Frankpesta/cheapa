/**
 * Metrics for the image-model benchmark (05 §5.1, 13 §13.6). Pure functions over
 * normalised vectors so they can be unit tested without models.
 */

export interface Item {
  /** Images of the same product share a group (Jiji ad id). */
  group: string;
  vec: ArrayLike<number>;
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

/** Indices of the k most similar index items (cosine on normalised vectors). */
export function topK(query: ArrayLike<number>, index: readonly Item[], k: number): number[] {
  return index
    .map((item, i) => ({ i, sim: dot(query, item.vec) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k)
    .map((r) => r.i);
}

/**
 * Share of queries with at least one same-group item in their top k. The acceptance
 * test (05 §5.1) is recall@5 ≥ 0.8: a product's other listings in the top 5.
 */
export function recallAtK(queries: readonly Item[], index: readonly Item[], k: number): number {
  if (queries.length === 0) return 0;
  let hits = 0;
  for (const q of queries) {
    if (topK(q.vec, index, k).some((i) => index[i]?.group === q.group)) hits += 1;
  }
  return hits / queries.length;
}

/** Zero-shot classification: label of the most similar label prompt vector. */
export function zeroShotAccuracy(
  images: readonly { label: string; vec: ArrayLike<number> }[],
  labels: readonly { label: string; vec: ArrayLike<number> }[],
): number {
  if (images.length === 0) return 0;
  let correct = 0;
  for (const img of images) {
    let best = { label: '', sim: -Infinity };
    for (const l of labels) {
      const sim = dot(img.vec, l.vec);
      if (sim > best.sim) best = { label: l.label, sim };
    }
    if (best.label === img.label) correct += 1;
  }
  return correct / images.length;
}

/** Nearest-rank percentile (p in 0..100). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? Number.NaN;
}

/**
 * Raw cosine calibration for the matcher (04 §4.3): per query, the best cosine to another
 * photo of the same product (positive) and to a different product in the same category
 * (hardest negative). The gap shows where "same item" starts.
 */
export function similarityBands(
  queries: readonly (Item & { category: string })[],
  index: readonly (Item & { category: string })[],
): { positives: number[]; negatives: number[] } {
  const positives: number[] = [];
  const negatives: number[] = [];
  for (const q of queries) {
    let pos = -Infinity;
    let neg = -Infinity;
    for (const item of index) {
      if (item.category !== q.category) continue;
      const sim = dot(q.vec, item.vec);
      if (item.group === q.group) pos = Math.max(pos, sim);
      else neg = Math.max(neg, sim);
    }
    if (pos > -Infinity) positives.push(pos);
    if (neg > -Infinity) negatives.push(neg);
  }
  return { positives, negatives };
}
