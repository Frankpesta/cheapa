/**
 * Jumia listing-page parser (docs/sources/jumia.md). Category pages embed their product
 * cards as JSON in `window.__STORE__`; we read that instead of the HTML cards. Pure: no
 * I/O, no clock, so it runs unchanged against __fixtures__/.
 */
import { letterSize, parsePrice, type ParsedPrice, type Size } from '@cheapa/core';
import { ParseError } from '../errors.js';
import type { JsonValue, RawListingInput, RawPayload, StoreRef } from '../types.js';

const ADAPTER_ID = 'jumia';
const STORE_MARKER = 'window.__STORE__=';

/** The fields we read from one `__STORE__.products[]` entry (docs/sources/jumia.md). */
interface JumiaOption {
  name?: string;
  isBuyable?: boolean;
  prices?: { price?: string };
}
export interface JumiaProduct {
  sku: string;
  name: string;
  displayName?: string;
  brand?: string;
  categories?: string[];
  prices: { price: string; oldPrice?: string };
  displayPrices?: { price?: string };
  image?: string;
  images?: { img?: string }[];
  url: string;
  isBuyable?: boolean;
  isSponsored?: boolean;
  isShopExpress?: boolean;
  sellerId?: number | string;
  rating?: { average?: number; totalRatings?: number };
  badges?: { main?: { identifier?: string }; campaign?: { name?: string } };
  simples?: JumiaOption[];
}

/** The embedded state object, or a ParseError when the page no longer carries it. */
export function readStore(html: string): { products: JumiaProduct[] } {
  const start = html.indexOf(STORE_MARKER);
  if (start < 0) throw new ParseError(ADAPTER_ID, 'window.__STORE__ not found: page layout changed?');
  const end = html.indexOf(';</script>', start);
  let store: unknown;
  try {
    store = JSON.parse(html.slice(start + STORE_MARKER.length, end < 0 ? undefined : end));
  } catch (cause) {
    throw new ParseError(ADAPTER_ID, 'window.__STORE__ is not valid JSON', { cause });
  }
  const products = (store as { products?: unknown }).products;
  if (!Array.isArray(products)) throw new ParseError(ADAPTER_ID, '__STORE__.products missing');
  return { products: products as JumiaProduct[] };
}

/** Page count from the "Last Page" pagination link; 1 when the category fits on one page. */
export function lastPage(html: string): number {
  const link = /<a[^>]*aria-label="Last Page"[^>]*>/.exec(html)?.[0];
  const page = link ? /[?&]page=(\d+)/.exec(link)?.[1] : undefined;
  return page ? Number(page) : 1;
}

/**
 * One size option as Jumia sellers name it: "EU 38", "US 8.5", "EU L", "CH XL", "M/L",
 * "ONE SIZE FITS ALL", "34". Colours, lengths and junk ("Black", "12 inches") are not sizes.
 */
export function optionSizes(name: string, shoes: boolean): Size[] {
  const n = name.trim();
  if (/^one[\s-]?size/i.test(n)) return [{ system: 'letter', value: 'One Size' }];
  const system = /^(EU|UK|US)\s*(\d{1,2}(?:\.5)?)$/i.exec(n);
  if (system) return [{ system: system[1]!.toUpperCase() as 'EU' | 'UK' | 'US', value: system[2]! }];
  const letters = n
    .replace(/^(?:EU|CH|UK|US)\s+/i, '')
    .split('/')
    .map((part) => letterSize(part.trim()));
  if (letters.length > 0 && letters.every(Boolean)) {
    return letters.map((value) => ({ system: 'letter' as const, value: value! }));
  }
  if (/^\d{2}$/.test(n)) return [{ system: shoes && Number(n) >= 30 ? 'EU' : 'numeric', value: n }];
  return [];
}

