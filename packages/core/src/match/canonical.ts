/**
 * New canonical products (04 §4.2, 13 §13.4): one per brand + model + exact hard variant.
 * The slug reads like the product ("apple-iphone-15-pro-256gb", "fenty-gloss-bomb-9ml")
 * and ends in a short hash of the founding listing so two dresses with the same words
 * never collide.
 */
import { createHash } from 'node:crypto';
import type { Department, Variant } from '../types.js';
import { hardVariant } from './rules.js';

export interface ProductSeed {
  /** The listing that founds the product (its id makes the slug unique and stable). */
  listingId: string;
  title: string;
  department: Department;
  category: string | null;
  brand?: string | null | undefined;
  model?: string | null | undefined;
  modelNumber?: string | null | undefined;
  gtin?: string | null | undefined;
  variant: Variant;
  imageUrl?: string | null | undefined;
}

export interface NewProduct {
  slug: string;
  title: string;
  department: Department;
  category: string | null;
  brand: string | null;
  model: string | null;
  modelNumber: string | null;
  gtin: string | null;
  variant: Variant;
  repImageUrl: string | null;
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "256gb", "8gb-ram", "50ml", "2-pack", "20in": the hard variant, readable. */
function variantWords(v: Variant): string[] {
  const words: string[] = [];
  if (v.storageGb) words.push(v.storageGb >= 1024 ? `${v.storageGb / 1024}tb` : `${v.storageGb}gb`);
  if (v.ramGb) words.push(`${v.ramGb}gb-ram`);
  if (v.netContent) words.push(`${v.netContent.value}${v.netContent.unit.replace('_', '')}`);
  if (v.shade) words.push(v.shade);
  if (v.hair?.lengthInches) words.push(`${v.hair.lengthInches}in`);
  if (v.packCount && v.packCount > 1) words.push(`${v.packCount}-pack`);
  return words;
}

export function newProduct(seed: ProductSeed): NewProduct {
  const variant = hardVariant(seed.department, seed.variant);
  const named = seed.brand && seed.model ? `${seed.brand} ${seed.model}` : seed.title;
  const base = slugify([named, ...variantWords(variant)].join(' '))
    .slice(0, 80)
    .replace(/-+$/, '');
  const suffix = createHash('sha1').update(seed.listingId).digest('hex').slice(0, 6);
  return {
    slug: `${base || 'product'}-${suffix}`,
    title: seed.title,
    department: seed.department,
    category: seed.category,
    brand: seed.brand ?? null,
    model: seed.model ?? null,
    modelNumber: seed.modelNumber ?? null,
    gtin: seed.gtin ?? null,
    variant,
    repImageUrl: seed.imageUrl ?? null,
  };
}
