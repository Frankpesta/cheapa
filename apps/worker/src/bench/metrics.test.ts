import { describe, expect, it } from 'vitest';
import { percentile, recallAtK, topK, zeroShotAccuracy } from './metrics.js';

const unit = (...v: number[]) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

describe('benchmark metrics', () => {
  const index = [
    { group: 'dress', vec: unit(1, 0.1, 0) },
    { group: 'bag', vec: unit(0, 1, 0) },
    { group: 'wig', vec: unit(0, 0, 1) },
    { group: 'shoe', vec: unit(0.7, 0.7, 0) },
  ];

  it('ranks by cosine', () => {
    expect(topK(unit(1, 0, 0), index, 2)).toEqual([0, 3]);
  });

  it('counts a query as a hit when any same-group item is in the top k', () => {
    const queries = [
      { group: 'dress', vec: unit(1, 0, 0) },
      { group: 'bag', vec: unit(0.6, 0.8, 0) },
      { group: 'wig', vec: unit(1, 1, 0.1) },
    ];
    expect(recallAtK(queries, index, 1)).toBeCloseTo(1 / 3);
    expect(recallAtK(queries, index, 2)).toBeCloseTo(2 / 3);
    expect(recallAtK([], index, 5)).toBe(0);
  });

  it('scores zero-shot labels', () => {
    const labels = [
      { label: 'dress', vec: unit(1, 0, 0) },
      { label: 'bag', vec: unit(0, 1, 0) },
    ];
    const images = [
      { label: 'dress', vec: unit(0.9, 0.1, 0) },
      { label: 'bag', vec: unit(0.9, 0.2, 0) },
    ];
    expect(zeroShotAccuracy(images, labels)).toBe(0.5);
  });

  it('takes nearest-rank percentiles', () => {
    const v = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
    expect(percentile(v, 50)).toBe(5);
    expect(percentile(v, 95)).toBe(10);
    expect(percentile([], 50)).toBeNaN();
  });
});
