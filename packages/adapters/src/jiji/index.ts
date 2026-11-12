/**
 * Jiji adapter (jiji.ng, classifieds). Source notes, endpoints and field mapping:
 * docs/sources/jiji.md.
 */
import type { JsonValue, ProductRef, SourceAdapter } from '../types.js';
import { CATEGORIES } from './categories.js';
import { JIJI_MAX_PAGES, lastPage, parseJiji, parseJijiSearch } from './parse.js';

export { CATEGORIES } from './categories.js';

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

/** Jiji's own search, through the same listing API (robots.txt allows `query` for all agents). */
export function searchUrl(origin: string, query: string): string {
  const url = new URL('/api_web/v1/listing', origin);
  url.searchParams.set('query', query);
  url.searchParams.set('webp', 'true');
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

  /**
   * Query-time search for low-confidence results (03 §3.6): one request, Jiji's relevance
   * order, only ads in categories we sweep. The caller caps calls and caches results.
   */
  async liveSearch(ctx, store, query, limit) {
    const url = searchUrl(`https://${store.domain}`, query);
    const res = await ctx.http.get(url, { accept: 'json', signal: ctx.signal });
    const body = JSON.parse(res.body) as JsonValue;
    const raw = {
      ref: { kind: 'page' as const, url },
      url: res.url,
      fetchedAt: new Date().toISOString(),
      format: 'json' as const,
      body,
    };
    return parseJijiSearch(raw).slice(0, limit);
  },
};
