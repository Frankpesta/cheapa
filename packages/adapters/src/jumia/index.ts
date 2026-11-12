/**
 * Jumia adapter (www.jumia.com.ng). Source notes, endpoints and field mapping:
 * docs/sources/jumia.md. Not live until it is added to `allAdapters` in ../all.ts.
 */
import type { ProductRef, SourceAdapter } from '../types.js';
import { lastPage, parseJumia } from './parse.js';

/**
 * Category pages to sweep, women's fashion and beauty first (13-fashion-and-beauty.md
 * 13.8). Each lists 40 products a page and stops at page 50, so broad categories are
 * walked through their narrower children. All verified in categories-sitemap.xml.gz
 * and by page count on 2026-11-12 (~1,100 pages, ~44,000 products a sweep); a renamed category shows up as a ParseError in the crawl report.
 */
export const START_PATHS: readonly string[] = [
  // Clothing
  '/womens-dresses/',
  '/womens-tops-tees/',
  '/womens-clothing-two-piece-suits/',
  '/womens-skirts/',
  '/womens-jeans/',
  '/womens-jumpsuits-rompers/',
  '/womens-lingerie/',
  '/womens-lingerie-sleep-lounge/',
  '/womens-clothing-swimwear/',
  // Shoes
  '/womens-high-heels/',
  '/womens-mid-low-heels/',
  '/womens-heeled-sandals/',
  '/womens-flats/',
  '/womens-sandals-slippers/',
  '/womens-sneakers/',
  '/womens-boots/',
  // Bags
  '/womens-top-handle-bags/',
  '/womens-shoulder-bags/',
  '/womens-cross-body-bags/',
  '/womens-clutches/',
  '/womens-wallets/',
  // Jewellery, watches, accessories
  '/womens-earrings/',
  // Necklaces, chains, pendants (womens-necklaces itself is a near-empty duplicate)
  '/womens-jewelry-fashion-d/',
  '/womens-bracelets/',
  '/womens-anklets/',
  '/womens-rings/',
  '/womens-jewelry-sets/',
  '/women-watches/',
  '/womens-sunglasses/',
  // Hair
  '/womens-fashion-wigs/',
  '/hair-extensions-d/',
  '/hair-accessories-d/',
  // Beauty
  // Parent categories: the narrower ones (lipstick-makeup...) hold one or two products.
  '/lips-make-up/',
  '/face-foundation-makeup/',
  '/eyes-makeup/',
  '/makeup-sets-makeup/',
  '/nail-makeup/',
  '/face-moisturizers/',
  '/skin-care-serums/',
  '/beauty-skin-care-sunscreens/',
  '/skin-care-lotions/',
  '/womens-fragrances/',
];
/** Query parameter that selects the page number. */
const PAGE_PARAM = 'page';
/** Jumia stops paging at 50; also our hard cap per category. */
const MAX_PAGES = 50;

function pageUrl(origin: string, path: string, page: number): string {
  const url = new URL(path, origin);
  if (page > 1) url.searchParams.set(PAGE_PARAM, String(page));
  return url.toString();
}

export const jumiaAdapter: SourceAdapter = {
  id: 'jumia',
  kind: 'custom',
  domains: ['www.jumia.com.ng'],
  needsBrowser: false,

  /**
   * One request per category to read the page count from its "Last Page" link, then one
   * ref per page (page 1 is fetched again by its fetch job; ~40 extra requests a sweep).
   * Never adds sort, filter or search parameters: robots.txt disallows them.
   */
  async *discover(ctx, store) {
    const origin = `https://${store.domain}`;
    for (const path of START_PATHS) {
      const first = await ctx.http.get(pageUrl(origin, path, 1), { accept: 'html', signal: ctx.signal });
      const pages = Math.min(lastPage(first.body), MAX_PAGES);
      for (let page = 1; page <= pages && !ctx.signal.aborted; page += 1) {
        const ref: ProductRef = { kind: 'page', url: pageUrl(origin, path, page), meta: { page } };
        yield ref;
      }
    }
  },

  async fetch(ctx, ref) {
    const res = await ctx.http.get(ref.url, { accept: 'html', signal: ctx.signal });
    return {
      ref,
      url: res.url,
      fetchedAt: new Date().toISOString(),
      format: 'html',
      body: res.body,
    };
  },

  parse: parseJumia,
};
