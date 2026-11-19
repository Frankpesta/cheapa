/**
 * Shrinks an uploaded image before it goes to a vision vendor: fewer image tokens,
 * EXIF (location, device) stripped. In memory only (CLAUDE.md rule 4).
 */
import sharp from 'sharp';
import type { ImageInput } from './types.js';

/** Long edge sent to vendors; larger images cost more without helping. */
export const VISION_MAX_EDGE = 1568;
export const VISION_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export class VisionImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisionImageError';
  }
}

export async function prepareVisionImage(bytes: Uint8Array): Promise<ImageInput> {
  if (bytes.byteLength > VISION_MAX_UPLOAD_BYTES) throw new VisionImageError('image too large');
  try {
    const out = await sharp(bytes, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(VISION_MAX_EDGE, VISION_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { bytes: new Uint8Array(out), mediaType: 'image/jpeg' };
  } catch {
    throw new VisionImageError('unreadable image');
  }
}
