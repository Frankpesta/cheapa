/**
 * Cheapa taxonomy v1 (13-fashion-and-beauty.md 13.1): fashion and beauty first,
 * electronics secondary. Leaves are checked IN ORDER and the first hit wins, so more
 * specific or more distinctive leaves come first ("hair clip" before "wigs", "dress
 * shoes" before "dresses", "two-piece set" before "tops").
 *
 * Audience (women, men, kids...) is a separate field, never part of the category.
 */
import type { Department } from '../types.js';

export interface TaxonomyLeaf {
  id: string;
  department: Department;
  /** Matched case-insensitively against the store category path, then the title. */
  pattern: RegExp;
  /** A catch-all leaf: a more specific title leaf in the same department beats it. */
  broad?: boolean;
}

const leaf = (id: string, department: Department, words: string, broad = false): TaxonomyLeaf => ({
  id,
  department,
  ...(broad ? { broad } : {}),
  pattern: new RegExp(`\\b(?:${words})\\b`, 'i'),
});

export const TAXONOMY: readonly TaxonomyLeaf[] = [
  // Hair accessories and tools first: they mention hair but are not hair.
  leaf(
    'hair-accessories',
    'bags_accessories',
    'hair ?(?:clips?|pins?|bands?|ties?|bows?)|scrunchies?|headbands?|bonnets?|wig caps?|durags?|claw clips?',
  ),
  leaf(
    'beauty-tools',
    'beauty',
    'hair ?dryers?|blow ?dryers?|straighteners?|flat irons?|curling (?:irons?|wands?)|makeup brush(?:es)?|beauty blenders?',
  ),

  // Hair
  leaf('wigs', 'hair', 'wigs?|lace front|frontal wig|closure wig|bob wig|pixie wig|glueless'),
  leaf('closures-frontals', 'hair', 'closures?|frontals?'),
  leaf('bundles', 'hair', 'bundles?|weaves?|hair extensions?|weft|virgin hair|human hair'),
  leaf('braids', 'hair', 'braids?|braiding hair|attachments?|crochet hair|locs|twists?|expression'),

  // Beauty
  leaf(
    'perfume',
    'beauty',
    // Scent notes ("Woody & Musky 10ml", "Oud Mood") mean fragrance in Nigerian beauty titles.
    'perfumes?|eau de (?:parfum|toilette)|edp|edt|fragrances?|body mists?|cologne|oil perfume|musk|musky|oud',
  ),
  leaf(
    'nails',
    'beauty',
    'nail polish|press[- ]on nails?|nail glue|gel polish|acrylic nails?|fake nails?|nails',
  ),
  leaf('lips', 'beauty', 'lipsticks?|lip ?gloss(?:es)?|lip liners?|lip balms?|lip oils?|lip stains?|lips?'),
  leaf(
    'face-makeup',
    'beauty',
    'foundations?|concealers?|setting powder|face powder|primers?|blush(?:er)?|bronzers?|highlighters?|contour|setting spray',
  ),
  leaf(
    'eye-makeup',
    'beauty',
    'mascaras?|eyeliners?|eye ?shadows?|eyeshadow palette|brow (?:pencil|gel)|eyebrow pencil|lashes|false eyelashes',
  ),
  leaf(
    'skincare',
    'beauty',
    'serums?|moisturi[sz]ers?|cleansers?|toners?|sunscreen|sun ?block|spf ?\\d+|face wash|face masks?|retinol|niacinamide|toning|glow oil',
  ),
  leaf(
    'body-care',
    'beauty',
    'body lotions?|body butter|body oil|shower gel|body wash|body scrub|deodorants?|roll[- ]on|lotion',
  ),
  leaf('hair-care', 'beauty', 'shampoo|conditioner|hair oil|hair cream|edge control|leave[- ]in|hair growth'),
  leaf('makeup', 'beauty', 'makeup|make[- ]up|cosmetics?', true),

  // Jewellery and accessories
  leaf('watches', 'bags_accessories', 'watch(?:es)?|smart ?watch'),
  leaf('sunglasses', 'bags_accessories', 'sunglass(?:es)?|shades|eyeglasses|spectacles'),
  leaf('jewellery-sets', 'bags_accessories', 'jewe?l(?:le)?ry sets?|necklace (?:and|&) earrings?'),
  leaf('earrings', 'bags_accessories', 'earrings?|ear ?studs?|ear cuffs?|hoops'),
  leaf('necklaces', 'bags_accessories', 'necklaces?|chokers?|pendants?|chain necklaces?'),
  leaf('bracelets', 'bags_accessories', 'bracelets?|bangles?|cuff bracelets?'),
  leaf('anklets', 'bags_accessories', 'anklets?|ankle chains?'),
  leaf('rings', 'bags_accessories', 'rings?'),
  leaf('jewellery', 'bags_accessories', 'jewe?l(?:le)?ry|waist beads?|body chains?|brooch(?:es)?', true),
  leaf('belts', 'bags_accessories', 'belts?'),
  leaf('scarves', 'bags_accessories', 'scarf|scarves|hijabs?|gele|head ?wraps?|turbans?'),
  leaf('wallets', 'bags_accessories', 'wallets?|purses?|card holders?'),

  // Shoes before bags and clothing ("shoe bag" is rare; "dress shoes" is common).
  leaf('heels', 'shoes', 'heels?|stilettos?|pumps|wedges?|block heels?'),
  leaf('sneakers', 'shoes', 'sneakers?|trainers?|canvas shoes?|running shoes?|airforce|air force'),
  leaf('slippers', 'shoes', 'slippers?|slides?|flip[- ]?flops?|palms?|crocs'),
  leaf('sandals', 'shoes', 'sandals?|gladiators?'),
  leaf('boots', 'shoes', 'boots?|booties'),
  leaf('flats', 'shoes', 'flats|flat shoes?|ballerinas?|loafers?|mules|moccasins?|shoes?', true),

  // Bags
  leaf('backpacks', 'bags_accessories', 'backpacks?|school bags?'),
  leaf('clutches', 'bags_accessories', 'clutch(?:es)?|evening bags?|purse bags?'),
  leaf(
    'handbags',
    'bags_accessories',
    'handbags?|hand bags?|shoulder bags?|tote bags?|totes?|crossbody|cross[- ]body|sling bags?|mini bags?|bags?',
    true,
  ),

  // Clothing: sets and one-pieces before tops and bottoms.
  leaf(
    'two-piece-sets',
    'clothing',
    '(?:two|2|three|3)[- ]?(?:piece|pcs|pc)s?\\s+(?:\\w+\\s+){0,2}(?:sets?|outfits?|suits?)|(?:two|2|three|3)[- ]piece|co[- ]ord|matching sets?',
  ),
  leaf(
    'native-wear',
    'clothing',
    'ankara|adire|aso[- ]?ebi|kaftan|caftan|boubou|bubu|iro and buba|native wear|kampala|george wrapper|wrappers?',
  ),
  leaf('abaya', 'clothing', 'abayas?|jalabiyas?|jallabiyas?|jilbab'),
  leaf('jumpsuits', 'clothing', 'jumpsuits?|playsuits?|rompers?|overalls|dungarees'),
  leaf(
    'lingerie',
    'clothing',
    'lingerie|bras?|bralettes?|panties|pants set|underwear|thongs?|briefs|boy ?shorts',
  ),
  leaf('shapewear', 'clothing', 'shapewear|body shapers?|waist trainers?|corsets?|tummy control'),
  leaf(
    'nightwear',
    'clothing',
    'nightwear|night ?gowns?|nighties?|pyjamas?|pajamas?|sleepwear|robes?|night dress',
  ),
  leaf('swimwear', 'clothing', 'swimwear|swimsuits?|bikinis?|monokinis?|swimming costumes?|beachwear'),
  leaf(
    'activewear',
    'clothing',
    'activewear|sportswear|gym wear|leggings|yoga pants|sports bras?|tracksuits?|joggers?',
  ),
  leaf('dresses', 'clothing', 'dress(?:es)?|gowns?|sundress'),
  leaf('skirts', 'clothing', 'skirts?|skorts?'),
  leaf('jeans', 'clothing', 'jeans|denim (?:trousers|pants)'),
  leaf('trousers', 'clothing', 'trousers?|pants|palazzos?|cargo pants|wide[- ]leg'),
  leaf('shorts', 'clothing', 'shorts'),
  leaf(
    'jackets',
    'clothing',
    'jackets?|blazers?|coats?|cardigans?|kimonos?|hoodies?|sweaters?|sweatshirts?|bombers?',
  ),
  leaf(
    'tops',
    'clothing',
    'tops?|blouses?|shirts?|t-?shirts?|tees?|tank tops?|camis?|camisoles?|crop tops?|bodysuits?|corset tops?|polos?',
  ),

  // Electronics (secondary)
  leaf(
    'phones',
    'electronics',
    'iphone|smartphones?|mobile phones?|galaxy [asz]\\d+|tecno|infinix|itel|redmi',
  ),
  leaf('tablets', 'electronics', 'ipad|tablets?|galaxy tab'),
  leaf('laptops', 'electronics', 'laptops?|notebooks?|macbook|chromebook'),
  leaf(
    'tv-audio',
    'electronics',
    'televisions?|smart tv|led tv|tvs?|soundbars?|speakers?|earbuds|earphones|headphones|airpods',
  ),
  leaf(
    'appliances',
    'electronics',
    'fridges?|refrigerators?|freezers?|washing machines?|microwaves?|blenders?|air ?conditioners?|generators?|irons?',
  ),
];

