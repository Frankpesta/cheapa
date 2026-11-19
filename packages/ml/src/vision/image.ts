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

/** Crops smaller than this (px, either side) are noise; the caller keeps the full image. */
const MIN_CROP_EDGE = 48;

/**
 * Crops a prepared image to one detected item (13 §13.6) so the image vector describes
 * the dress, not the whole screenshot. Returns null when the box is too small or covers
 * nearly the whole frame (cropping would change nothing).
 */
export async function cropToBox(
  img: ImageInput,
  box: { x: number; y: number; w: number; h: number },
): Promise<ImageInput | null> {
  if (box.w * box.h > 0.85) return null;
  const meta = await sharp(img.bytes).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) return null;
  const left = Math.max(0, Math.floor(box.x * width));
  const top = Math.max(0, Math.floor(box.y * height));
  const w = Math.min(width - left, Math.ceil(box.w * width));
  const h = Math.min(height - top, Math.ceil(box.h * height));
  if (w < MIN_CROP_EDGE || h < MIN_CROP_EDGE) return null;
  const out = await sharp(img.bytes)
    .extract({ left, top, width: w, height: h })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { bytes: new Uint8Array(out), mediaType: 'image/jpeg' };
}
