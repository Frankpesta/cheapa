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

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c.path]));

/** Breadcrumb for a swept category slug; undefined for categories we never crawl. */
export function categoryPath(slug: string | undefined): readonly string[] | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}
