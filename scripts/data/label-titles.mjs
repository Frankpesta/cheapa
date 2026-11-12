#!/usr/bin/env node
/**
 * Builds scripts/data/titles-labelled.jsonl (04 §4.1, 13 §13.9) from a pool of real titles
 * crawled on 2026-11-12 (Jumia, Jiji, four Shopify and three WooCommerce stores).
 *
 * Labels come from the STORES' OWN DATA, not from Cheapa's normalizer, so the eval can't
 * grade the normalizer against itself:
 *   - department / category: the store's category path, through STORE_CATEGORIES below
 *     (a hand-written table; null category = the store's category is too broad to say);
 *   - brand: the store's brand field, kept only when the title actually names it; generic
 *     store brands ("Fashion", "Generic") become an expected "no brand";
 *   - phones and laptops: model, storage and RAM labelled by hand (HAND below).
 * Every row says how it was labelled (`labels`). Fix a wrong label here, not in the jsonl.
 *
 * Usage: node scripts/data/label-titles.mjs <pool.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [poolPath] = process.argv.slice(2);
if (!poolPath) throw new Error('usage: label-titles.mjs <pool.json>');
const pool = JSON.parse(readFileSync(poolPath, 'utf8'));

const has = (path, re) => path.some((p) => re.test(p));

/** Store category path -> { department, category } (null = leave out of the set). */
function storeCategory(r) {
  const p = r.storePath ?? [];
  const last = p.at(-1) ?? '';
  switch (r.store) {
    case 'jumia':
      if (has(p, /^Smartphones$/)) return { department: 'electronics', category: 'phones' };
      if (has(p, /^Laptops$/)) return { department: 'electronics', category: 'laptops' };
      if (has(p, /Watches/)) return { department: 'bags_accessories', category: 'watches' };
      if (has(p, /^Dresses$/)) return { department: 'clothing', category: 'dresses' };
      if (has(p, /^Shapewear$/)) return { department: 'clothing', category: 'shapewear' };
      if (has(p, /^Lingerie$/)) return { department: 'clothing', category: 'lingerie' };
      if (has(p, /^Wigs$/)) return { department: 'hair', category: 'wigs' };
      if (has(p, /^Earrings$/)) return { department: 'bags_accessories', category: 'earrings' };
      // Jumia files flat slippers and slides under Pumps > Low/Mid Heels: only High Heels is a category.
      if (has(p, /^High Heels$/)) return { department: 'shoes', category: 'heels' };
      if (has(p, /^Pumps$/)) return { department: 'shoes', category: null };
      if (has(p, /^Lipstick$/)) return { department: 'beauty', category: 'lips' };
      return null;
    case 'jiji':
      return (
        {
          Clothing: { department: 'clothing', category: null },
          'Wedding Wear & Accessories': { department: 'clothing', category: null },
          Bags: { department: 'bags_accessories', category: null },
          Shoes: { department: 'shoes', category: null },
          Jewelry: { department: 'bags_accessories', category: null },
          Watches: { department: 'bags_accessories', category: 'watches' },
          'Hair Beauty': { department: 'hair', category: null },
          'Make-Up': { department: 'beauty', category: null },
          Fragrances: { department: 'beauty', category: 'perfume' },
          'Body Care': { department: 'beauty', category: null },
        }[last] ?? null // oral care, supplements, tools: out of scope
      );
    case 'brandlistry':
      return { department: 'beauty', category: /CC Cream/.test(last) ? null : 'skincare' };
    case 'kuddy':
      return (
        {
          Foundation: { department: 'beauty', category: 'face-makeup' },
          Sunscreen: { department: 'beauty', category: 'skincare' },
          Lipstick: { department: 'beauty', category: 'lips' },
          'Body Lotion': { department: 'beauty', category: 'body-care' },
          'Hair Treatment': { department: 'beauty', category: 'hair-care' },
        }[last] ?? { department: 'beauty', category: null }
      );
    case 'garmisland':
      if (last === 'CLOTHING') return { department: 'clothing', category: null };
      if (last === 'ACCESSORIES') return { department: 'bags_accessories', category: null };
      return null;
    case 'shopmaju':
      return { department: 'clothing', category: /^Dress(es)?$/.test(last) ? 'dresses' : null };
    case 'okriks':
      if (has(p, /Bras$/)) return { department: 'clothing', category: 'lingerie' };
      if (has(p, /^Tops and Jackets$/)) return { department: 'clothing', category: null };
      return null;
    case 'essentialshub':
      if (has(p, /^Tea$/)) return null;
      if (has(p, /Fragrance/)) return { department: 'beauty', category: 'perfume' };
      if (has(p, /Body Wash|Shower Gel/)) return { department: 'beauty', category: 'body-care' };
      if (has(p, /^Face|Serum|Moistur|Sunscreen|Toner|Cleanser/))
        return { department: 'beauty', category: 'skincare' };
      return { department: 'beauty', category: null };
    case 'meshhairline':
      return { department: 'hair', category: null };
    default:
      return null;
  }
}

