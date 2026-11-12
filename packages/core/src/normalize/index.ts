/**
 * Normalization pipeline v1 (04-normalization-matching.md 4.1, 13-fashion-and-beauty.md
 * 13.3): RawListing -> NormalizedListing. Pure and synchronous, so the worker can run it
 * per listing and tests can pin exact outputs.
 *
 * Phase 04 adds the brand dictionary, the electronics model packs and the LLM fallback
 * for listings below the confidence bar (docs/build/BACKLOG.md).
 */
import type { Department, NormalizedListing, RawListing, Variant } from '../types.js';
import { classify } from './taxonomy.js';
import { cleanBrand, cleanTitle, detectCondition } from './title.js';
import { extractVariant } from './variant.js';

export { classify, TAXONOMY, titleHead, type Classification, type TaxonomyLeaf } from './taxonomy.js';
export { cleanBrand, cleanTitle, detectCondition } from './title.js';
export { extractAudience, extractNetContent, extractPackCount, extractVariant } from './variant.js';
export { extractSizes, letterSize } from './sizes.js';

/** Below this, phase 04 may ask the TextExtractor (LLM) for help. */
export const LOW_CONFIDENCE = 0.6;

/** The attribute that best identifies an item in each department. */
const KEY_ATTRIBUTE: Record<Department, (v: Variant) => boolean> = {
  clothing: (v) => Boolean(v.colours?.length || v.material || v.pattern),
  shoes: (v) => Boolean(v.colours?.length || v.material || v.heelHeightCm),
  bags_accessories: (v) => Boolean(v.colours?.length || v.material),
  hair: (v) => Boolean(v.hair?.lengthInches && v.hair.texture),
  beauty: (v) => Boolean(v.netContent || v.shade),
  electronics: (v) => Boolean(v.storageGb || v.ramGb || v.screenInches),
  other: () => false,
};

/**
 * 0..1: how much of what matters for this department we managed to read. Fashion leans
 * on the image for matching, so a missing brand costs less there than in beauty.
 */
function confidence(
  department: Department,
  categorySource: 'path' | 'title' | 'none',
  category: string | null,
  brand: string | undefined,
  variant: Variant,
): number {
  const fashion = department === 'clothing' || department === 'shoes' || department === 'bags_accessories';
  let score = 0.2;
  if (category) score += categorySource === 'path' ? 0.35 : 0.3;
  else if (department !== 'other') score += 0.15;
  if (brand) score += fashion ? 0.15 : 0.25;
  else if (fashion) score += 0.1;
  if (KEY_ATTRIBUTE[department](variant)) score += 0.25;
  return Math.min(1, Math.round(score * 100) / 100);
}

export function normalizeListing(raw: RawListing): NormalizedListing {
  const title = cleanTitle(raw.title);
  const { department, category, source } = classify(raw.categoryPath, title);
  const brand = cleanBrand(raw.brand);
  const variant = extractVariant(title, department, category, raw.categoryPath, raw.variant);
  const attributes = title === raw.title ? raw.attributes : { ...raw.attributes, rawTitle: raw.title };
  return {
    ...raw,
    title,
    brand,
    attributes,
    department,
    category,
    variant,
    condition: detectCondition(raw.condition, raw.title, department),
    extractionConfidence: confidence(department, source, category, brand, variant),
  };
}

/** Listings we drop instead of storing: used beauty products (13-fashion-and-beauty.md 13.2). */
export function skipReason(listing: NormalizedListing): string | null {
  if (listing.department === 'beauty' && (listing.condition === 'used' || listing.condition === 'uk_used')) {
    return 'used_beauty';
  }
  return null;
}
