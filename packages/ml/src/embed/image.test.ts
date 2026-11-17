import { describe, expect, it } from 'vitest';
import { jpeg, transparentPng } from '../test/images.js';
import { decodeImage, ImageDecodeError } from './image.js';

describe('decodeImage', () => {
  it('downscales to a 448px long edge, RGB', async () => {
    const { image, width, height } = await decodeImage(await jpeg('dress', { size: 1200 }));
    expect([width, height]).toEqual([448, 448]);
    expect(image.channels).toBe(3);
    expect(image.data.length).toBe(448 * 448 * 3);
  });

  it('never enlarges small images', async () => {
    const { width } = await decodeImage(await jpeg('bag', { size: 200 }));
    expect(width).toBe(200);
  });

  it('flattens transparency onto white', async () => {
    const { image } = await decodeImage(await transparentPng());
    expect(Array.from(image.data.slice(0, 3))).toEqual([255, 255, 255]);
  });

  it('rejects empty, oversized and non-image bytes', async () => {
    await expect(decodeImage(new Uint8Array())).rejects.toBeInstanceOf(ImageDecodeError);
    await expect(decodeImage(await jpeg('dress'), 100)).rejects.toThrow(/over 100 bytes/);
    await expect(decodeImage(Buffer.from('<html>nope</html>'))).rejects.toBeInstanceOf(ImageDecodeError);
  });
});
