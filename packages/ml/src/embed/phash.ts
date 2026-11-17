/**
 * 64-bit perceptual hash (DCT pHash) for exact-image duplicate detection: two stores
 * reposting the same supplier photo get the same or a very close hash (04 §4.3).
 * Pure functions over grayscale pixels; decoding and resizing happen in image.ts.
 */

/** Side of the grayscale square the hash is computed from. */
export const PHASH_INPUT_SIZE = 32;
const LOW = 8;

const COS = buildCosTable(PHASH_INPUT_SIZE);

/**
 * `gray` is PHASH_INPUT_SIZE² luminance values, row-major. Returns a signed 64-bit value
 * so it fits Postgres `bigint` directly.
 */
export function phashFromGray(gray: ArrayLike<number>): bigint {
  const n = PHASH_INPUT_SIZE;
  if (gray.length !== n * n) throw new Error(`phash expects ${n * n} pixels, got ${gray.length}`);
  const coeffs = lowFrequencyDct(gray, n);
  // Skip the DC term (overall brightness) when picking the median.
  const median = medianOf(coeffs.slice(1));
  let hash = 0n;
  for (const c of coeffs) hash = (hash << 1n) | (c > median ? 1n : 0n);
  return BigInt.asIntN(64, hash);
}

/** Number of differing bits; ≤ 6 or so means the same picture (resized, recompressed). */
export function hammingDistance(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a ^ b);
  let count = 0;
  while (x) {
    x &= x - 1n;
    count += 1;
  }
  return count;
}

/** Top-left LOW×LOW block of the 2-D DCT-II, row-major. */
function lowFrequencyDct(gray: ArrayLike<number>, n: number): number[] {
  // Rows first: rowDct[y][u] for u < LOW.
  const rows: number[][] = [];
  for (let y = 0; y < n; y += 1) {
    const row: number[] = [];
    for (let u = 0; u < LOW; u += 1) {
      let sum = 0;
      for (let x = 0; x < n; x += 1) sum += (gray[y * n + x] ?? 0) * (COS[u]?.[x] ?? 0);
      row.push(sum);
    }
    rows.push(row);
  }
  const out: number[] = [];
  for (let v = 0; v < LOW; v += 1) {
    for (let u = 0; u < LOW; u += 1) {
      let sum = 0;
      for (let y = 0; y < n; y += 1) sum += (rows[y]?.[u] ?? 0) * (COS[v]?.[y] ?? 0);
      out.push(sum);
    }
  }
  return out;
}

function buildCosTable(n: number): number[][] {
  const table: number[][] = [];
  for (let k = 0; k < LOW; k += 1) {
    const row: number[] = [];
    for (let x = 0; x < n; x += 1) row.push(Math.cos(((2 * x + 1) * k * Math.PI) / (2 * n)));
    table.push(row);
  }
  return table;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
