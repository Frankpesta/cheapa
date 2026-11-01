import { z } from 'zod';
import { isKobo } from './money.js';

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export const StoreTier = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export type StoreTier = z.infer<typeof StoreTier>;

export const StorePlatform = z.enum([
  'custom',
  'woocommerce',
  'shopify',
  'wix',
  'opencart',
  'magento',
  'affiliate',
  'vendor',
]);
export type StorePlatform = z.infer<typeof StorePlatform>;

export const StoreStatus = z.enum(['active', 'paused', 'blocked', 'candidate', 'rejected']);
export type StoreStatus = z.infer<typeof StoreStatus>;

// ---------------------------------------------------------------------------
// Listing attributes
// ---------------------------------------------------------------------------

/**
 * "Foreign Used" / "UK used" / "London used" = uk_used; "Local Used", thrift and
 * okrika clothing = used.
 */
export const Condition = z.enum(['new', 'used', 'uk_used', 'refurbished', 'unknown']);
export type Condition = z.infer<typeof Condition>;

/** Who a fashion item is for. Different audiences are never the same canonical product. */
export const Audience = z.enum(['men', 'women', 'unisex', 'boys', 'girls', 'kids', 'baby']);
export type Audience = z.infer<typeof Audience>;

export const SizeSystem = z.enum(['letter', 'EU', 'UK', 'US', 'waist', 'age', 'numeric']);
export type SizeSystem = z.infer<typeof SizeSystem>;

/** One size as sold: letter "XL", EU shoe "42", waist "34", age "4-5Y". */
export const Size = z.object({ system: SizeSystem, value: z.string().min(1) });
export type Size = z.infer<typeof Size>;

const positiveInt = z.number().int().positive();
const label = z.string().min(1);

/** Top-level grouping that picks the matching rules (13-fashion-and-beauty.md 13.1, 13.4). */
export const Department = z.enum([
  'clothing',
  'shoes',
  'bags_accessories',
  'hair',
  'beauty',
  'electronics',
  'other',
]);
export type Department = z.infer<typeof Department>;

/** Wigs, bundles, closures, frontals, braids. Length, texture, density, lace and fibre are hard. */
export const HairSpec = z.object({
  lengthInches: z.number().positive().optional(),
  /** "bone straight", "body wave", "deep wave", "kinky curly"... */
  texture: label.optional(),
  densityPct: positiveInt.optional(),
  /** "HD", "transparent", "13x4", "4x4"... */
  lace: label.optional(),
  fibre: z.enum(['human', 'synthetic', 'blend']).optional(),
});
export type HairSpec = z.infer<typeof HairSpec>;

/** Net contents of a beauty product: "30ml", "50 g", "1.7 oz". Hard for matching. */
export const NetContent = z.object({
  value: z.number().positive(),
  unit: z.enum(['ml', 'cl', 'L', 'g', 'kg', 'oz', 'fl_oz']),
});
export type NetContent = z.infer<typeof NetContent>;

/**
 * Variant attributes. Which ones split canonical products depends on the
 * department (13-fashion-and-beauty.md 13.4):
 * - electronics: storage, RAM, screen, capacity are hard; colour soft
 * - clothing/shoes/bags: audience, pack count are hard; sizes and colours soft
 * - hair: hair spec is hard; colour soft
 * - beauty: shade, net content, pack count are hard
 */
export const Variant = z.object({
  // electronics / appliances
  storageGb: positiveInt.optional(),
  ramGb: positiveInt.optional(),
  screenInches: z.number().positive().optional(),
  capacity: z
    .object({ value: z.number().positive(), unit: z.enum(['L', 'kg', 'HP', 'W', 'mAh']) })
    .optional(),
  // fashion
  /** Colour names as sold ("Black", "Wine"). Several for multi-colour packs. */
  colours: z.array(label).optional(),
  /** Sizes this listing covers (a "From" price usually spans several). */
  sizes: z.array(Size).optional(),
  /** Items in one purchase: "2-Pack", "4-in-1", "3 Piece". Defaults to 1 when absent. */
  packCount: positiveInt.optional(),
  audience: Audience.optional(),
  /** "floral", "striped", "plain", "animal print"... */
  pattern: label.optional(),
  /** "satin", "cotton", "denim", "ankara", "PU leather", "gold-plated"... */
  material: label.optional(),
  /** Shoes only. */
  heelHeightCm: z.number().nonnegative().optional(),
  // hair and beauty
  hair: HairSpec.optional(),
  /** Makeup shade name or code ("Mocha", "N30"). */
  shade: label.optional(),
  netContent: NetContent.optional(),
  /** Anything else the extractor found (fit, edition, SPF...). */
  extra: z.record(z.string(), z.string()).optional(),
});
export type Variant = z.infer<typeof Variant>;

