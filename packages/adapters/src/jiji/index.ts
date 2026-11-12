/**
 * Jiji adapter (jiji.ng, classifieds). Source notes, endpoints and field mapping:
 * docs/sources/jiji.md.
 */
import type { JsonValue, ProductRef, SourceAdapter } from '../types.js';
import { JIJI_MAX_PAGES, lastPage, parseJiji } from './parse.js';

/**
 * Categories to sweep, women's fashion and beauty first (03 §3.4, 13 §13.8), with the
 * breadcrumb Jiji shows above them. Counts on 2026-11-12: ~6,000 pages, ~120,000 ads;
 * Jiji serves 1,000 pages (20,000 ads) per category at most, newest first.
 * Vehicles and property: never.
 */
export const CATEGORIES: readonly { slug: string; path: readonly string[] }[] = [
  { slug: 'clothing', path: ['Fashion', "Women's Fashion", "Women's Clothing"] },
  { slug: 'shoes', path: ['Fashion', "Women's Fashion", "Women's Shoes"] },
  { slug: 'bags', path: ['Fashion', "Women's Fashion", "Women's Bags"] },
  { slug: 'accessories', path: ['Fashion', "Women's Fashion", 'Clothing Accessories'] },
  { slug: 'wedding-wear', path: ['Fashion', "Women's Fashion", 'Wedding Wear & Accessories'] },
  { slug: 'jewellery-and-watches', path: ['Fashion', 'Jewelry'] },
  { slug: 'watches', path: ['Fashion', 'Watches'] },
  { slug: 'hair-beauty', path: ['Beauty & Personal Care', 'Hair'] },
  { slug: 'makeup', path: ['Beauty & Personal Care', 'Make-Up'] },
  { slug: 'skin-care', path: ['Beauty & Personal Care', 'Skin Care'] },
  { slug: 'fragrance', path: ['Beauty & Personal Care', 'Fragrance'] },
  { slug: 'bath-body', path: ['Beauty & Personal Care', 'Body Care'] },
];

/** The listing API the category pages call; robots.txt allows it for every agent. */
export function listingUrl(origin: string, slug: string, page: number): string {
  const url = new URL('/api_web/v1/listing', origin);
  url.searchParams.set('slug', slug);
  // Newest first: a stable order, so each sweep sees the freshest 20,000 ads per category.
  url.searchParams.set('sort', 'new');
  url.searchParams.set('webp', 'true');
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

export const jijiAdapter: SourceAdapter = {
  id: 'jiji',
  kind: 'custom',
  domains: ['jiji.ng'],
  needsBrowser: false,

  /** One request per category for its page count, then one ref per page. */
  async *discover(ctx, store) {
    const origin = `https://${store.domain}`;
    for (const { slug, path } of CATEGORIES) {
      const first = await ctx.http.get(listingUrl(origin, slug, 1), { accept: 'json', signal: ctx.signal });
      const pages = Math.min(lastPage(JSON.parse(first.body) as JsonValue), JIJI_MAX_PAGES);
      for (let page = 1; page <= pages && !ctx.signal.aborted; page += 1) {
        const ref: ProductRef = {
          kind: 'page',
          url: listingUrl(origin, slug, page),
          meta: { slug, page, path: [...path] },
        };
        yield ref;
      }
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

  parse: parseJiji,
};
