/**
 * Electronics packs (04-normalization-matching.md 4.1 step 4): phone and laptop model,
 * storage and RAM. Electronics are secondary to fashion, but storage and RAM are hard
 * variants: a 4/64 and a 4/128 phone are different products.
 */
import type { Variant } from '../types.js';

/** Sub-brand series that belong in the model: "Redmi 15C", "Galaxy A07", "iPhone 15 Pro". */
const SERIES = /^(?:redmi|galaxy|iphone|ipad|macbook|pixel|note)$/i;

const STOP = [
  /^\d+(?:\.\d+)?(?:"|''|”|inch(?:es)?|in)$/i, // 6.7", 14inch
  /^\d+\.\d+$/, // a bare screen size such as "6.78"; whole numbers are model numbers ("Smart 20")
  /\d\s*(?:gb|tb|g)$/i, // 4GB, 1TB, 64G
  /^(?:ram|rom|ssd|hdd|emmc)/i,
  /^android/i,
  /^(?:smart\s*phones?|smartphones?|phones?|mobile|laptop|notebook|tablet)$/i,
  /^(?:2g|3g|4g|5g|lte|dual|sim|nfc)$/i,
  // "Ultra" is a model name ("S25 Ultra"); Intel's "Ultra 7" comes after "Intel", which stops first.
  /^(?:intel|amd|core|celeron|pentium|ryzen|i[3579]|n\d{3,4}|snapdragon|helio|mediatek)$/i,
  /^(?:rugged|waterproof|unlocked)$/i,
  /^(?:touch|touchscreen|windows|win\d*|freedos|chrome|backlit|backlight|with|plus|free|and|&)$/i,
  /mah$/i,
  /^\d+hz$/i,
  /^\d+w$/i,
  /^\d+(?:st|nd|rd|th)$|^1oth$|^gen$/i,
  /^\d+\s*[+/]\s*\d+/, // 4+128, 8/256
  /^(?:black|white|blue|green|red|gold|silver|grey|gray|pink|purple|orange|titanium|midnight|sky)$/i,
  /^renewed$|^refurbished$|^used$/i,
];

const tokens = (text: string) =>
  text
    .replace(/smart\s*phones?/gi, ' | ')
    .split(/[\s,/()|]+|-/)
    .map((t) => t.trim())
    .filter(Boolean);

/**
 * Model name after the brand, up to the first spec token: "Samsung Galaxy A07 6.7" 4GB..."
 * -> "Galaxy A07"; "Hp EliteBook 840 G6 Intel Core I5..." -> "EliteBook 840 G6".
 */
export function extractModel(title: string, brand: string | undefined): string | undefined {
  if (!brand) return undefined;
  const brandWords = new Set(brand.toLowerCase().split(/\s+/));
  const words = tokens(title);
  // Start after the last brand word (titles can repeat it: "Ruioo RUIOO S25 Ultra"), or at
  // a series word ("REDMI 15C") when the brand itself isn't in the title.
  let start = -1;
  words.forEach((w, i) => {
    if (brandWords.has(w.toLowerCase()) && (start === -1 || i === start + 1)) start = i;
  });
  const series = words.findIndex((w) => SERIES.test(w));
  if (start === -1 && series === -1) return undefined;
  let i = start + 1;
  if (start === -1) i = series;
  const model: string[] = [];
  for (; i < words.length && model.length < 5; i++) {
    const w = words[i]!;
    if (model.length > 0 && STOP.some((re) => re.test(w))) break;
    if (model.length === 0 && STOP.some((re) => re.test(w)) && !SERIES.test(w)) break;
    model.push(w);
  }
  if (model.length === 0) return undefined;
  // "REDMI" / "ELITEBOOK" / "CHROMEBOOK": title-case shouted words, keep codes ("G6", "X360").
  return model.map((w) => (/^[A-Z]{4,}$/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w)).join(' ');
}

const n = (s: string | undefined) => (s === undefined ? undefined : Number(s));

/** Storage and RAM in GB from the many ways sellers write them. */
export function extractMemory(title: string): Pick<Variant, 'storageGb' | 'ramGb'> {
  const t = title.replace(/(\d)\s*GB\s*GB/gi, '$1GB'); // "128GBGB"
  let ram =
    // "16GB(4GB+12GB)RAM": 4 is physical, 12 is virtual.
    n(/\(\s*(\d{1,2})\s*(?:GB)?\s*\+\s*\d{1,2}\s*(?:GB)?\s*\)\s*RAM/i.exec(t)?.[1]) ??
    n(/(?<!\d)(\d{1,2})\s*GB\s*(?:LP)?(?:DDR\d\w*)?\s*RAM/i.exec(t)?.[1]);
  let storage =
    n(/(?<!\d)(\d{2,4})\s*GB\s*(?:ROM|SSD|EMMC|HDD|storage|internal)/i.exec(t)?.[1]) ??
    n(/(?<!\d)(\d{3,4})\s*(?:SSD|HDD)\b/i.exec(t)?.[1]);
  const tb = /(?<!\d)([1-4])\s*TB\b/i.exec(t)?.[1];
  if (storage === undefined && tb) storage = Number(tb) * 1024;

  if (ram === undefined || storage === undefined) {
    // "4+128", "8/256", "4+64G"; storage-first "256/8gb".
    const pair = /(?<![\d.])(\d{1,2})\s*(?:GB)?\s*[+/]\s*(\d{2,4})\s*(?:GB?)?(?![\d.])/i.exec(t);
    const reversed = /(?<![\d.])(\d{2,4})\s*(?:GB)?\s*\/\s*(\d{1,2})\s*GB\b/i.exec(t);
    if (pair && Number(pair[2]) >= 16) {
      ram ??= Number(pair[1]);
      storage ??= Number(pair[2]);
    } else if (reversed) {
      storage ??= Number(reversed[1]);
      ram ??= Number(reversed[2]);
    }
  }
  if (ram === undefined || storage === undefined) {
    // "6GB 128GB": the small one is RAM, the large one storage.
    const gbs = [...t.matchAll(/(?<!\d)(\d{1,4})\s*GB\b/gi)].map((m) => Number(m[1]));
    ram ??= gbs.find((g) => g <= 24 && gbs.some((x) => x >= 32));
    storage ??= gbs.find((g) => g >= 32);
  }
  return {
    ...(storage !== undefined ? { storageGb: storage } : {}),
    ...(ram !== undefined ? { ramGb: ram } : {}),
  };
}