/** Store category words that settle the department even when no leaf matches. */
const DEPARTMENT_HINTS: readonly { department: Department; pattern: RegExp }[] = [
  { department: 'hair', pattern: /\b(?:hair|wigs?)\b/i },
  {
    department: 'beauty',
    pattern: /\b(?:beauty|health ?& ?beauty|makeup|skin ?care|fragrances?|cosmetics?)\b/i,
  },
  { department: 'shoes', pattern: /\b(?:shoes|footwear)\b/i },
  { department: 'bags_accessories', pattern: /\b(?:bags?|accessories|jewe?l(?:le)?ry|watches)\b/i },
  { department: 'clothing', pattern: /\b(?:clothing|apparel|fashion|wears?)\b/i },
  { department: 'electronics', pattern: /\b(?:phones?|tablets?|computing|electronics|appliances?)\b/i },
];

export interface Classification {
  department: Department;
  category: string | null;
  /** Where the category came from: the store's own breadcrumb is the stronger signal. */
  source: 'path' | 'title' | 'none';
}

function findLeaf(text: string): TaxonomyLeaf | undefined {
  return text ? TAXONOMY.find((l) => l.pattern.test(text)) : undefined;
}

/** "Satin Dress With Belt" -> "Satin Dress": the item is named before add-ons. */
export function titleHead(title: string): string {
  return title.split(/\s+(?:with|\+|&\s*free|plus free|and free|\|)\s+/i)[0] ?? title;
}

