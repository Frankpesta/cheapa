import type { VisionResult } from '@cheapa/ml';
import { describe, expect, it } from 'vitest';
import { addScore, emptyTally, scoreResult, VisionLabel } from './vision-score.js';

const result: VisionResult = {
  isProduct: true,
  category: 'wig',
  brand: null,
  model: null,
  modelNumber: null,
  variant: { texture: 'Body Wave', lengthInches: '22' },
  visibleText: [],
  priceSeen: 8_500_000,
  searchQuery: '22 inch body wave wig',
  confidence: 0.8,
  items: [],
};

describe('scoreResult', () => {
  it('matches after normalising case and punctuation', () => {
    const label = VisionLabel.parse({
      file: 'a.jpg',
      variant: { texture: 'body-wave', lengthInches: '22' },
      priceNaira: 85_000,
    });
    expect(scoreResult(label, result)).toEqual({
      isProduct: true,
      brand: true,
      model: true,
      variant: true,
      price: true,
    });
  });

  it('fails variant on any wrong key and skips price when unlabelled', () => {
    const label = VisionLabel.parse({ file: 'a.jpg', brand: 'Bella', variant: { lengthInches: '24' } });
    const score = scoreResult(label, result);
    expect(score).toMatchObject({ brand: false, variant: false, price: null });
    const tally = emptyTally();
    addScore(tally, score);
    expect(tally).toMatchObject({ n: 1, brand: 0, allThree: 0, priceN: 0 });
  });
});
