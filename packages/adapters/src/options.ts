/**
 * Product options as stores name them, shared by adapters (Jumia simples, Shopify and
 * WooCommerce options). Sizes and colours are SOFT: they stay on one listing. Anything
 * else (shade, length, volume, pack, type) is HARD and may mean a different product
 * (13-fashion-and-beauty.md 13.4).
 */
import { letterSize, type Size } from '@cheapa/core';

/**
 * One size value: "EU 38", "US 8.5", "EU L", "CH XL", "M/L", "ONE SIZE FITS ALL", "34",
 * "UK 12". Colours, lengths ("12 inches"), volumes ("50ml") and junk are not sizes.
 */
const WORD_SIZES: Record<string, string> = {
  'extra small': 'XS',
  'x-small': 'XS',
  small: 'S',
  medium: 'M',
  large: 'L',
  'extra large': 'XL',
  'x-large': 'XL',
  'xx-large': '2XL',
  'xxx-large': '3XL',
};

export function optionSizes(name: string, shoes: boolean): Size[] {
  const n = name.trim();
  const word = WORD_SIZES[n.toLowerCase().replace(/\s+/g, ' ')];
  if (word) return [{ system: 'letter', value: word }];
  if (/^one[\s-]?size|^free[\s-]?size/i.test(n)) return [{ system: 'letter', value: 'One Size' }];
  const system = /^(EU|UK|US)\s*(\d{1,2}(?:\.5)?)$/i.exec(n);
  if (system) return [{ system: system[1]!.toUpperCase() as 'EU' | 'UK' | 'US', value: system[2]! }];
  const letters = n
    .replace(/^(?:EU|CH|UK|US)\s+/i, '')
    .split('/')
    .map((part) => letterSize(part.trim()));
  if (letters.length > 0 && letters.every(Boolean)) {
    return letters.map((value) => ({ system: 'letter' as const, value: value! }));
  }
  // UK dress sizes ("8", "10", "12"), ring sizes ("7"), waist ("32"), EU shoes ("39").
  // "0" and "00" are seller junk (seen on Jumia wigs), not sizes.
  if (/^(?:[1-9]|\d{2})(?:\.5)?$/.test(n) && Number(n) > 0) {
    return [{ system: shoes && Number(n) >= 30 ? 'EU' : 'numeric', value: n }];
  }
  return [];
}

export const isColourOption = (name: string) => /^(?:colou?rs?|shade of colou?r)$/i.test(name.trim());
export const isTitleOption = (name: string) => /^title$/i.test(name.trim());
const isSizeName = (name: string) => /^(?:sizes?|shoe size|dress size|uk size|eu size)$/i.test(name.trim());

/**
 * A size option is soft only when its values really are garment or shoe sizes: a beauty
 * store's "Size: 50ml / 100ml" is a different product per value.
 */
export function isSoftSizeOption(name: string, values: readonly string[], shoes = false): boolean {
  return isSizeName(name) && values.length > 0 && values.every((v) => optionSizes(v, shoes).length > 0);
}

export function isSoftOption(name: string, values: readonly string[], shoes = false): boolean {
  return isTitleOption(name) || isColourOption(name) || isSoftSizeOption(name, values, shoes);
}

/** Distinct sizes across option values, in order. */
export function sizesOf(values: readonly string[], shoes: boolean): Size[] {
  const out: Size[] = [];
  for (const v of values) {
    for (const s of optionSizes(v, shoes)) {
      if (!out.some((x) => x.system === s.system && x.value === s.value)) out.push(s);
    }
  }
  return out;
}