const GENERIC = /^(fashion|generic|renewed|other|no brand)$/i;
/** Store brand spellings that differ from the brand's name. */
const BRAND_NAME = { 'Morgan Scott footwears': 'Morgan Scott', Renewed: null };

function storeBrand(r) {
  if (['jiji', 'meshhairline'].includes(r.store)) return undefined; // no brand data
  const raw = r.storeBrand?.trim();
  if (!raw) return undefined;
  if (GENERIC.test(raw)) return null; // expect "no brand"
  if (['garmisland', 'shopmaju', 'kuddy'].includes(r.store) && /garm|maju|kuddy/i.test(raw)) return undefined; // the shop itself
  const name = raw in BRAND_NAME ? BRAND_NAME[raw] : raw;
  if (!name) return undefined;
  // Only gradeable when the title names it.
  return r.title.toLowerCase().includes(name.toLowerCase()) ? name : undefined;
}

/** Phones and laptops, by hand: [brand, model, storageGb, ramGb]. */
const HAND = {
  'Samsung Galaxy A06 6.7" 4GB RAM/128GB ROM Android 14 - Black': ['Samsung', 'Galaxy A06', 128, 4],
  'Ruioo S25 Ultra Android Smartphone, 8GB RAM + 128GB - 6.8 inches - Blue': ['Ruioo', 'S25 Ultra', 128, 8],
  "XIAOMI Redmi 15C 6.9'' 4GB RAM/128GB ROM Android 15 - Midnight Black": ['Xiaomi', 'Redmi 15C', 128, 4],
  'Infinix Smart 20 6.78" 4GB RAM/64GB ROM Android 16-Black Plus Free Handheld Fan': [
    'Infinix',
    'Smart 20',
    64,
    4,
  ],
  "XIAOMI REDMI A7 - 6.88'' 3GB RAM/64GB ROM Android 15 - Black": ['Xiaomi', 'Redmi A7', 64, 3],
  "XIAOMI Redmi 15C 6.9'' 4GBRAM/128GB ROM Android 15 -Midnight Black": ['Xiaomi', 'Redmi 15C', 128, 4],
  'Samsung Galaxy A07 6.7" 4GB RAM/128GBGB ROM - Black': ['Samsung', 'Galaxy A07', 128, 4],
  'Poco C85 6.9" 8GB RAM / 256GB ROM Xiaomi HyperOS - Black': ['Poco', 'C85', 256, 8],
  'Infinix Hot 70 6.78" 4GB RAM/128GB ROM Android 16- Night Pulse Plus Free Sports Water Bottle': [
    'Infinix',
    'Hot 70',
    128,
    4,
  ],
  'Poco C81 Pro 6.9" 4GB RAM / 128GB ROM Android 15 - Black': ['Poco', 'C81 Pro', 128, 4],
  'Samsung Galaxy A07s 4G 6.7" 4GB RAM 64GB ROM- Dual SIM - Black': ['Samsung', 'Galaxy A07s', 64, 4],
  'vivo V70 FE 6.83" 120hz 256/8gb 7000mAh 90w Fast charge - Blue': ['vivo', 'V70 FE', 256, 8],
  'XIAOMI Redmi Note 17 6.99" 6GB 128GB Dual SIM 7700mAh FHD+ AMOLED display- Black': [
    'Xiaomi',
    'Redmi Note 17',
    128,
    6,
  ],
  "OUKITEL WP23Plus Rugged Smartphone 10600mAh, 16GB(4GB+12GB)RAM/128GB ROM, Android 15 Phones, 6.52''Display,13MP Camera,IP68/IP69K Dustproof Phone,Waterproof Rugged Phone,4G Dual SIM Cell Phone,Fingerprint/NFC/GPS/OTG/Face ID - Orange":
    ['Oukitel', 'WP23Plus', 128, 4],
  'OUKITEL C66 Smartphone,16GB(4+12)RAM+128GB ROM,6.73"HD,64MP AI phone,Android 16 4g Dual Sim Mobile phones with Free Case,NFC,GPS,Reverse Charging,Dark Grey':
    ['Oukitel', 'C66', 128, 4],
  'Infinix Smart 20 HD 6.78" 3GB RAM/64GB ROM Android 16- Night Pulse': ['Infinix', 'Smart 20 HD', 64, 3],
  "XIAOMI Redmi 15C 6.9'' 8GBRAM/256GB ROM Android 15 -Midnight Black": ['Xiaomi', 'Redmi 15C', 256, 8],
  'Ruioo RUIOO S25 Ultra Android Smartphone 8GB + 128GB 6.8 inches': ['Ruioo', 'S25 Ultra', 128, 8],
  'Ruioo S25 Ultra Smartphone, 6.8-Inches, 8GB RAM + 128GB - Android - Black': ['Ruioo', 'S25 Ultra', 128, 8],
  'Samsung Galaxy A07 6.7" 4GB RAM/128GB ROM - Black': ['Samsung', 'Galaxy A07', 128, 4],
  'C Idea 6.7 Inches 8+64GB Smartphone,with android10 snapdragon processor,720*1600incell dual Sim': [
    'C Idea',
    null,
    64,
    8,
  ],
  'Samsung Galaxy A06 6.7" 4GB RAM/ 128GB ROM Android 14 - Black': ['Samsung', 'Galaxy A06', 128, 4],
  'redbeat D5 Android 14 Smartphones 4+64GB ROM, 6.52 inch, 5000mAh/Dual SIM/GPS/WiFi/BT5.0, 13MP+5MP,Black':
    ['Redbeat', 'D5', 64, 4],
  'XIAOMI Redmi 17 4G, 4GB RAM/128GB ROM, 6.9", 7500mAh- Black': ['Xiaomi', 'Redmi 17', 128, 4],
  'Infinix Smart 20 6.78" 4GB RAM/128GB ROM Android 16- Sunlike Orange Plus Free Sunglasses': [
    'Infinix',
    'Smart 20',
    128,
    4,
  ],
  'REDMI 15C 4+128 BLACK (Renewed)': ['Xiaomi', 'Redmi 15C', 128, 4],
  'Infinix Hot 70, 6.78", 120Hz IPS Display, MediaTek Helio G100 Ultimate Processor And Massive 6,000mAh Battery With 45W Fast Charging, 128gb Rom 4gb Ram, Night Pulse':
    ['Infinix', 'Hot 70', 128, 4],
  "XIAOMI Redmi 15C 6.9'' 6GBRAM/128GB ROM Android 15 -Midnight Black": ['Xiaomi', 'Redmi 15C', 128, 6],
  'Infinix Smart 20 HD Smart Phone With 64GB ROM & 3GB RAM (Night Pulse)': ['Infinix', 'Smart 20 HD', 64, 3],
  'XIAOMI Redmi 8A 6.22"4GB+64GB Battery 5000mAh 12MP Smartphone Dual SIM BlACK': [
    'Xiaomi',
    'Redmi 8A',
    64,
    4,
  ],
  'Renewed Huawei Y5P Black 5.45" 4+64G 8MP 3020mAh With Free EasyPie 10000mAh 37W Power Bank': [
    'Huawei',
    'Y5P',
    64,
    4,
  ],
  'Samsung Galaxy A26 5G 6.7" 8GB RAM 256GB ROM Android 15 Dual SIM - Black': [
    'Samsung',
    'Galaxy A26',
    256,
    8,
  ],
  'Samsung Galaxy A26 5G 6.7" 6GB RAM 128GB ROM Android 15 Dual SIM - Black': [
    'Samsung',
    'Galaxy A26',
    128,
    6,
  ],
  'Samsung Galaxy A07 6.7" 4GB RAM/64GBGB ROM - Black': ['Samsung', 'Galaxy A07', 64, 4],
  'Oale 17 Pro Max Android 15 Smartphone 6.85" HD+, 6+64GB 128GB Expansion, 5750mAh Battery Phone, 13+20MP Camera, 4G Dual SIM, Side Fingerprint-Sunset Orange':
    ['Oale', '17 Pro Max', 64, 6],
  'Infinix Smart 20 6.78" 4GB RAM/64GB ROM Android 16-Titanium Plus Free Handheld Fan': [
    'Infinix',
    'Smart 20',
    64,
    4,
  ],
  "XIAOMI REDMI A7 - 6.88'' 3GB RAM/64GB ROM Android 15 - Sky Blue": ['Xiaomi', 'Redmi A7', 64, 3],
  'Huawei Y9 Smartphone , Androidsystem,8GBRAM +256GBROM,5.65"Display, 2160x1080px Resolution, 4CamerasFront camera 13 million+2 million pixels, rear camera 16million+2million pixels,3340 mAh Battery, Dual Sim, blue':
    ['Huawei', 'Y9', 256, 8],
  'Huawei Y5P Blue 5.45" 4+64G 8MP 3020mAh With Free EasyPie 10000mAh 37W Fast Charge Power Bank': [
    'Huawei',
    'Y5P',
    64,
    4,
  ],
  'DELL Latitude 7490 Intel Core I5- 16GB RAM/256GB SSD /BACKLIGHT KEYBOARD/WIN 11 PRO+BAG': [
    'Dell',
    'Latitude 7490',
    256,
    16,
  ],
  'Asus Vivobook 14-AMD Ryzen AI 7 445-16GB Ram-512GB SSD-14 Inches-WUXGA (1920 x 1200)-WIN 11-Platinum Gold-With Perfect Warranty-M1407GA':
    ['Asus', 'Vivobook 14', 512, 16],
  'Asus Vivobook S14 Intel Ultra 7-256V/16GB RAM/512GB SSD/14Inch WUXGA (1920x1200) OLED/Windows 11 Home/WiFi 7/Type C charger/FHD camera with IR function to support Windows Hello With privacy shutter/Neutral Black - S5406SA':
    ['Asus', 'Vivobook S14', 512, 16],
  'Asus Vivobook 15 Touch Screen/Intel Core i7-1355U/8GB RAM/512GB SSD/15.6" FHD(1920x1080)/FreeDOS/Cool Silver':
    ['Asus', 'Vivobook 15', 512, 8],
  'Hp ProBook 11 X360-TOUCHSCREEN Intel Celeron 128GB SSD-4GB RAM WINDOWS10 Pro & Free USB Light': [
    'HP',
    'ProBook 11 X360',
    128,
    4,
  ],
  'Hp CHROMEBOOK 11 , INTEL CELERON, 4GB RAM,16GB EMMC + USB LIGHT': ['HP', 'Chromebook 11', 16, 4],
  'Hp Stream 11 PRO Intel Celeron 4GB RAM- 64GB SSD WIN 10+ USB LIGHT FOR KEYBOARD': [
    'HP',
    'Stream 11 Pro',
    64,
    4,
  ],
  'Hp EliteBook 840 G5 TOUCHSCREEN Core I5-16GB RAM/256GB SSD/Backlit Keyboard/FP Reader WIN 11 Pro+BAG': [
    'HP',
    'EliteBook 840 G5',
    256,
    16,
  ],
  'Hp EliteBook 840 G6 Intel Core I5-8GB RAM-256GB SSD-Backlit Keyboard 11 Pro+BAG': [
    'HP',
    'EliteBook 840 G6',
    256,
    8,
  ],
  'Hp EliteBook 840 G6 Intel Core I7-32GB RAM/512GB SSD/Backlit/FP Reader Windows 11 Pro + BAG': [
    'HP',
    'EliteBook 840 G6',
    512,
    32,
  ],
  'Hp EliteBook 840 G7 1Oth GEN Touchscreen Core I5-16GB RAM/256GB SSD/Backlit Keyboard/Windows 11 Pro+BAG': [
    'HP',
    'EliteBook 840 G7',
    256,
    16,
  ],
  'Hp EliteBook 840 G6 TOUCHSCREEN Core I5-8GB RAM/256GB SSD/Backlit Keyboard/Windows 11 Pro+BAG': [
    'HP',
    'EliteBook 840 G6',
    256,
    8,
  ],
  'Hp ELITEBOOK X360 1030 G2 TOUCHSCREEN CORE I5 8GB RAM/ 1TB SSD BACKLIT KEYBOARD FP READER WIN 11 PRO': [
    'HP',
    'EliteBook X360 1030 G2',
    1024,
    8,
  ],
  'Asus Vivobook Go 14-Intel N150-8GB Ram-256GB SSD-14 inches-FHD (1920 x 1080)-FreeDOS-Silver-With Perfect Waranty-E1404TA':
    ['Asus', 'Vivobook Go 14', 256, 8],
  'Hp EliteBook 840 G7 1Oth GEN Touchscreen Intel Core I5-16GB RAM/512GB SSD/Backlit Keyboard-WIN 11 Pro+ BAG':
    ['HP', 'EliteBook 840 G7', 512, 16],
  'Hp CHROMEBOOK 11 G4, INTEL CELERON, 4GB RAM,32GB EMMC + USB LIGHT': ['HP', 'Chromebook 11 G4', 32, 4],
  'Hp EliteBook 840 G6 Intel Core I7-32GB RAM/1TB SSD/Backlit/FP Reader Windows 11 Pro + BAG': [
    'HP',
    'EliteBook 840 G6',
    1024,
    32,
  ],
  'Hp EliteBook 830 G6 TOUCHSCREEN Core I5-8GB RAM/256GB SSD/Backlit Keyboard/Wins 11 Pro+BAG&MOUSE': [
    'HP',
    'EliteBook 830 G6',
    256,
    8,
  ],
  'DELL Latitude 7300 TOUCHSCREEN Intel Core I5- 256GB SSD/16GB RAM BACKLIGHT KEYBOARD/WIN 11 PRO+BAG': [
    'Dell',
    'Latitude 7300',
    256,
    16,
  ],
  'Hp CHROMEBOOK 11 G4, INTEL CELERON, 4GB RAM,64GB EMMC + USB LIGHT': ['HP', 'Chromebook 11 G4', 64, 4],
  'Hp EliteBook 840 G8 11th GEN TOUCHSCREEN Core I5-16GB RAM/256GB SSD/Backlit Keyboard-WIN 11 Pro+ BAG': [
    'HP',
    'EliteBook 840 G8',
    256,
    16,
  ],
  'Hp EliteBook 840 G6 Intel Core I7-8GB RAM-256GB SSD-Backlit Keyboard 11 Pro+BAG': [
    'HP',
    'EliteBook 840 G6',
    256,
    8,
  ],
  'Hp EliteBook 840 G8 Touchscreen Intel Core I5 512 SSD/8gbRam Backlit Keyboard Win 11 Pro': [
    'HP',
    'EliteBook 840 G8',
    512,
    8,
  ],
  'Asus Vivobook 14 Flip Touch Screen-Intel Ultra7 226V-16GB Ram-512GB SSD-14 Inches-WUXGA (1920 x 1200) OLED-WIN 11 Home-Grey-Stylus Support-With Perfect Warranty-TP3407SA':
    ['Asus', 'Vivobook 14 Flip', 512, 16],
  'Asus Vivobook Go 14-Intel Celeron N4500-8GB Ram-256GB SSD-14 Inches-FHD (1920 x 1080)-FreeDOS-Black-With Perfect Warranty-E410KA':
    ['Asus', 'Vivobook Go 14', 256, 8],
  'Hp 250 G7 - Intel Celeron - 4GB RAM - 500GB HDD - Windows 10 with mouse': ['HP', '250 G7', 500, 4],
  'DELL Latitude 7490 TOUCHSCREEN-Intel Core i7 - 512GB SSD/16GB RAM BACKLIGHT KEYBOARD- Windows 11 PRO+BAG':
    ['Dell', 'Latitude 7490', 512, 16],
  'DELL Latitude 7490 256GB SSD/8GB RAM/ Intel Core I5/ BACKLIGHT KEYBOARD-WIN 11PRO+BAG': [
    'Dell',
    'Latitude 7490',
    256,
    8,
  ],
  'Hp ELITEBOOK X360 1040 G8 11th GEN TOUCHSCREEN Intel Core I7-16GB RAM/512GB SSD/BACKLIGHT KEYBOARD/WIN11 PRO+BAG':
    ['HP', 'EliteBook X360 1040 G8', 512, 16],
  'DELL Latitude 7490 Intel Core I7- 512GB SSD/16GB RAM BACKLIGHT KEYBOARD/WIN 11PRO+BAG': [
    'Dell',
    'Latitude 7490',
    512,
    16,
  ],
  'Hp EliteBook 840 G5 Intel Core I5-12GB RAM/512GB SSD/Backlit Keyboard/FP Reader Windows 11 Pro+BAG': [
    'HP',
    'EliteBook 840 G5',
    512,
    12,
  ],
  'Hp EliteBook 840 G8 Touchscreen 11th Gen Intel Core I5 16GB RAM/256 SSD Win 11 Pro': [
    'HP',
    'EliteBook 840 G8',
    256,
    16,
  ],
  'DELL CHROMEBOOK 11, INTEL CELERON,4GB RAM,16GB SSD + Usb light': ['Dell', 'Chromebook 11', 16, 4],
  'Hp Stream 11 Intel Celeron 64GB SSD 4GB RAM Windows 10 with bag': ['HP', 'Stream 11', 64, 4],
  'DELL Latitude 7490 Intel Core I7/ 16GB RAM 512GB SSD/BACKLIGHT KEYBOARD/WIN 11PRO+BAG': [
    'Dell',
    'Latitude 7490',
    512,
    16,
  ],
  'Hp CHROMEBOOK 11 , INTEL CELERON, 4GB RAM,16GB EMMC +USB LIGHT': ['HP', 'Chromebook 11', 16, 4],
  'Hp EliteBook 830 G6 TOUCHSCREEN Core I5-8GB RAM/256GB SSD/Backlit Keyboard/Windows 11 Pro+BAG': [
    'HP',
    'EliteBook 830 G6',
    256,
    8,
  ],
};