/**
 * Store breadcrumb leaf first (deepest crumb wins), then the title. A path that only
 * names a department ("Women's Fashion") still sets it when the title is unclear.
 */
export function classify(categoryPath: readonly string[], title: string): Classification {
  for (const crumb of [...categoryPath].reverse()) {
    const hit = findLeaf(crumb);
    if (!hit) continue;
    const fromTitle = findLeaf(titleHead(title));
    // A broad crumb ("Jewellery") or a combined one ("Tops and Jackets") yields to the
    // title when the title names one of the leaves the crumb could mean.
    const crumbLeaves = TAXONOMY.filter((l) => l.pattern.test(crumb));
    const titleFits =
      fromTitle !== undefined &&
      fromTitle.department === hit.department &&
      (hit.broad === true || crumbLeaves.includes(fromTitle));
    const chosen = titleFits ? fromTitle : hit;
    return { department: chosen.department, category: chosen.id, source: 'path' };
  }
  const fromTitle = findLeaf(titleHead(title)) ?? findLeaf(title);
  const pathText = categoryPath.join(' / ');
  const hinted = DEPARTMENT_HINTS.find((h) => h.pattern.test(pathText))?.department;
  if (fromTitle && (!hinted || hinted === fromTitle.department || hinted === 'clothing')) {
    return { department: fromTitle.department, category: fromTitle.id, source: 'title' };
  }
  if (hinted) return { department: hinted, category: null, source: 'path' };
  return { department: 'other', category: null, source: 'none' };
}
