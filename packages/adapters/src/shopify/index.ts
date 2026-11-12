/**
 * Shopify platform adapter (docs/sources/platform-shopify.md): every store with
 * `stores.platform = 'shopify'`. Public storefront JSON only; robots.txt is checked on
 * every request by PoliteHttp.
 */
import { ParseError } from '../errors.js';
import type { JsonValue, ProductRef, SourceAdapter } from '../types.js';
import { lastPage, parseShopify, SHOPIFY_PAGE_SIZE } from './parse.js';

/** Hard cap: 200 × 250 = 50,000 products per store per sweep. */
const MAX_PAGES = 200;

interface ShopMeta {
  currency?: string;
  published_products_count?: number;
}

export function productsUrl(origin: string, page: number): string {
  const url = new URL('/products.json', origin);
  url.searchParams.set('limit', String(SHOPIFY_PAGE_SIZE));
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

export const shopifyAdapter: SourceAdapter = {
  id: 'platform:shopify',
  kind: 'platform',
  platform: 'shopify',
  needsBrowser: false,

  /**
   * `/meta.json` gives the store currency and product count: one request, then one ref
   * per 250 products. Stores not selling in naira are refused (09 §9.1).
   */
  async *discover(ctx, store) {
    const origin = `https://${store.domain}`;
    const res = await ctx.http.get(new URL('/meta.json', origin).toString(), {
      accept: 'json',
      signal: ctx.signal,
    });
    const meta = JSON.parse(res.body) as ShopMeta;
    if (meta.currency !== 'NGN') {
      throw new ParseError(
        'platform:shopify',
        `${store.domain} sells in ${meta.currency ?? 'unknown currency'}, not NGN`,
      );
    }
    const pages = Math.min(lastPage(meta.published_products_count ?? 0), MAX_PAGES);
    for (let page = 1; page <= pages && !ctx.signal.aborted; page += 1) {
      const ref: ProductRef = { kind: 'page', url: productsUrl(origin, page), meta: { page } };
      yield ref;
    }
  },

  async fetch(ctx, ref) {
    const res = await ctx.http.get(ref.url, { accept: 'json', signal: ctx.signal });
    return {
      ref,
      url: res.url,
      fetchedAt: new Date().toISOString(),
      format: 'json',
      body: JSON.parse(res.body) as JsonValue,
    };
  },

  parse: parseShopify,
};
