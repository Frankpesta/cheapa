/**
 * WooCommerce platform adapter (docs/sources/platform-woocommerce.md): every store with
 * `stores.platform = 'woocommerce'`. Public, unauthenticated Store API only; robots.txt
 * is checked on every request by PoliteHttp.
 */
import type { JsonValue, ProductRef, SourceAdapter } from '../types.js';
import { lastPage, parseWoo, WOO_PAGE_SIZE } from './parse.js';

/** Hard cap: 200 × 100 = 20,000 products per store per sweep. */
const MAX_PAGES = 200;

export function productsUrl(origin: string, page: number): string {
  const url = new URL('/wp-json/wc/store/v1/products', origin);
  url.searchParams.set('per_page', String(WOO_PAGE_SIZE));
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

export const wooAdapter: SourceAdapter = {
  id: 'platform:woocommerce',
  kind: 'platform',
  platform: 'woocommerce',
  needsBrowser: false,

  /**
   * Page 1 answers with `x-wp-totalpages`: one ref per page. The currency check happens in
   * parse (the API names it on every product), so a non-naira store fails its first fetch.
   */
  async *discover(ctx, store) {
    const origin = `https://${store.domain}`;
    const first = await ctx.http.get(productsUrl(origin, 1), { accept: 'json', signal: ctx.signal });
    const pages = Math.min(lastPage(first.headers), MAX_PAGES);
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

  parse: parseWoo,
};