function sizesOf(product: JumiaProduct): { sizes: Size[]; soldOut: string[] } {
  const shoes = (product.categories ?? []).some((c) => /shoes|footwear|heels|sandals|sneakers/i.test(c));
  const sizes: Size[] = [];
  const soldOut: string[] = [];
  for (const option of product.simples ?? []) {
    const found = optionSizes(option.name ?? '', shoes);
    if (option.isBuyable === false) {
      soldOut.push(...found.map((s) => s.value));
      continue;
    }
    for (const s of found) {
      if (!sizes.some((x) => x.system === s.system && x.value === s.value)) sizes.push(s);
    }
  }
  return { sizes, soldOut };
}

function attributesOf(p: JumiaProduct, soldOut: string[]): Record<string, JsonValue> {
  const attrs: Record<string, JsonValue> = {};
  if (p.sellerId !== undefined) attrs.sellerId = String(p.sellerId);
  if (p.isShopExpress) attrs.jumiaExpress = true;
  if (p.badges?.main?.identifier === 'JMALL') attrs.officialStore = true;
  if (p.badges?.campaign?.name) attrs.campaign = p.badges.campaign.name;
  if (p.rating?.totalRatings) {
    attrs.rating = p.rating.average ?? null;
    attrs.ratingCount = p.rating.totalRatings;
  }
  if (soldOut.length > 0) attrs.soldOutSizes = soldOut;
  return attrs;
}

/**
 * The price a shopper can pay now. With per-size prices, only sizes still in stock count:
 * a "From ₦ 4,440" whose cheapest size sold out is not a real price (13-fashion 13.2).
 */
export function currentPrice(p: JumiaProduct): ParsedPrice | null {
  const inStock = (p.simples ?? [])
    .filter((o) => o.isBuyable !== false && o.prices?.price)
    .map((o) => parsePrice(o.prices!.price!))
    .filter((x): x is ParsedPrice => x !== null);
  if (inStock.length > 0) {
    const min = Math.min(...inStock.map((x) => x.minKobo));
    const max = Math.max(...inStock.map((x) => x.maxKobo ?? x.minKobo));
    return min === max
      ? { kind: 'exact', minKobo: min, maxKobo: min }
      : { kind: 'from', minKobo: min, maxKobo: null };
  }
  // "From ₦ 6,850" for multi-size items; the plain price otherwise.
  return parsePrice(p.displayPrices?.price ?? p.prices.price) ?? parsePrice(p.prices.price);
}

function toListing(p: JumiaProduct, pageUrl: string): RawListingInput | null {
  const price = currentPrice(p);
  if (!price || !p.sku || !p.url) return null;
  const old = p.prices.oldPrice ? parsePrice(p.prices.oldPrice) : null;
  const { sizes, soldOut } = sizesOf(p);
  const options = p.simples ?? [];
  const anyOptionBuyable = options.length === 0 || options.some((o) => o.isBuyable !== false);
  const image = p.images?.[0]?.img ?? p.image;
  return {
    externalId: p.sku,
    sourceUrl: new URL(p.url, pageUrl).toString(),
    title: (p.displayName ?? p.name).trim(),
    priceKobo: price.minKobo,
    priceKind: price.kind,
    ...(price.kind === 'range' && price.maxKobo ? { priceMaxKobo: price.maxKobo } : {}),
    ...(old && old.minKobo > price.minKobo ? { oldPriceKobo: old.minKobo } : {}),
    inStock: p.isBuyable !== false && anyOptionBuyable,
    ...(image ? { imageUrl: image } : {}),
    ...(p.brand ? { brand: p.brand } : {}),
    categoryPath: (p.categories ?? []).filter((c) => c.trim().length > 0),
    ...(sizes.length > 0 ? { variant: { sizes } } : {}),
    sponsored: p.isSponsored === true,
    attributes: attributesOf(p, soldOut),
  };
}

export function parseJumia(raw: RawPayload, _store: StoreRef): RawListingInput[] {
  if (raw.format !== 'html') throw new ParseError(ADAPTER_ID, `expected html, got ${raw.format}`);
  // An empty category is valid (no products); a missing __STORE__ is not.
  return readStore(raw.body)
    .products.map((p) => toListing(p, raw.url))
    .filter((l): l is RawListingInput => l !== null);
}
