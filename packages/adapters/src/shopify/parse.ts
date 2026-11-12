/**
 * Shopify platform parser (docs/sources/platform-shopify.md): one adapter for every
 * Shopify store. Reads the public storefront `/products.json`. Pure: no I/O, no clock.
 */
import { nairaToKobo, type Size } from '@cheapa/core';
import { ParseError } from '../errors.js';
import { isColourOption, isSoftOption, sizesOf } from '../options.js';
import type { JsonValue, RawListingInput, RawPayload, StoreRef } from '../types.js';

const ADAPTER_ID = 'platform:shopify';

interface ShopifyVariant {
  id: number;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  available?: boolean;
  /** Naira as a decimal string in the store currency: "10000.00". */
  price: string;
  compare_at_price?: string | null;
  featured_image?: { src?: string } | null;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor?: string;
  product_type?: string;
  variants: ShopifyVariant[];
  images?: { src?: string }[];
  options?: { name: string; position?: number; values: string[] }[];
}

/** `/products.json` max page size. */
export const SHOPIFY_PAGE_SIZE = 250;

const optionValue = (v: ShopifyVariant, i: number) => [v.option1, v.option2, v.option3][i] ?? '';

function kobo(price: string | null | undefined): number | null {
  if (price === null || price === undefined || price === '') return null;
  const naira = Number(price);
  return Number.isFinite(naira) && naira > 0 ? nairaToKobo(naira) : null;
}

/** Vendor is a brand unless it's just the store's own name ("Shop Maju", "GARM ISLAND"). */
function brandOf(vendor: string | undefined, store: StoreRef): string | undefined {
  const v = vendor?.trim();
  if (!v) return undefined;
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const host = squash(store.domain.replace(/^www\./, '').split('.')[0] ?? '');
  const name = squash(store.name);
  const vs = squash(v);
  return vs === name || vs === host || name.includes(vs) || vs.includes(host) ? undefined : v;
}

function groupListing(
  product: ShopifyProduct,
  group: ShopifyVariant[],
  hardLabel: string,
  ctx: { store: StoreRef; soft: { index: number; name: string }[]; shoes: boolean; split: boolean },
): RawListingInput | null {
  const inStock = group.filter((v) => v.available !== false);
  const priced = (inStock.length > 0 ? inStock : group)
    .map((v) => ({ v, price: kobo(v.price) }))
    .filter((x): x is { v: ShopifyVariant; price: number } => x.price !== null);
  if (priced.length === 0) return null;
  const min = Math.min(...priced.map((x) => x.price));
  const max = Math.max(...priced.map((x) => x.price));
  const olds = priced
    .map((x) => kobo(x.v.compare_at_price))
    .filter((x): x is number => x !== null && x > min);
  const old = olds.length > 0 ? Math.min(...olds) : null;

  let sizes: Size[] = [];
  let colours: string[] = [];
  const soldOut: string[] = [];
  for (const { index, name } of ctx.soft) {
    const values = (all: ShopifyVariant[]) => [
      ...new Set(all.map((v) => optionValue(v, index)).filter(Boolean)),
    ];
    if (isColourOption(name)) colours = values(inStock.length > 0 ? inStock : group);
    else if (/size/i.test(name)) {
      sizes = sizesOf(values(inStock), ctx.shoes);
      const available = new Set(values(inStock));
      soldOut.push(...values(group).filter((v) => !available.has(v)));
    }
  }
  const first = group[0]!;
  const image = first.featured_image?.src ?? product.images?.[0]?.src;
  const url = new URL(`/products/${product.handle}`, `https://${ctx.store.domain}`);
  if (ctx.split) url.searchParams.set('variant', String(first.id));
  const brand = brandOf(product.vendor, ctx.store);
  const variant = {
    ...(sizes.length > 0 ? { sizes } : {}),
    ...(colours.length > 0 ? { colours } : {}),
  };
  const attributes: Record<string, JsonValue> = { productId: String(product.id) };
  if (soldOut.length > 0) attributes.soldOutSizes = soldOut;
  if (hardLabel) attributes.option = hardLabel;
  return {
    externalId: ctx.split ? `${product.id}:${first.id}` : String(product.id),
    sourceUrl: url.toString(),
    title: hardLabel ? `${product.title.trim()} - ${hardLabel}` : product.title.trim(),
    priceKobo: min,
    priceKind: min === max ? 'exact' : 'from',
    ...(old ? { oldPriceKobo: old } : {}),
    inStock: inStock.length > 0,
    ...(image ? { imageUrl: image.startsWith('//') ? `https:${image}` : image } : {}),
    ...(brand ? { brand } : {}),
    categoryPath: product.product_type?.trim() ? [product.product_type.trim()] : [],
    ...(Object.keys(variant).length > 0 ? { variant } : {}),
    attributes,
  };
}

/**
 * One listing per product, keeping size and colour as soft options. Products whose options
 * include a hard attribute (Type, Shade, Length, Volume...) become one listing per distinct
 * hard value, priced from their own variants (13 §13.4).
 */
export function productListings(product: ShopifyProduct, store: StoreRef): RawListingInput[] {
  if (!Array.isArray(product.variants) || product.variants.length === 0) return [];
  const options = product.options ?? [];
  const shoes = /shoe|heel|sandal|sneaker|slipper|boot/i.test(
    `${product.product_type ?? ''} ${product.title}`,
  );
  const soft: { index: number; name: string }[] = [];
  const hard: number[] = [];
  options.slice(0, 3).forEach((o, index) => {
    // "Size: 50ml / 100ml" fails the soft-size test and lands here, as it should.
    if (isSoftOption(o.name, o.values, shoes)) soft.push({ index, name: o.name });
    else hard.push(index);
  });
  const groups = new Map<string, ShopifyVariant[]>();
  for (const v of product.variants) {
    const key = hard
      .map((i) => optionValue(v, i))
      .filter(Boolean)
      .join(' / ');
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  const split = hard.length > 0 && groups.size > 1;
  return [...groups.entries()]
    .map(([label, group]) => groupListing(product, group, split ? label : '', { store, soft, shoes, split }))
    .filter((l): l is RawListingInput => l !== null);
}

export function lastPage(productCount: number): number {
  return Math.max(1, Math.ceil(productCount / SHOPIFY_PAGE_SIZE));
}

export function parseShopify(raw: RawPayload, store: StoreRef): RawListingInput[] {
  if (raw.format !== 'json') throw new ParseError(ADAPTER_ID, `expected json, got ${raw.format}`);
  const products = (raw.body as { products?: unknown } | null)?.products;
  if (!Array.isArray(products))
    throw new ParseError(ADAPTER_ID, 'no products array: /products.json disabled?');
  return (products as ShopifyProduct[]).flatMap((p) => productListings(p, store));
}