const rows = [];
let handUsed = 0;
for (const r of pool) {
  const cat = storeCategory(r);
  if (!cat) continue;
  const expect = { department: cat.department };
  if (cat.category) expect.category = cat.category;
  const labels = ['store'];
  const hand = HAND[r.title];
  if (hand) {
    handUsed += 1;
    const [brand, model, storageGb, ramGb] = hand;
    Object.assign(expect, { brand, ...(model ? { model } : {}), storageGb, ramGb });
    labels.push('hand');
  } else {
    const brand = storeBrand(r);
    if (brand !== undefined) expect.brand = brand;
  }
  rows.push({ store: r.store, title: r.title, expect, labels: labels.join('+') });
}
if (handUsed !== Object.keys(HAND).length)
  throw new Error(`hand labels matched ${handUsed}/${Object.keys(HAND).length} titles`);
rows.forEach((row, i) => (row.id = `t${String(i + 1).padStart(4, '0')}`));
const out = new URL('./titles-labelled.jsonl', import.meta.url);
writeFileSync(out, rows.map(({ id, ...r }) => JSON.stringify({ id, ...r })).join('\n') + '\n');

const fashion = rows.filter((r) => r.expect.department !== 'electronics').length;
console.log(
  `${rows.length} titles, ${fashion} fashion/hair/beauty (${Math.round((fashion / rows.length) * 100)}%), ${handUsed} hand-labelled electronics`,
);
