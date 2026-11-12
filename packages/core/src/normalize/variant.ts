/**
 * Department-specific attribute packs (04-normalization-matching.md 4.1 step 5,
 * 13-fashion-and-beauty.md 13.3). Store-provided variant fields always win over
 * anything parsed from the title.
 */
import type { Audience, Department, HairSpec, NetContent, Variant } from '../types.js';
import {
  COLOURS,
  findAll,
  findFirst,
  FITS,
  HAIR_COLOURS,
  HAIR_TEXTURES,
  MATERIALS,
  PATTERNS,
} from './lexicon.js';
import { extractSizes } from './sizes.js';

/** Built once: lexicons are compiled and cached by identity. */
const HAIR_AND_COLOURS = [...COLOURS, ...HAIR_COLOURS];

const WORD_NUMBERS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  ten: 10,
  twelve: 12,
};
const num = (s: string) => WORD_NUMBERS[s.toLowerCase()] ?? Number(s);
const COUNT = String.raw`(\d{1,2}|two|three|four|five|six|ten|twelve)`;

const PACK_PATTERNS = [
  String.raw`\b${COUNT}[- ]?(?:pack|pk)s?\b`,
  String.raw`\bpack of ${COUNT}\b`,
  String.raw`\bset of ${COUNT}\b`,
  String.raw`\b${COUNT}[- ]?in[- ]?1\b`,
  String.raw`\b${COUNT}\s*pairs?\b`,
  String.raw`\b${COUNT}\s*bundles?\b`,
].map((source) => new RegExp(source, 'i'));
/** "12 Pcs" is a pack unless the next couple of words make it an outfit ("2 Pcs Women Set"). */
const PIECES = new RegExp(
  String.raw`\b${COUNT}[- ]?(?:pcs|pieces?|pc)\b(?!(?:\s+\w+){0,2}\s+(?:sets?|outfits?|suits?)\b)`,
  'i',
);

/**
 * Items per purchase: "2-Pack", "Pack of 3", "4-in-1", "3 Pairs", "3 Bundles", "12 Pcs".
 * A clothing "2 Piece Set" is ONE outfit (category two-piece-sets), not a pack.
 */
export function extractPackCount(title: string, category: string | null = null): number | undefined {
  const patterns = category === 'two-piece-sets' ? PACK_PATTERNS : [...PACK_PATTERNS, PIECES];
  for (const re of patterns) {
    const m = re.exec(title);
    if (!m) continue;
    const n = num(m[1]!);
    if (n >= 2 && n <= 50) return n;
  }
  return undefined;
}

