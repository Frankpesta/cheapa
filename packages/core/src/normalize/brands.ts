/**
 * Brand dictionary (04-normalization-matching.md 4.1 step 2, 13-fashion-and-beauty.md
 * 13.3): fashion, hair and beauty first (global and Nigerian), then phones and computers.
 * Unknown brand is normal in fashion: we leave it null rather than guess.
 *
 * `exact` brands are ordinary words too ("Next", "Coach", "Guess", "Dove"): they only match
 * with the brand's own capitalisation (or all caps), never in lower case.
 */
import type { Department } from '../types.js';

export interface BrandEntry {
  name: string;
  aliases?: readonly string[];
  departments: readonly Department[];
  exact?: boolean;
}

type D = Department;
const b = (
  name: string,
  departments: readonly D[],
  aliases: readonly string[] = [],
  exact = false,
): BrandEntry => ({
  name,
  departments,
  ...(aliases.length > 0 ? { aliases } : {}),
  ...(exact ? { exact } : {}),
});
const C: D[] = ['clothing'];
const S: D[] = ['shoes'];
const A: D[] = ['bags_accessories'];
const H: D[] = ['hair'];
const B: D[] = ['beauty'];
const E: D[] = ['electronics'];
const F: D[] = ['clothing', 'shoes', 'bags_accessories'];
const M: D[] = ['clothing', 'shoes', 'bags_accessories', 'hair', 'beauty'];

