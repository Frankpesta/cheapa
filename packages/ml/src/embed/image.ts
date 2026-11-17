/**
 * In-memory image decoding for embeddings (05 §5.1). Bytes are never written anywhere:
 * decode, downscale, hash, embed, drop (CLAUDE.md rules 3 and 4).
 */
import { RawImage } from '@huggingface/transformers';
import sharp from 'sharp';
import { phashFromGray, PHASH_INPUT_SIZE } from './phash.js';

/** Store images and user uploads above this are rejected before decoding. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Decoded pixels limit (decompression-bomb guard): 40 MP. */
const MAX_INPUT_PIXELS = 40_000_000;
/** Long-edge size kept after decoding; the model processors take it down to 224. */
const WORKING_SIZE = 448;

export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageDecodeError';
  }
}

export interface DecodedImage {
  /** RGB, long edge ≤ 448 px, transparency flattened onto white. */
  image: RawImage;
  phash: bigint;
  width: number;
  height: number;
}

/**
 * Decodes JPEG/PNG/WebP/AVIF/GIF (first frame) bytes. Transparent product cut-outs are
 * flattened onto white so they look like the white-background shots stores use.
 */
export async function decodeImage(bytes: Uint8Array, maxBytes = MAX_IMAGE_BYTES): Promise<DecodedImage> {
  if (bytes.byteLength === 0) throw new ImageDecodeError('empty image');
  if (bytes.byteLength > maxBytes) throw new ImageDecodeError(`image over ${maxBytes} bytes`);
  const input = () =>
    sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', pages: 1 })
      .rotate()
      .flatten({ background: '#ffffff' });
  try {
    const [rgb, gray] = await Promise.all([
      input()
        .resize(WORKING_SIZE, WORKING_SIZE, { fit: 'inside', withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
      input()
        .resize(PHASH_INPUT_SIZE, PHASH_INPUT_SIZE, { fit: 'fill' })
        .grayscale()
        .removeAlpha()
        .raw()
        .toBuffer(),
    ]);
    const { width, height, channels } = rgb.info;
    if (channels !== 3) throw new ImageDecodeError(`unexpected ${channels} channels`);
    return {
      image: new RawImage(new Uint8ClampedArray(rgb.data), width, height, 3),
      phash: phashFromGray(gray),
      width,
      height,
    };
  } catch (err) {
    if (err instanceof ImageDecodeError) throw err;
    throw new ImageDecodeError(`not a decodable image: ${(err as Error).message}`);
  }
}
