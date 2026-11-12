/**
 * Title cleanup and condition (04-normalization-matching.md 4.1 steps 1 and 6,
 * 13-fashion-and-beauty.md 13.2).
 */
import type { Condition, Department } from '../types.js';

/** Promo noise that says nothing about the item. */
const PROMO = [
  /\b(?:hot|mega|flash|super|big)\s+(?:deals?|sales?|offers?)\b/gi,
  /\bfree\s+(?:delivery|shipping|gift)\b/gi,
  /\bblack\s+friday\b/gi,
  /\bcyber\s+monday\b/gi,
  /\b(?:limited|special)\s+(?:offer|edition\s+offer|stock)\b/gi,
  /\bbest\s*sell(?:er|ing)\b/gi,
  /\bnew\s+(?:arrivals?|in|launch)\b/gi,
  /\b(?:top|high)\s+quality\b/gi,
  /\bpay\s+on\s+delivery\b/gi,
  /\b(?:on\s+)?promo\b/gi,
  /\b(?:20\d\d)\s+(?:new|latest|trendy)\b/gi,
  /\b(?:trendy|latest|classy|stylish|fashionable|elegant|sexy)\b/gi,
];

/** Pictographs plus the joiners, variation selectors and skin-tone modifiers around them. */
const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u{FE0F}|\u{200D}/gu;

/** Strips emojis and promo words, collapses repeats and whitespace. Never returns empty. */
export function cleanTitle(raw: string): string {
  let t = raw.normalize('NFKC').replace(EMOJI, ' ');
  for (const re of PROMO) t = t.replace(re, ' ');
  t = t
    .replace(/([!*~#=_.])\1+/g, '$1') // "!!!" -> "!"
    .replace(/[!*~]+/g, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+([,/|-])\s*(?=[,/|-]|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[\s,/|:-]+|[\s,/|:-]+$/g, '');
  return t.length >= 3 ? t : raw.trim();
}

const CONDITION_WORDS: readonly [Condition, RegExp][] = [
  ['uk_used', /\b(?:uk|london|foreign|us|belgium)\s*used\b|\btokunbo\b/i],
  ['refurbished', /\b(?:refurbished|renewed|open[- ]box)\b/i],
  [
    'used',
    /\b(?:thrift(?:ed)?|okrika|bale|first grade|1st grade|fairly used|local used|pre[- ]?owned|pre[- ]?loved|second[- ]?hand|used)\b/i,
  ],
  ['new', /\bbrand[- ]?new\b|\bnew with tags?\b|\bbnwt\b/i],
];

/** Store field first; then title words. Beauty is always sold new (used beauty is skipped). */
export function detectCondition(
  given: Condition | undefined,
  title: string,
  department: Department,
): Condition {
  const fromTitle = CONDITION_WORDS.find(([, re]) => re.test(title))?.[0];
  const condition = given && given !== 'unknown' ? given : (fromTitle ?? 'unknown');
  if (department === 'beauty' && condition === 'unknown') return 'new';
  return condition;
}

/** Store "brands" that aren't brands; fashion often has none, and null beats a guess. */
const NOT_A_BRAND =
  /^(?:generic|fashion|no ?brand|unbranded|other|others|oem|n\/?a|none|brand|new|unknown|ladies|women|men|unisex|china|nigeria|[\W\d_]+)$/i;

export function cleanBrand(brand: string | undefined): string | undefined {
  const b = brand?.trim().replace(/\s+/g, ' ');
  return b && !NOT_A_BRAND.test(b) ? b : undefined;
}
