/**
 * Jiji listing-API parser (docs/sources/jiji.md). Jiji is classifieds: user ads, haggle
 * prices, titles that are often shop names, so the image and category carry the match.
 * Pure: no I/O, no clock, so it runs unchanged against __fixtures__/.
 */
import { letterSize, type Audience, type Size } from '@cheapa/core';
import { createHash } from 'node:crypto';
import { ParseError } from '../errors.js';
import type { JsonValue, RawListingInput, RawPayload, StoreRef } from '../types.js';

const ADAPTER_ID = 'jiji';

/** The fields we read from one `adverts_list.adverts[]` entry. */
interface JijiAdvert {
  id: number;
  guid?: string;
  title: string;
  url: string;
  category_name?: string;
  category_slug?: string;
  price_obj?: { value?: number | null; view?: string; period?: string | null };
  attrs?: { name?: string | null; value?: string }[];
  images?: { url?: string }[];
  image_obj?: { url?: string };
  region_item_text?: string;
  user_id?: number;
  seller?: { user_name?: string };
  labels?: { type?: string }[];
  is_top?: boolean;
  is_boost?: boolean;
  as_top?: boolean;
}

interface JijiPage {
  adverts_list?: { adverts?: JijiAdvert[]; total_pages?: number; count?: number };
}

/** Jiji serves at most this many pages per category (page 1,001 redirects to page 1). */
export const JIJI_MAX_PAGES = 1000;

const asPage = (body: JsonValue) => body as unknown as JijiPage;

/** Page count, capped at Jiji's 1,000-page limit; 1 when absent. */
export function lastPage(body: JsonValue): number {
  const total = asPage(body).adverts_list?.total_pages;
  return typeof total === 'number' && total > 0 ? Math.min(Math.floor(total), JIJI_MAX_PAGES) : 1;
}

const attr = (ad: JijiAdvert, name: string) => ad.attrs?.find((a) => a.name === name)?.value;

const AUDIENCE: Record<string, Audience> = { "Women's": 'women', "Men's": 'men', Unisex: 'unisex' };

/** "XL, XXL, 3XL" / "One Size / No Size" / "39, 40" (shoes). */
export function parseSizeAttr(value: string | undefined, shoes: boolean): Size[] {
  if (!value) return [];
  if (/one size/i.test(value)) return [{ system: 'letter', value: 'One Size' }];
  const sizes: Size[] = [];
  for (const part of value.split(',').map((p) => p.trim())) {
    const letter = letterSize(part);
    if (letter) sizes.push({ system: 'letter', value: letter });
    else if (/^\d{2}(?:\.5)?$/.test(part)) sizes.push({ system: shoes ? 'EU' : 'numeric', value: part });
  }
  return sizes;
}

/**
 * Same seller + same cleaned title + same price = the same ad reposted (03 §3.4). Phase 05
 * adds the image phash to this key; until then it collapses exact reposts.
 */
export function repostKey(ad: JijiAdvert, priceKobo: number): string {
  const title = ad.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return createHash('sha1')
    .update(`${ad.user_id ?? ''}|${title}|${priceKobo}`)
    .digest('hex')
    .slice(0, 16);
}

function toListing(ad: JijiAdvert, pageUrl: string, path: readonly string[]): RawListingInput | null {
  const naira = ad.price_obj?.value;
  // "Contact for price", rentals and per-period prices can't be compared.
  if (!naira || naira <= 0 || ad.price_obj?.period) return null;
  const priceKobo = Math.round(naira * 100);
  const shoes = ad.category_slug === 'shoes';
  const sizes = parseSizeAttr(attr(ad, 'Size'), shoes);
  const gender = attr(ad, 'Gender');
  const audience = gender ? AUDIENCE[gender] : undefined;
  const image = ad.images?.[0]?.url ?? ad.image_obj?.url;
  const attributes: Record<string, JsonValue> = { repostKey: repostKey(ad, priceKobo) };
  if (ad.user_id !== undefined) attributes.sellerId = String(ad.user_id);
  if (ad.labels?.some((l) => l.type === 'id_verify')) attributes.verifiedSeller = true;
  if (ad.attrs?.some((a) => a.value === 'Bulk prices')) attributes.bulkPrices = true;
  return {
    externalId: String(ad.id),
    sourceUrl: new URL(ad.url, pageUrl).toString(),
    title: ad.title.trim(),
    priceKobo,
    inStock: true,
    ...(image ? { imageUrl: image } : {}),
    // The swept category's breadcrumb (ref.meta.path), else the ad's own category name.
    categoryPath: path.length > 0 ? [...path] : ad.category_name ? [ad.category_name] : [],
    ...(sizes.length > 0 || audience
      ? { variant: { ...(sizes.length > 0 ? { sizes } : {}), ...(audience ? { audience } : {}) } }
      : {}),
    ...(ad.seller?.user_name ? { sellerName: ad.seller.user_name.trim() } : {}),
    ...(ad.region_item_text ? { region: ad.region_item_text } : {}),
    // Paid "TOP" / boosted ads: labelled, never allowed to change result order (rule 7).
    sponsored: Boolean(ad.is_top || ad.is_boost || ad.as_top),
    attributes,
  };
}

export function parseJiji(raw: RawPayload, _store: StoreRef): RawListingInput[] {
  if (raw.format !== 'json') throw new ParseError(ADAPTER_ID, `expected json, got ${raw.format}`);
  const adverts = asPage(raw.body).adverts_list?.adverts;
  if (!Array.isArray(adverts))
    throw new ParseError(ADAPTER_ID, 'no adverts_list.adverts: API shape changed?');
  const meta = raw.ref.meta?.path;
  const path = Array.isArray(meta) ? meta.filter((p): p is string => typeof p === 'string') : [];
  const seen = new Set<string>();
  const listings: RawListingInput[] = [];
  for (const ad of adverts) {
    const listing = toListing(ad, raw.url, path);
    if (!listing) continue;
    // Reposts on the same page collapse to the first copy.
    const key = listing.attributes!.repostKey as string;
    if (seen.has(key)) continue;
    seen.add(key);
    listings.push(listing);
  }
  return listings;
}
