/**
 * What the model is asked to emit, kept to plain JSON-schema shapes every vendor's
 * structured-output mode accepts (no records, no numeric bounds), then converted to
 * the stricter VisionResult. Shared by all providers.
 */
import { nairaToKobo } from '@cheapa/core';
import { z } from 'zod';
import { VisionResult } from './types.js';

export const WireVisionResult = z.object({
  isProduct: z.boolean(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  modelNumber: z.string().nullable(),
  variant: z.array(z.object({ key: z.string(), value: z.string() })),
  visibleText: z.array(z.string()),
  priceNaira: z.number().nullable(),
  searchQuery: z.string(),
  confidence: z.number(),
  items: z.array(
    z.object({
      kind: z.string(),
      description: z.string(),
      bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
    }),
  ),
});
export type WireVisionResult = z.infer<typeof WireVisionResult>;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const blankToNull = (s: string | null): string | null => (s && s.trim() ? s.trim() : null);

/** Throws ZodError when the converted result is still invalid. */
export function fromWire(wire: WireVisionResult): VisionResult {
  const variant: Record<string, string> = {};
  for (const { key, value } of wire.variant) {
    const k = key.trim();
    const v = value.trim();
    if (k && v) variant[k] = v;
  }
  const price = wire.priceNaira;
  return VisionResult.parse({
    isProduct: wire.isProduct,
    category: blankToNull(wire.category),
    brand: blankToNull(wire.brand),
    model: blankToNull(wire.model),
    modelNumber: blankToNull(wire.modelNumber),
    variant,
    visibleText: wire.visibleText.map((t) => t.trim()).filter(Boolean),
    priceSeen: price !== null && Number.isFinite(price) && price > 0 ? nairaToKobo(Math.round(price)) : null,
    searchQuery: wire.searchQuery.trim(),
    confidence: clamp01(wire.confidence),
    items: wire.items
      .filter((item) => item.kind.trim())
      .map((item) => ({
        kind: item.kind.trim(),
        description: item.description.trim(),
        bbox: clampBox(item.bbox),
      })),
  });
}

function clampBox(b: { x: number; y: number; w: number; h: number }) {
  const x = clamp01(b.x);
  const y = clamp01(b.y);
  return { x, y, w: Math.min(clamp01(b.w), 1 - x), h: Math.min(clamp01(b.h), 1 - y) };
}