const AUDIENCES: readonly [Audience, RegExp][] = [
  ['baby', /\b(?:baby|babies|infants?|newborn|toddlers?)\b/i],
  ['girls', /\bgirls?'?s?\b/i],
  ['boys', /\bboys?'?s?\b/i],
  ['kids', /\b(?:kids?|children'?s?|child)\b/i],
  ['unisex', /\bunisex\b/i],
  ['women', /\b(?:women'?s?|womens|ladies'?|lady|female|woman)\b/i],
  ['men', /\b(?:men'?s?|mens|male|gents?)\b/i],
];

/** Who it's for, from the store path first (it's more reliable), then the title. */
export function extractAudience(title: string, categoryPath: readonly string[]): Audience | undefined {
  for (const text of [categoryPath.join(' / '), title]) {
    const hits = AUDIENCES.filter(([, re]) => re.test(text)).map(([a]) => a);
    if (hits.includes('women') && hits.includes('men')) return 'unisex';
    // "Ladies bag for girls" is still women's; only kids/baby wording makes it children's.
    if (hits.includes('women') && hits[0] === 'girls' && !hits.includes('kids')) return 'women';
    if (hits[0]) return hits[0];
  }
  return undefined;
}

const INCHES = /(?<![\d.])(\d{1,2}(?:\.\d)?)\s*(?:"|”|''|inch(?:es)?\b|in\b)/i;
const INCHES_ALL = new RegExp(INCHES.source, 'gi');

/** "13 x 4" -> "13x4", "HD lace" -> "HD", "transparent lace" -> "transparent", "t part" -> "T-part". */
function laceLabel(raw: string): string {
  const compact = raw.toLowerCase().replace(/[\s-]+/g, '');
  if (/^\d+x\d+$|^360$/.test(compact)) return compact;
  if (compact === 'hdlace') return 'HD';
  if (compact === 'transparentlace') return 'transparent';
  if (compact === 'tpart') return 'T-part';
  return raw.toLowerCase();
}

function extractHair(title: string): HairSpec | undefined {
  const spec: HairSpec = {};
  const lengths = [...title.matchAll(INCHES_ALL)].map((m) => Number(m[1])).filter((l) => l >= 6 && l <= 40);
  // Bundle deals list several lengths ("16 18 20"): only a single length is a spec.
  if (lengths.length > 0 && new Set(lengths).size === 1) spec.lengthInches = lengths[0]!;
  const texture = findFirst(HAIR_TEXTURES, title);
  if (texture) spec.texture = texture;
  const density = /\b(1[2-9]0|2\d0|300)\s*%/.exec(title);
  if (density) spec.densityPct = Number(density[1]);
  const lace =
    /\b(13\s*x\s*[46]|[2456]\s*x\s*[456]|360|full lace|hd lace|transparent lace|t[- ]?part|headband)\b/i.exec(
      title,
    );
  if (lace) spec.lace = laceLabel(lace[1]!);
  if (/\bblend(?:ed)?\b/i.test(title)) spec.fibre = 'blend';
  else if (/\b(?:human hair|100% human|virgin|remy|raw hair)\b/i.test(title)) spec.fibre = 'human';
  else if (/\b(?:synthetic|heat[- ]resistant|fibre|fiber)\b/i.test(title)) spec.fibre = 'synthetic';
  return Object.keys(spec).length > 0 ? spec : undefined;
}

const NET_UNITS: Record<string, NetContent['unit']> = {
  ml: 'ml',
  cl: 'cl',
  l: 'L',
  ltr: 'L',
  litre: 'L',
  liter: 'L',
  g: 'g',
  gr: 'g',
  grams: 'g',
  kg: 'kg',
  oz: 'oz',
  floz: 'fl_oz',
};

export function extractNetContent(title: string): NetContent | undefined {
  const m =
    /(?<![\w.])(\d{1,4}(?:\.\d{1,2})?)\s*(fl\.?\s?oz|ml|cl|ltr|litre|liter|l|grams|gr|g|kg|oz)\b/i.exec(
      title,
    );
  const unit = m ? NET_UNITS[m[2]!.toLowerCase().replace(/[\s.]/g, '')] : undefined;
  return m && unit ? { value: Number(m[1]), unit } : undefined;
}

function extractShade(title: string): string | undefined {
  return /\bshade\s*[:\-#]?\s*([A-Za-z0-9][\w'-]*(?:\s(?!SPF\b)[A-Z][a-z][\w'-]*)?)/i.exec(title)?.[1];
}

function extractElectronics(title: string, variant: Variant): void {
  const pair = /\b(\d{1,2})\s*(?:GB)?\s*\/\s*(\d{2,4})\s*(?:GB)?\b/i.exec(title);
  if (pair) {
    variant.ramGb = Number(pair[1]);
    variant.storageGb = Number(pair[2]);
    return;
  }
  const ram = /\b(\d{1,2})\s*GB\s*RAM\b/i.exec(title);
  if (ram) variant.ramGb = Number(ram[1]);
  const storage = /\b(\d{2,4})\s*GB\b(?!\s*RAM)|\b([12])\s*TB\b/i.exec(title);
  if (storage) variant.storageGb = storage[1] ? Number(storage[1]) : Number(storage[2]) * 1024;
}

/** Heel height in cm: "10cm heels", "4 inch heels", '3" block heel'. */
function extractHeel(title: string): number | undefined {
  const cm = /\b(\d{1,2}(?:\.\d)?)\s*cm\b/i.exec(title);
  if (cm) return Number(cm[1]);
  const inch = INCHES.exec(title);
  return inch ? Math.round(Number(inch[1]) * 2.54 * 10) / 10 : undefined;
}

type Pack = (title: string, v: Variant, department: Department) => void;

const fashionPack: Pack = (title, v, department) => {
  const sizes = extractSizes(title, department);
  if (sizes.length > 0) v.sizes = sizes;
  const pattern = findFirst(PATTERNS, title);
  if (pattern) v.pattern = pattern;
  const material = findFirst(MATERIALS, title);
  if (material) v.material = material;
};

const PACKS: Partial<Record<Department, Pack>> = {
  clothing(title, v, d) {
    fashionPack(title, v, d);
    const fit = findAll(FITS, title);
    if (fit.length > 0) v.extra = { fit: fit.join(', ') };
  },
  shoes(title, v, d) {
    fashionPack(title, v, d);
    const heel = extractHeel(title);
    if (heel !== undefined && heel <= 25) v.heelHeightCm = heel;
  },
  bags_accessories: fashionPack,
  other: fashionPack,
  hair(title, v) {
    const hair = extractHair(title);
    if (hair) v.hair = hair;
  },
  beauty(title, v) {
    const net = extractNetContent(title);
    if (net) v.netContent = net;
    const shade = extractShade(title);
    if (shade) v.shade = shade;
    const spf = /\bSPF\s?(\d{1,3})\b/i.exec(title);
    if (spf) v.extra = { spf: spf[1]! };
  },
  electronics: (title, v) => extractElectronics(title, v),
};

/** Parses a cleaned title into variant attributes; `given` (from the store) wins per field. */
export function extractVariant(
  title: string,
  department: Department,
  category: string | null,
  categoryPath: readonly string[],
  given: Variant = {},
): Variant {
  const v: Variant = {};
  if (department !== 'beauty' && department !== 'electronics') {
    const audience = extractAudience(title, categoryPath);
    if (audience) v.audience = audience;
    const colours = findAll(department === 'hair' ? HAIR_AND_COLOURS : COLOURS, title);
    if (colours.length > 0) v.colours = colours;
  }
  PACKS[department]?.(title, v, department);
  const pack = extractPackCount(title, category);
  if (pack) v.packCount = pack;

  const merged: Variant = { ...v, ...given };
  if (v.hair && given.hair) merged.hair = { ...v.hair, ...given.hair };
  if (v.extra && given.extra) merged.extra = { ...v.extra, ...given.extra };
  return merged;
}