export const BRANDS: readonly BrandEntry[] = [
  // ---- Fashion: global high street and sportswear
  b('Zara', F),
  b('H&M', F, ['H & M', 'HM']),
  b('Shein', F, ['SHEIN']),
  b('Trendyol', F),
  b('Fashion Nova', F),
  b('PrettyLittleThing', F, ['Pretty Little Thing', 'PLT']),
  b('Boohoo', F),
  b('ASOS', F),
  b('Topshop', F),
  b('River Island', F),
  b('New Look', F),
  b('Primark', F),
  b('Marks & Spencer', F, ['M&S', 'M And S', 'Marks and Spencer']),
  b('Next', F, [], true),
  b('Mango', F, [], true),
  b('Gap', F, [], true),
  b('Coast', F, [], true),
  b('Bershka', F),
  b('Pull&Bear', F, ['Pull & Bear', 'Pull and Bear']),
  b('Stradivarius', F),
  b('Forever 21', F, ['Forever21']),
  b('Uniqlo', F),
  b('Calvin Klein', F),
  b('Tommy Hilfiger', F, ['Tommy']),
  b('Ralph Lauren', F, ['Polo Ralph Lauren']),
  b("Levi's", F, ['Levis', 'Levi']),
  b('Lacoste', F),
  b("Victoria's Secret", ['clothing', 'beauty'], ['Victorias Secret', 'Victoria Secret']),
  b('Ann Summers', C),
  b('Skims', C, ['SKIMS']),
  b('Spanx', C),
  b('Triumph', C, [], true),
  b('Playtex', C),
  b('Wonderbra', C),
  b('Nike', F),
  b('Adidas', F, ['adidas']),
  b('Puma', F, [], true),
  b('Reebok', F),
  b('New Balance', S),
  b('Asics', S, ['ASICS', 'Ascis']),
  b('Converse', S),
  b('Vans', S, [], true),
  b('Fila', F),
  b('Skechers', S),
  b('Under Armour', F),
  b('Jordan', S, ['Air Jordan'], true),
  b('Crocs', S),
  b('Birkenstock', S),
  b('Dr. Martens', S, ['Dr Martens', 'Doc Martens']),
  b('Timberland', S),
  b('Clarks', S),
  b('Steve Madden', S),
  b('Aldo', F, ['ALDO']),
  b('Charles & Keith', ['shoes', 'bags_accessories'], ['Charles and Keith', 'Charles Keith']),
  b('Call It Spring', S),
  b('Dream Pairs', S),
  b('Shoedazzle', S),
  b('Jimmy Choo', ['shoes', 'bags_accessories']),
  b('Christian Louboutin', S, ['Louboutin']),
  b('Manolo Blahnik', S),
  b('Yeezy', S),
  // ---- Luxury (also heavily counterfeited: matching on brand alone stays careful)
  b('Gucci', F),
  b('Louis Vuitton', F, ['LV', 'Luis Vuitton', 'Louis Vuiton']),
  b('Chanel', ['clothing', 'shoes', 'bags_accessories', 'beauty']),
  b('Dior', ['clothing', 'shoes', 'bags_accessories', 'beauty'], ['Christian Dior']),
  b('Prada', F),
  b('Hermès', F, ['Hermes']),
  b('Fendi', F),
  b('Versace', ['clothing', 'shoes', 'bags_accessories', 'beauty']),
  b('Balenciaga', F),
  b('Givenchy', ['clothing', 'beauty']),
  b('Burberry', ['clothing', 'bags_accessories', 'beauty']),
  b('Michael Kors', ['bags_accessories', 'shoes']),
  b('Coach', A, [], true),
  b('Kate Spade', A),
  b('Guess', ['clothing', 'bags_accessories'], [], true),
  b('Steve Madden Bags', A),
  b('Tory Burch', ['shoes', 'bags_accessories']),
  b('Valentino', F),
  b('Bottega Veneta', A),
  b('Celine', A, ['Céline']),
  b('Saint Laurent', ['bags_accessories', 'beauty'], ['YSL', 'Yves Saint Laurent']),
  b('Balmain', C),
  // ---- Watches, jewellery, eyewear
  b('Casio', A, ['G-Shock', 'Baby-G']),
  b('Rolex', A),
  b('Omega', A, [], true),
  b('Tissot', A),
  b('Fossil', A),
  b('Daniel Wellington', A),
  b('Swatch', A),
  b('Seiko', A),
  b('Citizen', A, [], true),
  b('Curren', A, ['CURREN']),
  b('Naviforce', A, ['NAVIFORCE']),
  b('Poedagar', A),
  b('Skmei', A, ['SKMEI']),
  b('Geneva', A, [], true),
  b('Pandora', A),
  b('Swarovski', A),
  b('Tiffany & Co.', A, ['Tiffany', 'Tiffany and Co']),
  b('Cartier', A),
  b('Van Cleef & Arpels', A, ['Van Cleef']),
  b('Ray-Ban', A, ['Ray Ban', 'RayBan']),
  b('Oakley', A),
  // ---- Nigerian and African fashion
  b('Lisa Folawiyo', C),
  b('Orange Culture', C),
  b('Maki Oh', C),
  b('Andrea Iyamah', C),
  b('Lanre Da Silva Ajayi', C),
  b('Deola Sagoe', C),
  b('Tiffany Amber', C),
  b('Kenneth Ize', C),
  b('Meji Meji', C),
  b('Bawsty', C),
  b('CIAR', C, [], true),
  b('Shop Maju', C, ['Maju']),
  b('Garm Island', F, ['GARM ISLAND']),
  b('Trax Apparel', C),
  b('Grey Velvet', C),
  b('Fruché', C, ['Fruche']),
  b('Mai Atafo', C),
  b('Wanni Fuga', C),
  b('Zashadu', A),
  b('Ejiro Amos Tafiri', C),
  // ---- Jumia marketplace brands (seen 2026-11-12): sellers list clothes, shoes, wigs
  // and beauty under one name, so they count in every fashion and beauty department.
  b('Angel Choices', M),
  b('Arhanory', M, ['ARHANORY']),
  b('Zuohc', M, ['ZUOHC']),
  b('Calliara', M, ['CALLIARA']),
  b('Shjo', M, ['SHJO']),
  b('Teso', M),
  b('Yolanda', M),
  b('Mirella', M),
  b('Aidailu', M, ['AIDAILU']),
  b('Huahua', M, ['HUAHUA']),
  b('Mateamoda', M),
  b('Digabi', M),
  b('Morgan Scott', S, ['Morgan Scott footwears']),
  // ---- Hair
  b('X-Pression', H, ['Xpression', 'X Pression']),
  b('Darling', H, [], true),
  b('Noble', H, [], true),
  b('Sensationnel', H, ['Sensational']),
  b('Outre', H, ['OUTRE']),
  b('Bobbi Boss', H),
  b('Freetress', H, ['FreeTress']),
  b('Janet Collection', H),
  b('Zury', H),
  b('Model Model', H),
  b('Shake-N-Go', H, ['Shake N Go']),
  b('Mane Concept', H),
  b("It's a Wig", H, ['Its a Wig']),
  b('Hair Lovers', H),
  b('Sleek', ['hair', 'beauty'], [], true),
  b('UNice', H, ['Unice']),
  b('Beauty Forever', H),
  b('Asteria Hair', H),
  b('Luvme Hair', H, ['Luvme']),
  b('Nadula', H),
  b('Klaiyi', H),
  b('Ali Grace', H, ['Ali Grace Hair']),
  b('Isee Hair', H, ['ISEE']),
  b('West Kiss', H, ['WestKiss']),
  b('Manic Panic', ['hair', 'beauty']),
  b('Mesh Hairline', H),
  b('Zevera', H, ['Zevera Luxury Hair']),
  b('Wigmore', H),
  b('Kinky Curly', H, [], true),
  // ---- Hair care
  b('Cantu', B),
  b('Shea Moisture', B, ['SheaMoisture']),
  b('Mielle', B, ['Mielle Organics']),
  b('As I Am', B, [], true),
  b('Eco Styler', B, ['Ecostyler']),
  b('Dark and Lovely', B, ['Dark & Lovely']),
  b('ORS', B, ['Organic Root Stimulator']),
  b('Olaplex', B),
  b('Makari', B),
  b('TCB', B),
  b('Just For Me', B),
  b('Motions', B),
  b('Pantene', B),
  b('Tresemmé', B, ['Tresemme', 'TRESemme']),
  b('Bigen', B),
  // ---- Makeup
  b('Fenty Beauty', B, ['Fenty', 'FENTY BEAUTY']),
  b('Maybelline', B, ['Maybelline New York']),
  b("L'Oréal", B, ["L'Oreal", 'Loreal', 'L Oreal', "L'Oréal Paris"]),
  b('MAC', B, ['M.A.C', 'MAC Cosmetics'], true),
  b('NYX', B, ['NYX Professional Makeup']),
  b('Revlon', B),
  b('Huda Beauty', B, ['Huda']),
  b('Rare Beauty', B),
  b('Charlotte Tilbury', B),
  b('Anastasia Beverly Hills', B, ['ABH']),
  b('Too Faced', B),
  b('Benefit', B, [], true),
  b('Urban Decay', B),
  b('Morphe', B),
  b('e.l.f.', B, ['elf', 'ELF Cosmetics', 'e.l.f'], true),
  b('Milani', B),
  b('Black Opal', B),
  b('Black Radiance', B),
  b('Iman', B, [], true),
  b('Zaron', B, ['Zaron Cosmetics']),
  b('House of Tara', B),
  b('Classic Makeup', B),
  b('Mood Matchers', B),
  b('Sleek MakeUP', B, ['Sleek Makeup']),
  b('Kuddy', B, ['Kuddy Cosmetics']),
  b('Kiss', B, [], true),
  b('Ardell', B),
  b('Smashbox', B),
  b('Estée Lauder', B, ['Estee Lauder']),
  b('Clinique', B),
  b('Bobbi Brown', B),
  b('NARS', B),
  b('Milk Makeup', B),
  b('Glossier', B),
  b('Essence', B, [], true),
  b('Catrice', B),
  b('Wet n Wild', B, ['Wet N Wild', 'wet n wild']),
  b('Rimmel', B, ['Rimmel London']),
  b('Max Factor', B),
  b('Flormar', B),
  b('Golden Rose', B),
  b('Beauty Creations', B),
  b('Ruby Kisses', B),
  b('Kylie Cosmetics', B, ['Kylie']),
  b('Pat McGrath', B, ['Pat McGrath Labs']),
  b('Laura Mercier', B),
  // ---- Skincare
  b('CeraVe', B, ['Cerave']),
  b('The Ordinary', B),
  b('La Roche-Posay', B, ['La Roche Posay']),
  b('Neutrogena', B),
  b('Nivea', B, ['NIVEA']),
  b('Vaseline', B),
  b('Dove', B, [], true),
  b('Simple', B, [], true),
  b('Garnier', B),
  b('Olay', B),
  b('Cetaphil', B),
  b('Eucerin', B),
  b('Bioderma', B),
  b('Vichy', B),
  b('Avène', B, ['Avene']),
  b("Paula's Choice", B, ['Paulas Choice']),
  b('Glow Recipe', B),
  b('Drunk Elephant', B),
  b('Biodroga', B),
  b('Dermalogica', B),
  b('SK-II', B, ['SKII', 'SK II']),
  b('COSRX', B, ['Cosrx']),
  b('Anua', B, ['ANUA']),
  b('Some By Mi', B, ['SOME BY MI', 'Somebymi']),
  b('Beauty of Joseon', B),
  b('Skin1004', B, ['SKIN1004']),
  b('Isntree', B),
  b('Round Lab', B),
  b('Torriden', B),
  b('Medicube', B),
  b('Axis-Y', B, ['Axis Y']),
  b('Laneige', B),
  b('Innisfree', B),
  b('Missha', B),
  b('Mizon', B),
  b('Neogen', B),
  b('Purito', B),
  b('Klairs', B, ['Dear, Klairs']),
  b('Skin Aqua', B),
  b('Bioré', B, ['Biore']),
  b("Palmer's", B, ['Palmers']),
  b('Bio-Oil', B, ['Bio Oil']),
  b('St. Ives', B, ['St Ives']),
  b('Tree Hut', B),
  b('Carmex', B),
  b('Dr Rashel', B, ['Dr. Rashel', 'Dr.Rashel']),
  b('Caro White', B, ['Carowhite']),
  b('Skin Doctor', B),
  b('Arami Essentials', B),
  b('Skin Pop', B, ['Skin Pop Essentiel']),
  b('Tolu Bally', B),
  b('Nubian Heritage', B),
  b('Jergens', B),
  b('Cocoa Butter Formula', B),
  b('Bath & Body Works', B, ['Bath and Body Works', 'BBW']),
  b("Victoria's Secret Pink", B, ['VS Pink']),
  b('Etlee', B),
  // ---- Fragrance
  b('Lattafa', B),
  b('Armaf', B),
  b('Rasasi', B),
  b('Ajmal', B),
  b('Al Rehab', B),
  b('Afnan', B),
  b('Maison Alhambra', B),
  b('Fragrance World', B),
  b('Arabian Oud', B),
  b('Swiss Arabian', B),
  b('Paris Corner', B),
  b('Zara Fragrance', B, ['Zara Perfume']),
  b('Carolina Herrera', B),
  b('Paco Rabanne', B, ['Rabanne']),
  b('Jean Paul Gaultier', B, ['JPG']),
  b('Lancôme', B, ['Lancome']),
  b('Tom Ford', B),
  b('Creed', B, [], true),
  b('Maison Francis Kurkdjian', B, ['MFK', 'Baccarat Rouge']),
  b('Kayali', B),
  b('Sol de Janeiro', B),
  b('Montblanc', B),
  b('Hugo Boss', B, ['Boss'], true),
  b('Davidoff', B),
  b('Montale', B),
  b('Mancera', B),
  b('Maison Margiela', B),
  b('Glade', B, [], true),
  // ---- Phones and tablets
  b('Apple', ['electronics'], ['iPhone', 'iPad', 'MacBook'], true),
  b('Samsung', E, ['Galaxy']),
  b('Tecno', E, ['TECNO']),
  b('Infinix', E),
  b('itel', E, ['ITEL']),
  b('Xiaomi', E, ['Redmi', 'XIAOMI']),
  b('Poco', E, ['POCO']),
  b('Oppo', E, ['OPPO']),
  b('vivo', E, ['Vivo', 'VIVO']),
  b('Realme', E, ['realme']),
  b('Huawei', E, ['HUAWEI']),
  b('Honor', E, [], true),
  b('Nokia', E),
  b('Motorola', E, ['Moto']),
  b('Google Pixel', E),
  b('OnePlus', E, ['One Plus']),
  b('Oukitel', E, ['OUKITEL']),
  b('Ulefone', E),
  b('Blackview', E),
  b('Doogee', E),
  b('Oale', E),
  b('Ruioo', E, ['RUIOO']),
  b('Redbeat', E, ['redbeat']),
  b('C Idea', E, ['C-Idea', 'CIdea']),
  b('Gionee', E),
  b('Umidigi', E),
  b('ZTE', E),
  b('Oraimo', E),
  b('Lenovo', E),
  // ---- Computers
  b('HP', E, ['Hp', 'Hewlett Packard', 'Hewlett-Packard']),
  b('Dell', E, ['DELL']),
  b('Asus', E, ['ASUS']),
  b('Acer', E),
  b('Toshiba', E),
  b('MSI', E),
  b('Microsoft Surface', E),
  // ---- Appliances and audio
  b('LG', E),
  b('Hisense', E),
  b('TCL', E),
  b('Sony', E),
  b('Panasonic', E),
  b('Philips', E),
  b('Binatone', E),
  b('Nexus', E),
  b('Scanfrost', E),
  b('Thermocool', E),
  b('Haier', E, ['Haier Thermocool']),
  b('Midea', E),
  b('Polystar', E),
  b('Syinix', E),
  b('JBL', E),
  b('Bose', E),
  b('Beats', E, [], true),
];

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Word-ish boundaries that also work for "H&M", "e.l.f." and "L'Oréal". */
const bounded = (spelling: string) =>
  String.raw`(?<![\p{L}\p{N}])` + escape(spelling) + String.raw`(?![\p{L}\p{N}])`;

