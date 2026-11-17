import { describe, expect, it } from 'vitest';
import { Batcher } from './batcher.js';

describe('Batcher', () => {
  it('groups concurrent calls into batches of maxBatch, keeping order', async () => {
    const sizes: number[] = [];
    const b = new Batcher<number, number>({
      maxBatch: 4,
      maxWaitMs: 5,
      process: (items) => {
        sizes.push(items.length);
        return Promise.resolve(items.map((x) => x * 10));
      },
    });
    const out = await Promise.all(Array.from({ length: 10 }, (_, i) => b.run(i)));
    expect(out).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(sizes).toEqual([4, 4, 2]);
  });

  it('flushes a partial batch after maxWaitMs', async () => {
    const b = new Batcher<string, string>({ maxWaitMs: 1, process: (items) => Promise.resolve(items) });
    await expect(b.run('one')).resolves.toBe('one');
  });

  it('rejects every caller in a failed batch, then keeps working', async () => {
    let fail = true;
    const b = new Batcher<number, number>({
      maxWaitMs: 1,
      process: (items) => (fail ? Promise.reject(new Error('model crashed')) : Promise.resolve(items)),
    });
    const results = await Promise.allSettled([b.run(1), b.run(2)]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    fail = false;
    await expect(b.run(3)).resolves.toBe(3);
  });

  it('rejects when the batch returns the wrong number of results', async () => {
    const b = new Batcher<number, number>({ maxWaitMs: 1, process: () => Promise.resolve([]) });
    await expect(b.run(1)).rejects.toThrow(/0 results for 1/);
  });
});
