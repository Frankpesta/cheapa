/**
 * VisionProvider contract (05 §5.2, 13 §13.6). Every vendor adapter returns a
 * VisionResult; app code never sees a vendor SDK type (CLAUDE.md rule 6).
 */
import { z } from 'zod';

/** Normalised box, 0..1 from the top-left corner of the image. */
export const BBox = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type BBox = z.infer<typeof BBox>;

/** One sellable item seen in the photo ("The dress", "The bag"). Never a person. */
export const VisionItem = z.object({
  kind: z.string().min(1),
  bbox: BBox,
  description: z.string(),
});
export type VisionItem = z.infer<typeof VisionItem>;

export const VisionResult = z.object({
  isProduct: z.boolean(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  modelNumber: z.string().nullable(),
  /** storage, size, colour, pattern, material, length, texture, shade... */
  variant: z.record(z.string(), z.string()).default({}),
  /** OCR-ish text seen in the image. */
  visibleText: z.array(z.string()).default([]),
  /** Price printed in a screenshot, integer kobo (CLAUDE.md rule 1). */
  priceSeen: z.number().int().nonnegative().nullable(),
  searchQuery: z.string(),
  confidence: z.number().min(0).max(1),
  /** Every distinct item; the first is the main one. */
  items: z.array(VisionItem).default([]),
});
export type VisionResult = z.infer<typeof VisionResult>;

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** Image bytes held in memory only (CLAUDE.md rule 4). */
export interface ImageInput {
  bytes: Uint8Array;
  mediaType: ImageMediaType;
}

export interface DescribeOptions {
  /** Caption or text the user shared with the image. */
  hintText?: string;
  signal?: AbortSignal;
}

export interface VisionUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface VisionResponse {
  result: VisionResult;
  usage: VisionUsage;
}

export interface VisionProvider {
  /** 'anthropic:haiku', later 'google:flash', 'openai:mini'. */
  readonly id: string;
  describeProduct(img: ImageInput, opts?: DescribeOptions): Promise<VisionResponse>;
}

/** The model returned no valid VisionResult after the retry. */
export class VisionInvalidOutputError extends Error {
  constructor(
    readonly providerId: string,
    message: string,
  ) {
    super(`${providerId}: ${message}`);
    this.name = 'VisionInvalidOutputError';
  }
}

/** The vendor declined the request (safety classifier). Not retried. */
export class VisionRefusedError extends Error {
  constructor(readonly providerId: string) {
    super(`${providerId}: request refused`);
    this.name = 'VisionRefusedError';
  }
}
