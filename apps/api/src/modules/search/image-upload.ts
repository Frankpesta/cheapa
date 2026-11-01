import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface UploadedImage {
  bytes: Buffer;
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';
  sha256: string;
  fields: Record<string, string>;
}

/** Identify the format from magic bytes; the client's Content-Type isn't trusted. */
export function sniffImage(bytes: Buffer): UploadedImage['mime'] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const brand = bytes.toString('ascii', 8, 12);
    if (['heic', 'heix', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) return 'image/heic';
  }
  return null;
}

/**
 * Read the single "image" part of a multipart request into memory.
 * CLAUDE.md rule 4: uploads are never written to disk; callers keep only the hash.
 */
export async function readImageUpload(request: FastifyRequest): Promise<UploadedImage> {
  if (!request.isMultipart())
    throw new BadRequestException('Send the image as multipart/form-data in a field named "image"');

  let part;
  try {
    part = await request.file({
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 5, fieldSize: 1024 },
    });
  } catch {
    throw new BadRequestException('Could not read the upload');
  }
  if (!part || part.fieldname !== 'image') throw new BadRequestException('Missing "image" file field');

  let bytes: Buffer;
  try {
    bytes = await part.toBuffer();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new PayloadTooLargeException('Image is larger than 5 MB');
    }
    throw new BadRequestException('Could not read the image');
  }

  const mime = sniffImage(bytes);
  if (!mime) throw new BadRequestException('Unsupported image type: use JPEG, PNG, WebP or HEIC');

  const fields: Record<string, string> = {};
  for (const [name, field] of Object.entries(part.fields)) {
    const value = Array.isArray(field) ? field[0] : field;
    if (value && value.type === 'field' && typeof value.value === 'string') fields[name] = value.value;
  }
  return { bytes, mime, sha256: createHash('sha256').update(bytes).digest('hex'), fields };
}
