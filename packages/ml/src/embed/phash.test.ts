import { describe, expect, it } from 'vitest';
import { jpeg } from '../test/images.js';
import { decodeImage } from './image.js';
import { hammingDistance, phashFromGray, PHASH_INPUT_SIZE } from './phash.js';

const hashOf = async (bytes: Buffer) => (await decodeImage(bytes)).phash;

describe('phash', () => {
  it('is stable across resizing and recompression', async () => {
    const a = await hashOf(await jpeg('dress', { size: 800, quality: 95 }));
    const b = await hashOf(await jpeg('dress', { size: 300, quality: 40 }));
    expect(hammingDistance(a, b)).toBeLessThanOrEqual(6);
  });

  it('separates different pictures', async () => {
    const dress = await hashOf(await jpeg('dress'));
    const bag = await hashOf(await jpeg('bag'));
    const stripes = await hashOf(await jpeg('stripes'));
    expect(hammingDistance(dress, bag)).toBeGreaterThan(12);
    expect(hammingDistance(dress, stripes)).toBeGreaterThan(12);
  });

  it('fits a signed 64-bit Postgres bigint', async () => {
    const h = await hashOf(await jpeg('stripes'));
    expect(h).toBeGreaterThanOrEqual(-(2n ** 63n));
    expect(h).toBeLessThan(2n ** 63n);
  });

  it('rejects the wrong pixel count', () => {
    expect(() => phashFromGray(new Uint8Array(10))).toThrow(/expects/);
    expect(phashFromGray(new Uint8Array(PHASH_INPUT_SIZE ** 2))).toBe(0n);
  });

  it('counts differing bits', () => {
    expect(hammingDistance(0n, 0n)).toBe(0);
    expect(hammingDistance(0b1011n, 0b0001n)).toBe(2);
    expect(hammingDistance(-1n, 0n)).toBe(64);
  });
});
