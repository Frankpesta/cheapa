/**
 * Size runs from titles (13-fashion-and-beauty.md 13.2): "Sizes S-XXXL", "M-5XL",
 * "Big Size 39-46", "UK 6", "Free Size", "W32". Ranges are expanded so a filter for
 * "XL" finds an "S-XXXL" listing.
 */
import type { Department, Size } from '../types.js';

const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL'] as const;

/** "XXL" -> "2XL", "xxxl" -> "3XL", "xl" -> "XL"; null when not a letter size. */
export function letterSize(token: string): string | null {
  const t = token.toUpperCase().replace(/\s+/g, '');
  if ((LETTERS as readonly string[]).includes(t)) return t;
  const xs = /^(X{2,7})(S|L)$/.exec(t);
  if (xs) return xs[2] === 'L' ? `${xs[1]!.length}XL` : xs[1]!.length === 2 ? 'XXS' : null;
  const n = /^([2-7])X(S|L)?$/.exec(t);
  if (n) return n[2] === 'S' ? null : `${n[1]}XL`;
  return null;
}

function letterRange(from: string, to: string): string[] {
  const a = LETTERS.indexOf(from as (typeof LETTERS)[number]);
  const b = LETTERS.indexOf(to as (typeof LETTERS)[number]);
  return a >= 0 && b > a ? LETTERS.slice(a, b + 1) : [];
}

const LETTER_TOKEN = String.raw`(?:[2-7]?X{0,7}[SML]|[2-7]X)`;
const LETTER_RANGE = new RegExp(
  String.raw`(?<![\w-])(${LETTER_TOKEN})\s*(?:-|–|to)\s*(${LETTER_TOKEN})(?![\w-])`,
  'gi',
);
/** Standalone letter sizes that can't be mistaken for words ("XL", "2XL"); "S/M/L" need "size" before them. */
const BARE_LETTER = /(?<![\w-])((?:[2-7]X|X{1,7})[SL]|[2-7]X)(?![\w-])/gi;
const SIZE_LABEL = new RegExp(
  String.raw`\bsizes?\s*:?\s*(${LETTER_TOKEN}(?:\s*[/,]\s*${LETTER_TOKEN})*)(?![\w-])`,
  'gi',
);
const ONE_SIZE = /\b(?:free|one)[- ]?size\b/i;

/** Shoe sizes: "Size 36-41", "39 - 46", "EU 38", "UK 6", "US 8". */
const SYSTEM_SIZE = /\b(EU|UK|US)\s*:?\s*(\d{1,2}(?:\.5)?)(?:\s*(?:-|–|to)\s*(\d{1,2}(?:\.5)?))?\b/gi;
const SHOE_RANGE = /\b(?:size[sd]?\s*:?\s*)?(3\d|4[0-8])\s*(?:-|–|to)\s*(3\d|4[0-8])\b/gi;
const SHOE_SINGLE = /\bsize\s*:?\s*(3\d|4[0-8])\b/gi;
const WAIST = /\b(?:W|waist\s*:?\s*)(2[4-9]|3\d|4[0-4])\b/gi;
const AGE = /\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:Y|yrs?|years)\b/gi;

function numericRange(from: number, to: number, step = 1): string[] {
  if (!(to > from) || to - from > 20) return [String(from)];
  const out: string[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(String(v));
  return out;
}

/** All sizes mentioned in a title, de-duplicated, in the order found. */
export function extractSizes(title: string, department: Department): Size[] {
  const sizes: Size[] = [];
  const add = (system: Size['system'], value: string) => {
    if (!sizes.some((s) => s.system === system && s.value === value)) sizes.push({ system, value });
  };

  if (ONE_SIZE.test(title)) add('letter', 'One Size');
  for (const m of title.matchAll(LETTER_RANGE)) {
    const [a, b] = [letterSize(m[1]!), letterSize(m[2]!)];
    if (a && b) letterRange(a, b).forEach((v) => add('letter', v));
  }
  for (const m of title.matchAll(SIZE_LABEL)) {
    for (const token of m[1]!.split(/[/,]/)) {
      const v = letterSize(token.trim());
      if (v) add('letter', v);
    }
  }
  for (const m of title.matchAll(BARE_LETTER)) {
    const v = letterSize(m[1]!);
    if (v) add('letter', v);
  }

  for (const m of title.matchAll(SYSTEM_SIZE)) {
    const system = m[1]!.toUpperCase() as 'EU' | 'UK' | 'US';
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : from;
    numericRange(from, to, Number.isInteger(from) && Number.isInteger(to) ? 1 : 0.5).forEach((v) =>
      add(system, v),
    );
  }
  if (department === 'shoes') {
    for (const m of title.matchAll(SHOE_RANGE))
      numericRange(Number(m[1]), Number(m[2])).forEach((v) => add('EU', v));
    for (const m of title.matchAll(SHOE_SINGLE)) add('EU', m[1]!);
  }
  if (department === 'clothing') {
    for (const m of title.matchAll(WAIST)) add('waist', m[1]!);
  }
  for (const m of title.matchAll(AGE)) add('age', `${m[1]}-${m[2]}Y`);
  return sizes;
}
