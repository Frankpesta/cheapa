/**
 * WooCommerce platform parser (docs/sources/platform-woocommerce.md): one adapter for
 * every WooCommerce store, via the public Store API (`/wp-json/wc/store/v1/products`).
 * Pure: no I/O, no clock.
 */
import { minorUnitsToKobo } from '@cheapa/core';
import { ParseError } from '../errors.js';
import { isColourOption, isSoftSizeOption, sizesOf } from '../options.js';
import type { JsonValue, RawListingInput, RawPayload, StoreRef } from '../types.js';

const ADAPTER_ID = 'platform:woocommerce';

interface WooPrices {
  /** Minor units of `currency_code`, as a string: "200000" with unit 2 = ₦2,000. */
  price: string;
  regular_price?: string;
  price_range?: { min_amount?: string; max_amount?: string } | null;
  currency_code: string;
  currency_minor_unit: number;
}

export interface WooProduct {
  id: number;
  name: string;
  permalink: string;
  type?: string;
  prices: WooPrices;
  is_in_stock?: boolean;
  is_purchasable?: boolean;
  images?: { src?: string }[];
  categories?: { name?: string }[];
  brands?: { name?: string }[];
  attributes?: { name: string; has_variations?: boolean; terms?: { name: string }[] }[];
}

/** Store API max page size. */
export const WOO_PAGE_SIZE = 100;

/** HTML entities WordPress leaves in names ("Tops &amp; Jackets", "&#8211;"). */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#?apos;|&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function kobo(amount: string | undefined, unit: number): number | null {
  if (amount === undefined || amount === '' || !/^\d+$/.test(amount)) return null;
  const k = minorUnitsToKobo(amount, unit);
  return k > 0 ? k : null;
}

function toListing(p: WooProduct): RawListingInput | null {
  const unit = p.prices.currency_minor_unit;
  const min = kobo(p.prices.price_range?.min_amount, unit) ?? kobo(p.prices.price, unit);
  if (min === null || p.is_purchasable === false) return null;
  const max = kobo(p.prices.price_range?.max_amount, unit) ?? min;
  const regular = kobo(p.prices.regular_price, unit);

  const shoes = (p.categories ?? []).some((c) => /shoe|heel|sandal|sneaker|slipper|boot/i.test(c.name ?? ''));
  const variant: { sizes?: ReturnType<typeof sizesOf>; colours?: string[] } = {};
  const options: Record<string, JsonValue> = {};
  for (const a of p.attributes ?? []) {
    const name = decodeEntities(a.name);
    const values = (a.terms ?? []).map((t) => decodeEntities(t.name));
    if (values.length === 0) continue;
    if (isSoftSizeOption(name, values, shoes)) variant.sizes = sizesOf(values, shoes);
    else if (isColourOption(name)) variant.colours = values;
    // Hard options (length, lace, shade, volume) are listed; per-variation listings need
    // one Store API call per variation (BACKLOG).
    else options[name] = values;
  }
  const brand = p.brands?.[0]?.name ? decodeEntities(p.brands[0].name) : undefined;
  return {
    externalId: String(p.id),
    sourceUrl: p.permalink,
    title: decodeEntities(p.name).trim(),
    priceKobo: min,
    priceKind: max > min ? 'from' : 'exact',
    ...(regular && regular > min && max === min ? { oldPriceKobo: regular } : {}),
    inStock: p.is_in_stock !== false,
    ...(p.images?.[0]?.src ? { imageUrl: p.images[0].src } : {}),
    ...(brand ? { brand } : {}),
    categoryPath: (p.categories ?? []).map((c) => decodeEntities(c.name ?? '')).filter(Boolean),
    ...(Object.keys(variant).length > 0 ? { variant } : {}),
    attributes: Object.keys(options).length > 0 ? { options } : {},
  };
}

/** Page count from the `x-wp-totalpages` response header; 1 when absent. */
export function lastPage(headers: Record<string, string>): number {
  const n = Number(headers['x-wp-totalpages']);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function parseWoo(raw: RawPayload, _store: StoreRef): RawListingInput[] {
  if (raw.format !== 'json') throw new ParseError(ADAPTER_ID, `expected json, got ${raw.format}`);
  if (!Array.isArray(raw.body))
    throw new ParseError(ADAPTER_ID, 'expected a product array: Store API disabled?');
  const products = raw.body as unknown as WooProduct[];
  // 09 §9.1: only stores pricing in naira. A currency switcher can make the API answer in USD.
  const foreign = products.find((p) => p.prices?.currency_code !== 'NGN');
  if (foreign) {
    throw new ParseError(
      ADAPTER_ID,
      `prices are in ${foreign.prices?.currency_code ?? 'an unknown currency'}, not NGN`,
    );
  }
  return products.map(toListing).filter((l): l is RawListingInput => l !== null);
}
