/**
 * Builds the image-model benchmark set from public Jiji ads (05 §5.1): ads with two or
 * more photos give "same product, different photo" pairs. Only URLs and ad ids are kept
 * (in a manifest); image bytes live in memory for one run and are never written.
 */
import type { PoliteHttp } from '@cheapa/adapters';
import { z } from 'zod';

export const JIJI_ORIGIN = 'https://jiji.ng';

/** Fashion and beauty categories used, with the zero-shot prompt for each. */
export const BENCH_CATEGORIES: Record<string, string> = {
  clothing: "women's clothing",
  shoes: "women's shoes",
  bags: 'a handbag',
  'jewellery-and-watches': 'jewellery',
  'hair-beauty': 'a wig or hair extensions',
  makeup: 'makeup',
  'skin-care': 'skin care products',
  fragrance: 'a bottle of perfume',
};

export const ManifestAd = z.object({
  id: z.string(),
  category: z.string(),
  title: z.string(),
  images: z.array(z.url()).min(2),
});
export type ManifestAd = z.infer<typeof ManifestAd>;
export const Manifest = z.object({ builtAt: z.iso.datetime(), ads: z.array(ManifestAd) });
export type Manifest = z.infer<typeof Manifest>;

const ListPage = z.object({
  adverts_list: z.object({
    adverts: z.array(
      z.object({
        guid: z.string(),
        url: z.string(),
        title: z.string(),
        count_images: z.number().nullish(),
      }),
    ),
  }),
});

/** Gallery thumbnails on an ad page (`.qa-carousel-thumbnail` webp sources), in order. */
export function galleryUrls(html: string): string[] {
  const urls: string[] = [];
  const re = /qa-carousel-thumbnail[^"]*"[\s\S]*?<source type="image\/webp" srcset="([^"\s]+)/g;
  for (const m of html.matchAll(re)) {
    const url = m[1]?.replaceAll('&amp;', '&');
    if (url && url.startsWith('https://') && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

export interface BuildOptions {
  http: PoliteHttp;
  perCategory: number;
  /** Photos kept per ad (first is the query, the rest go in the index). */
  maxImages: number;
  log(msg: string): void;
}

/** Walks newest-first list pages per category and reads galleries of multi-photo ads. */
export async function buildManifest(opts: BuildOptions): Promise<Manifest> {
  const ads: ManifestAd[] = [];
  for (const category of Object.keys(BENCH_CATEGORIES)) {
    const found: ManifestAd[] = [];
    for (let page = 1; found.length < opts.perCategory && page <= 10; page += 1) {
      const url = `${JIJI_ORIGIN}/api_web/v1/listing?slug=${category}&sort=new&webp=true&page=${page}`;
      const list = ListPage.parse(JSON.parse((await opts.http.get(url, { accept: 'json' })).body));
      for (const ad of list.adverts_list.adverts) {
        if (found.length >= opts.perCategory) break;
        if ((ad.count_images ?? 0) < 2 || ads.some((a) => a.id === ad.guid)) continue;
        const html = (await opts.http.get(JIJI_ORIGIN + ad.url, { accept: 'html' })).body;
        const images = galleryUrls(html).slice(0, opts.maxImages);
        if (images.length >= 2) found.push({ id: ad.guid, category, title: ad.title, images });
      }
    }
    opts.log(`${category}: ${found.length} ads`);
    ads.push(...found);
  }
  return { builtAt: new Date().toISOString(), ads };
}
