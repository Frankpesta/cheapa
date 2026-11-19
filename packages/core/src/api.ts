/**
 * HTTP contract shared by apps/api, apps/mobile and apps/web.
 * Shapes follow 05-visual-search.md 5.3 and 13-fashion-and-beauty.md 13.5.
 */
import { z } from 'zod';
import { Condition, Department, Kobo, PriceKind, Variant } from './types.js';

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const HealthCheck = z.object({ ok: z.boolean(), latencyMs: z.number(), error: z.string().optional() });
export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  checks: z.object({
    catalogDb: HealthCheck,
    usersDb: HealthCheck,
    redisQueue: HealthCheck,
    redisCache: HealthCheck,
  }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const SearchSource = z.enum(['camera', 'share', 'gallery', 'text', 'link']);
export type SearchSource = z.infer<typeof SearchSource>;

export const TextSearchRequest = z.object({
  query: z.string().trim().min(2).max(200),
  source: SearchSource.default('text'),
});
export type TextSearchRequest = z.infer<typeof TextSearchRequest>;

/** Multipart fields sent with the image file on POST /search/image. */
export const ImageSearchFields = z.object({
  source: SearchSource.exclude(['text']).default('gallery'),
  /** Re-search one detected item (needsConfirmation kind 'item', its itemIndex). */
  item: z.coerce.number().int().min(0).max(9).optional(),
});

export const ListingFlags = z.object({
  suspectLow: z.boolean().optional(),
  stale: z.boolean().optional(),
  live: z.boolean().optional(),
  sponsored: z.boolean().optional(),
});

export const SearchListing = z.object({
  listingId: z.uuid(),
  storeName: z.string(),
  storeTier: z.number().int().min(1).max(5),
  priceKobo: Kobo,
  priceKind: PriceKind,
  priceMaxKobo: Kobo.optional(),
  oldPriceKobo: Kobo.optional(),
  condition: Condition,
  inStock: z.boolean(),
  /** Sizes this listing offers (fashion), for the size filter. */
  sizes: z.array(z.string()).optional(),
  packCount: z.number().int().positive().optional(),
  lastSeenAt: z.iso.datetime(),
  /** Always the /go/:listingId redirect, never the store URL directly. */
  url: z.string(),
  flags: ListingFlags,
});
export type SearchListing = z.infer<typeof SearchListing>;

export const SearchProduct = z.object({
  productId: z.uuid(),
  slug: z.string(),
  title: z.string(),
  department: Department,
  repImageUrl: z.string().nullable(),
  cheapestNewKobo: Kobo.optional(),
  cheapestUsedKobo: Kobo.optional(),
  listingCount: z.number().int().nonnegative(),
  matchScore: z.number().min(0).max(1),
  listings: z.array(SearchListing),
});

export const Lookalike = z.object({
  productId: z.uuid(),
  slug: z.string(),
  title: z.string(),
  repImageUrl: z.string().nullable(),
  cheapestKobo: Kobo,
  priceKind: PriceKind,
  storeName: z.string(),
  listingCount: z.number().int().positive(),
  similarity: z.number().min(0).max(1),
  band: z.enum(['very_close', 'close']),
});

export const DetectedItem = z.object({
  kind: z.string(),
  /** Normalised [x, y, width, height] in 0..1. */
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  description: z.string(),
});

export const SearchResponse = z.object({
  requestId: z.string(),
  detected: z.object({
    brand: z.string().optional(),
    model: z.string().optional(),
    department: Department.optional(),
    category: z.string().optional(),
    variant: Variant.optional(),
    items: z.array(DetectedItem).optional(),
    confidence: z.number().min(0).max(1),
  }),
  needsConfirmation: z
    .object({
      kind: z.enum(['variant', 'item']),
      question: z.string(),
      options: z.array(
        z.object({ label: z.string(), productId: z.uuid().optional(), itemIndex: z.number().optional() }),
      ),
    })
    .optional(),
  /** Exact matches, best match first, cheapest first within a product. */
  products: z.array(SearchProduct),
  /** "Looks like this, for less": similarity band first, then price. */
  lookalikes: z.array(Lookalike),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const ProductResponse = z.object({
  productId: z.uuid(),
  slug: z.string(),
  title: z.string(),
  department: Department,
  category: z.string().nullable(),
  brand: z.string().nullable(),
  repImageUrl: z.string().nullable(),
  minPriceKobo: Kobo.nullable(),
  maxPriceKobo: Kobo.nullable(),
  /** Headline prices (04 §4.5): never one "cheapest" across new and used. */
  cheapestNewKobo: Kobo.nullable(),
  cheapestUsedKobo: Kobo.nullable(),
  listingCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
  /** Live listings (seen in the last 7 days, active stores): in stock first, then cheapest. */
  listings: z.array(SearchListing),
});
export type ProductResponse = z.infer<typeof ProductResponse>;

export const PriceHistoryQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export const PriceHistoryResponse = z.object({
  productId: z.uuid(),
  days: z.number().int(),
  /** Days (WAT) with an observation only, oldest first; clients carry the last value forward. */
  points: z.array(z.object({ day: z.iso.date(), minPriceKobo: Kobo })),
});
export type PriceHistoryResponse = z.infer<typeof PriceHistoryResponse>;

// ---------------------------------------------------------------------------
// Me (08-user-side.md 8.3)
// ---------------------------------------------------------------------------

export const MeUser = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  whatsappOptIn: z.boolean(),
  plan: z.enum(['free', 'premium']),
  role: z.enum(['user', 'admin']),
});

export const MeDevice = z.object({
  id: z.uuid(),
  anonId: z.uuid(),
  platform: z.enum(['android', 'ios', 'web']).nullable(),
  /** True once POST /me/link-device has attached it to a user. */
  linked: z.boolean(),
});

/** GET /me: the signed-in user and/or the calling device. At least one is present. */
export const MeResponse = z.object({ user: MeUser.nullable(), device: MeDevice.nullable() });
export type MeResponse = z.infer<typeof MeResponse>;

export const LinkDeviceResponse = z.object({ deviceId: z.uuid(), userId: z.uuid() });
export type LinkDeviceResponse = z.infer<typeof LinkDeviceResponse>;

// ---------------------------------------------------------------------------
// Search history (08-user-side.md 8.5) and outbound clicks (8.4)
// ---------------------------------------------------------------------------

export const SearchHistoryQuery = z.object({
  /** nextCursor from the previous page. */
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchHistoryQuery = z.infer<typeof SearchHistoryQuery>;

export const SearchHistoryItem = z.object({
  /** The search's requestId. */
  id: z.uuid(),
  source: SearchSource,
  /** The typed query, or the phrase read from the photo. */
  query: z.string().nullable(),
  imageSearch: z.boolean(),
  detected: SearchResponse.shape.detected.partial(),
  resultCount: z.number().int().nonnegative(),
  /** The best result, for the row's thumbnail and title; null if none or since removed. */
  topProduct: z
    .object({
      productId: z.uuid(),
      slug: z.string(),
      title: z.string(),
      repImageUrl: z.string().nullable(),
      /** Current headline prices, never merged into one figure (DESIGN.md §5 rule 5). */
      cheapestNewKobo: Kobo.nullable(),
      cheapestUsedKobo: Kobo.nullable(),
      listingCount: z.number().int().nonnegative(),
    })
    .nullable(),
  createdAt: z.iso.datetime(),
});
export type SearchHistoryItem = z.infer<typeof SearchHistoryItem>;

/** Newest first; the app groups rows by day (WAT). */
export const SearchHistoryResponse = z.object({
  items: z.array(SearchHistoryItem),
  nextCursor: z.string().nullable(),
});
export type SearchHistoryResponse = z.infer<typeof SearchHistoryResponse>;

/** GET /go/:listingId?s=<search requestId> */
export const GoQuery = z.object({ s: z.uuid().optional().catch(undefined) });
export type GoQuery = z.infer<typeof GoQuery>;

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/** Anonymous device id header (08-user-side.md 8.3). */
export const DEVICE_HEADER = 'x-cheapa-device';
/** Optional: 'android' | 'ios' | 'web', recorded on the device row. */
export const PLATFORM_HEADER = 'x-cheapa-platform';
/** Optional: app version string, recorded on the device row. */
export const APP_VERSION_HEADER = 'x-cheapa-app-version';
export const REQUEST_ID_HEADER = 'x-request-id';

// ---------------------------------------------------------------------------
// Admin: match review queue (04 §4.4)
// ---------------------------------------------------------------------------

/** The listing under review, as the store shows it. */
export const ReviewListing = z.object({
  listingId: z.uuid(),
  title: z.string(),
  brand: z.string().nullable(),
  department: Department,
  category: z.string().nullable(),
  condition: Condition,
  variant: Variant,
  priceKobo: Kobo,
  imageUrl: z.string().nullable(),
  storeName: z.string(),
  /** The store's page, so the reviewer can check the real item. */
  sourceUrl: z.string(),
});

/** The canonical product the matcher attached it to provisionally. */
export const ReviewCandidate = z.object({
  productId: z.uuid(),
  slug: z.string(),
  title: z.string(),
  brand: z.string().nullable(),
  department: Department,
  category: z.string().nullable(),
  variant: Variant,
  repImageUrl: z.string().nullable(),
  listingCount: z.number().int().nonnegative(),
  minPriceKobo: Kobo.nullable(),
});

export const ReviewItem = z.object({
  reviewId: z.uuid(),
  score: z.number(),
  createdAt: z.iso.datetime(),
  listing: ReviewListing,
  candidate: ReviewCandidate,
});
export type ReviewItem = z.infer<typeof ReviewItem>;

export const ReviewQueueQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

export const ReviewQueueResponse = z.object({
  items: z.array(ReviewItem),
  /** All undecided reviews, not just this page. */
  pending: z.number().int().nonnegative(),
});
export type ReviewQueueResponse = z.infer<typeof ReviewQueueResponse>;

/** Merge: same product. Split: a different product. Skip: decide later. */
export const ReviewDecisionRequest = z.object({ decision: z.enum(['merge', 'split', 'skip']) });
export type ReviewDecisionRequest = z.infer<typeof ReviewDecisionRequest>;

export const ReviewDecisionResponse = z.object({
  reviewId: z.uuid(),
  decision: z.enum(['merge', 'split', 'skip']),
  /** The product the listing belongs to after the decision. */
  productId: z.uuid(),
});
export type ReviewDecisionResponse = z.infer<typeof ReviewDecisionResponse>;
