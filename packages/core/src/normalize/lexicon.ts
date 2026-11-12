/**
 * Word lists for fashion attributes (13-fashion-and-beauty.md 13.3). Entries are
 * matched longest first, on word boundaries, case-insensitively; the value is what we
 * store. Spelling follows how Nigerian stores write them ("Wine", "Ash", "Army Green").
 */

export type Lexicon = readonly (readonly [match: string, value: string])[];

const same = (...words: string[]): Lexicon => words.map((w) => [w, titleCase(w)] as const);

export function titleCase(text: string): string {
  return text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export const COLOURS: Lexicon = [
  ...same(
    'black',
    'white',
    'off white',
    'cream',
    'beige',
    'nude',
    'ivory',
    'champagne',
    'brown',
    'chocolate',
    'coffee',
    'tan',
    'camel',
    'khaki',
    'grey',
    'ash',
    'silver',
    'gold',
    'rose gold',
    'pink',
    'hot pink',
    'baby pink',
    'peach',
    'coral',
    'fuchsia',
    'magenta',
    'red',
    'wine',
    'burgundy',
    'maroon',
    'orange',
    'yellow',
    'mustard',
    'lemon',
    'green',
    'olive',
    'army green',
    'emerald',
    'emerald green',
    'mint',
    'mint green',
    'lime',
    'teal',
    'blue',
    'navy',
    'navy blue',
    'royal blue',
    'sky blue',
    'baby blue',
    'turquoise',
    'denim blue',
    'purple',
    'lilac',
    'lavender',
    'plum',
    'violet',
    'multicolour',
    'multicolor',
    'ombre',
  ),
  ['gray', 'Grey'],
  ['multi colour', 'Multicolour'],
  ['multi-colour', 'Multicolour'],
  ['multicolor', 'Multicolour'],
];

/** Natural hair colour codes as sold: 1B (off black), 613 (blonde), 99J (burgundy). */
export const HAIR_COLOURS: Lexicon = [
  ['1b', '1B'],
  ['#1b', '1B'],
  ['613', '613'],
  ['#613', '613'],
  ['99j', '99J'],
  ['#99j', '99J'],
  ['350', '350'],
  ['#350', '350'],
  ['natural black', 'Natural Black'],
  ['blonde', 'Blonde'],
  ['ginger', 'Ginger'],
];

export const PATTERNS: Lexicon = [
  ...same(
    'floral',
    'striped',
    'plain',
    'animal print',
    'leopard',
    'zebra',
    'polka dot',
    'checked',
    'plaid',
    'tie-dye',
    'tie dye',
    'camouflage',
    'graphic',
  ),
  ['stripe', 'Striped'],
  ['stripes', 'Striped'],
  ['leopard print', 'Leopard'],
  ['camo', 'Camouflage'],
];

/** Fabrics, leathers and metals. "lace" is a fabric outside hair (hair lace is HairSpec.lace). */
export const MATERIALS: Lexicon = [
  ...same(
    'cotton',
    'satin',
    'silk',
    'chiffon',
    'denim',
    'ankara',
    'adire',
    'lace',
    'linen',
    'velvet',
    'crepe',
    'knit',
    'ribbed',
    'mesh',
    'sequin',
    'organza',
    'tulle',
    'jersey',
    'spandex',
    'wool',
    'crochet',
    'leather',
    'pu leather',
    'faux leather',
    'vegan leather',
    'suede',
    'straw',
    'canvas',
    'stainless steel',
    'titanium',
    'sterling silver',
    'gold plated',
    'silver plated',
    '18k gold plated',
    'pearl',
    'crystal',
    'rhinestone',
  ),
  ['pu', 'PU Leather'],
  ['pu leather', 'PU Leather'],
  ['gold-plated', 'Gold Plated'],
  ['18k gold-plated', '18K Gold Plated'],
  ['18k gold plated', '18K Gold Plated'],
  ['silver-plated', 'Silver Plated'],
  ['925 silver', 'Sterling Silver'],
  ['925 sterling silver', 'Sterling Silver'],
  ['sequins', 'Sequin'],
  ['rhinestones', 'Rhinestone'],
];

/** Fit and length words kept in variant.extra.fit (soft, used by lookalikes). */
export const FITS: Lexicon = same(
  'bodycon',
  'maxi',
  'midi',
  'mini',
  'oversized',
  'slim fit',
  'straight leg',
  'wide leg',
  'flared',
  'a-line',
  'off shoulder',
  'one shoulder',
  'backless',
  'high waist',
  'crop',
  'wrap',
);

export const HAIR_TEXTURES: Lexicon = [
  ...same(
    'bone straight',
    'straight',
    'body wave',
    'deep wave',
    'water wave',
    'loose wave',
    'loose deep wave',
    'kinky curly',
    'kinky straight',
    'pixie curl',
    'jerry curl',
    'yaki',
    'afro',
    'curly',
    'wavy',
  ),
  ['silky straight', 'Straight'],
  ['pixie curls', 'Pixie Curl'],
];

/** Escape for use inside a RegExp source. */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const compiled = new WeakMap<Lexicon, { re: RegExp; lookup: Map<string, string> }>();

function compile(lexicon: Lexicon) {
  let entry = compiled.get(lexicon);
  if (!entry) {
    const words = [...lexicon].map(([m]) => m).sort((a, b) => b.length - a.length);
    // (?<![\w#]) / (?!\w) instead of \b so "#613" and "18k gold-plated" match whole.
    const re = new RegExp(`(?<![\\w#-])(?:${words.map(escape).join('|')})(?![\\w-])`, 'gi');
    entry = { re, lookup: new Map(lexicon.map(([m, v]) => [m.toLowerCase(), v])) };
    compiled.set(lexicon, entry);
  }
  return entry;
}

/** Every distinct value found in `text`, in order of first appearance. */
export function findAll(lexicon: Lexicon, text: string): string[] {
  const { re, lookup } = compile(lexicon);
  const found = new Set<string>();
  for (const m of text.matchAll(re)) {
    const value = lookup.get(m[0].toLowerCase());
    if (value) found.add(value);
  }
  return [...found];
}

export function findFirst(lexicon: Lexicon, text: string): string | undefined {
  return findAll(lexicon, text)[0];
}
