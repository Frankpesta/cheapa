import { describe, expect, it } from 'vitest';
import { shouldPersist } from './cache-rules';

const q = (key: string, status: 'pending' | 'error' | 'success' = 'success') => ({
  queryKey: [key, 'x'],
  state: { status },
});

describe('shouldPersist', () => {
  it('keeps answered searches, products, price history and history lists', () => {
    for (const k of ['search', 'product', 'product-history', 'searches'])
      expect(shouldPersist(q(k))).toBe(true);
  });

  it('skips failures, in-flight queries and anything else', () => {
    expect(shouldPersist(q('search', 'error'))).toBe(false);
    expect(shouldPersist(q('search', 'pending'))).toBe(false);
    expect(shouldPersist(q('me'))).toBe(false);
  });
});