export const Kobo = z.number().refine(isKobo, 'must be a non-negative integer kobo amount');
const PositiveKobo = Kobo.refine((v) => v > 0, 'must be greater than zero');

/** How the price was shown: "₦ 8,940" exact, "From ₦ 13,340" from, "₦ X - ₦ Y" range. */
export const PriceKind = z.enum(['exact', 'from', 'range']);
export type PriceKind = z.infer<typeof PriceKind>;

// ---------------------------------------------------------------------------
// RawListing: adapter output. Validated at the adapter boundary.
// ---------------------------------------------------------------------------

export const RawListing = z
  .object({
    externalId: z.string().min(1),
    sourceUrl: z.url(),
    title: z.string().min(1),
    /** Lowest price shown (the "From" amount for multi-size items). */
    priceKobo: PositiveKobo,
    priceKind: PriceKind.default('exact'),
    /** Upper bound for 'range' prices. */
    priceMaxKobo: PositiveKobo.optional(),
    /** Strike-through price as shown by the store; its "From" form keeps the lowest amount. */
    oldPriceKobo: PositiveKobo.optional(),
    currency: z.literal('NGN').default('NGN'),
    inStock: z.boolean(),
    imageUrl: z.url().optional(),
    brand: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    modelNumber: z.string().min(1).optional(),
    gtin: z
      .string()
      .regex(/^\d{8}(?:\d{4,6})?$/, 'GTIN must be 8, 12, 13 or 14 digits')
      .optional(),
    /** Store's own category breadcrumb, top level first. */
    categoryPath: z.array(z.string().min(1)).default([]),
    condition: Condition.optional(),
    /** Partial variant data the store exposes directly (e.g. size options). */
    variant: Variant.optional(),
    /** Marketplace seller display name only. Never phone numbers or addresses. */
    sellerName: z.string().min(1).optional(),
    /** Seller location for classifieds (Jiji): "Lagos, Ikeja". */
    region: z.string().min(1).optional(),
    sponsored: z.boolean().default(false),
    /** Store-specific facts that don't have a column yet (rating, fulfilment flag...). */
    attributes: z.record(z.string(), z.json()).default({}),
  })
  .superRefine((listing, ctx) => {
    if (listing.priceKind === 'range' && listing.priceMaxKobo === undefined) {
      ctx.addIssue({ code: 'custom', path: ['priceMaxKobo'], message: 'required for range prices' });
    }
    if (listing.priceMaxKobo !== undefined && listing.priceMaxKobo < listing.priceKobo) {
      ctx.addIssue({ code: 'custom', path: ['priceMaxKobo'], message: 'must be >= priceKobo' });
    }
  });
export type RawListing = z.output<typeof RawListing>;
export type RawListingInput = z.input<typeof RawListing>;

// ---------------------------------------------------------------------------
// NormalizedListing: output of the normalization pipeline (04-normalization-matching.md).
// ---------------------------------------------------------------------------

export const NormalizedListing = RawListing.safeExtend({
  /** Cleaned title; the original stays in attributes.rawTitle. */
  title: z.string().min(1),
  condition: Condition,
  /** Picks the matching rules; 'other' until classified. */
  department: Department,
  /** Cheapa taxonomy leaf id ("dresses", "wigs", "phones"), null until classified. */
  category: z.string().min(1).nullable(),
  variant: Variant,
  /** 0..1 confidence of brand/model/variant extraction; < 0.6 may trigger the LLM fallback. */
  extractionConfidence: z.number().min(0).max(1),
});
export type NormalizedListing = z.output<typeof NormalizedListing>;