interface Pattern {
  re: RegExp;
  name: string;
}

let compiled: { patterns: Pattern[]; byLower: Map<string, string> } | null = null;

function compile() {
  if (compiled) return compiled;
  const patterns: Pattern[] = [];
  const byLower = new Map<string, string>();
  for (const entry of BRANDS) {
    for (const spelling of [entry.name, ...(entry.aliases ?? [])]) {
      byLower.set(spelling.toLowerCase(), entry.name);
      if (entry.exact) {
        patterns.push({ re: new RegExp(bounded(spelling), 'u'), name: entry.name });
        if (spelling.toUpperCase() !== spelling) {
          patterns.push({ re: new RegExp(bounded(spelling.toUpperCase()), 'u'), name: entry.name });
        }
      } else {
        patterns.push({ re: new RegExp(bounded(spelling), 'iu'), name: entry.name });
      }
    }
  }
  compiled = { patterns, byLower };
  return compiled;
}

/** A store-given brand in its canonical spelling ("FENTY BEAUTY" -> "Fenty Beauty"); unknown ones pass through. */
export function canonicalBrand(brand: string): string {
  return compile().byLower.get(brand.trim().toLowerCase()) ?? brand.trim();
}

/** True when a store-given brand is one we know. */
export function isKnownBrand(brand: string): boolean {
  return compile().byLower.has(brand.trim().toLowerCase());
}

/** The brand named earliest in the title (longest spelling on a tie); undefined when none. */
export function brandFromTitle(title: string, department?: Department): string | undefined {
  let best: { index: number; length: number; name: string } | undefined;
  for (const { re, name } of compile().patterns) {
    const m = re.exec(title);
    if (!m) continue;
    // "Simple" is a skincare brand, not the "Simple Twisted Earrings" adjective: a title
    // brand only counts when it sells in the department we classified.
    if (department && department !== 'other' && !brandDepartments(name).includes(department)) continue;
    if (!best || m.index < best.index || (m.index === best.index && m[0].length > best.length)) {
      best = { index: m.index, length: m[0].length, name };
    }
  }
  return best?.name;
}

/** The departments a known brand sells in; empty for brands we don't know. */
export function brandDepartments(name: string): readonly Department[] {
  return BRANDS.find((b) => b.name === name)?.departments ?? [];
}
