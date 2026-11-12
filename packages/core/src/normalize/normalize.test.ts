import { describe, expect, it } from 'vitest';
import { RawListing, type RawListingInput } from '../types.js';
import { classify, cleanTitle, extractSizes, letterSize, normalizeListing, skipReason } from './index.js';

const raw = (title: string, extra: Partial<RawListingInput> = {}) =>
  RawListing.parse({
    externalId: 'x1',
    sourceUrl: 'https://shop.example.ng/p/x1',
    title,
    priceKobo: 1_000_000,
    inStock: true,
    ...extra,
  });

describe('cleanTitle', () => {
  it('drops emojis and promo noise but keeps the item', () => {
    expect(cleanTitle('🔥🔥 HOT DEAL!!! Sexy Satin Slip Dress - Wine ✨ Free Delivery')).toBe(
      'Satin Slip Dress - Wine',
    );
    expect(cleanTitle('New Arrival 2026 Trendy Ladies Mini Shoulder Bag')).toBe('Ladies Mini Shoulder Bag');
  });

  it('never returns an empty title', () => {
    expect(cleanTitle('🔥 HOT DEAL 🔥')).toBe('🔥 HOT DEAL 🔥');
  });
});

describe('classify', () => {
  it.each([
    ['Bodycon Dress With Belt', 'clothing', 'dresses'],
    ['Women 2 Piece Set Crop Top and Palazzo', 'clothing', 'two-piece-sets'],
    ['Ankara Kaftan Gown', 'clothing', 'native-wear'],
    ['Pointed Stiletto Heels 10cm', 'shoes', 'heels'],
    ['Ladies Pam Slippers', 'shoes', 'slippers'],
    ['Mini Chain Shoulder Bag', 'bags_accessories', 'handbags'],
    ['18K Gold Plated Hoop Earrings', 'bags_accessories', 'earrings'],
    ['Stainless Steel Cuban Link Necklace', 'bags_accessories', 'necklaces'],
    ['Layered Anklet Set', 'bags_accessories', 'anklets'],
    ['Waist Beads 3 Pcs', 'bags_accessories', 'jewellery'],
    ['Satin Hair Bonnet', 'bags_accessories', 'hair-accessories'],
    ['20" Bone Straight 13x4 HD Lace Frontal Wig', 'hair', 'wigs'],
    ['X-pression Braiding Hair', 'hair', 'braids'],
    ['Maybelline Fit Me Foundation 30ml', 'beauty', 'face-makeup'],
    ['Lattafa Oud Mood EDP 100ml', 'beauty', 'perfume'],
    ['Tecno Camon 30 8/256', 'electronics', 'phones'],
  ])('%s -> %s / %s', (title, department, category) => {
    expect(classify([], title)).toMatchObject({ department, category, source: 'title' });
  });

  it('prefers the store breadcrumb, deepest crumb first', () => {
    expect(classify(['Fashion', "Women's Fashion", 'Shoes', 'Sandals'], 'Summer Style Flat')).toEqual({
      department: 'shoes',
      category: 'sandals',
      source: 'path',
    });
  });

  it('lets a specific title beat a broad breadcrumb in the same department', () => {
    expect(classify(['Jewellery'], 'Chunky Hoop Earrings')).toMatchObject({ category: 'earrings' });
    expect(classify(['Makeup'], 'Gloss Bomb Lip Luminizer')).toMatchObject({ category: 'lips' });
    // A different department in the title doesn't override the store.
    expect(classify(['Shoes'], 'Wine Satin Dress')).toMatchObject({ department: 'shoes', category: 'flats' });
  });

  it('keeps the department from a path when the title is unclear', () => {
    expect(classify(['Health & Beauty'], 'Glow Kit by Tolu')).toEqual({
      department: 'beauty',
      category: null,
      source: 'path',
    });
  });
});

describe('sizes', () => {
  it('normalises letter sizes', () => {
    expect(['XXL', 'xxxl', '2X', 'XL', 'M'].map(letterSize)).toEqual(['2XL', '3XL', '2XL', 'XL', 'M']);
  });

  it('expands letter runs and shoe ranges', () => {
    expect(extractSizes('Bodycon Dress Sizes S-XXXL', 'clothing').map((s) => s.value)).toEqual([
      'S',
      'M',
      'L',
      'XL',
      '2XL',
      '3XL',
    ]);
    expect(extractSizes('Big Size Sneakers 39-42', 'shoes')).toEqual([
      { system: 'EU', value: '39' },
      { system: 'EU', value: '40' },
      { system: 'EU', value: '41' },
      { system: 'EU', value: '42' },
    ]);
    expect(extractSizes('Free Size Kaftan', 'clothing')).toEqual([{ system: 'letter', value: 'One Size' }]);
    expect(extractSizes('Mom Jeans W30', 'clothing')).toEqual([{ system: 'waist', value: '30' }]);
  });

  it('does not read shoe sizes from non-shoe titles', () => {
    expect(extractSizes('Tecno Spark 20 Pro 8/256', 'electronics')).toEqual([]);
  });
});

describe('normalizeListing', () => {
  it('reads a women’s dress', () => {
    const n = normalizeListing(
      raw('🔥 Ladies Satin Bodycon Midi Dress - Wine, Black | Sizes S-XL', {
        categoryPath: ["Women's Fashion", 'Clothing'],
        brand: 'Fashion',
      }),
    );
    expect(n).toMatchObject({
      title: 'Ladies Satin Bodycon Midi Dress - Wine, Black | Sizes S-XL',
      brand: undefined,
      department: 'clothing',
      category: 'dresses',
      condition: 'unknown',
      attributes: { rawTitle: '🔥 Ladies Satin Bodycon Midi Dress - Wine, Black | Sizes S-XL' },
      variant: {
        audience: 'women',
        colours: ['Wine', 'Black'],
        material: 'Satin',
        extra: { fit: 'Bodycon, Midi' },
        sizes: ['S', 'M', 'L', 'XL'].map((value) => ({ system: 'letter', value })),
      },
    });
    expect(n.extractionConfidence).toBeGreaterThanOrEqual(0.6);
  });

  it('reads a wig spec (hard attributes for matching)', () => {
    const n = normalizeListing(raw('22" Body Wave 13x4 HD Lace Frontal Wig 180% Density Human Hair 1B'));
    expect(n.department).toBe('hair');
    expect(n.variant.hair).toEqual({
      lengthInches: 22,
      texture: 'Body Wave',
      lace: '13x4',
      densityPct: 180,
      fibre: 'human',
    });
    expect(n.variant.colours).toEqual(['1B']);
  });

  it('does not take one length out of a bundle deal', () => {
    const n = normalizeListing(raw('3 Bundles Deep Wave 16" 18" 20" Virgin Hair'));
    expect(n.variant.hair).toEqual({ texture: 'Deep Wave', fibre: 'human' });
    expect(n.variant.packCount).toBe(3);
  });

  it('reads beauty size, shade and SPF, and defaults beauty to new', () => {
    const n = normalizeListing(
      raw('Fenty Beauty Pro Filtr Foundation Shade 330 32ml SPF 15', { brand: 'Fenty Beauty' }),
    );
    expect(n).toMatchObject({
      department: 'beauty',
      category: 'face-makeup',
      condition: 'new',
      brand: 'Fenty Beauty',
      variant: { netContent: { value: 32, unit: 'ml' }, shade: '330', extra: { spf: '15' } },
    });
    expect(n.variant.audience).toBeUndefined();
  });

  it('counts packs but not two-piece outfits', () => {
    expect(normalizeListing(raw('3 Pcs Cotton Panties for Ladies')).variant.packCount).toBe(3);
    expect(normalizeListing(raw('Pack of 2 Seamless Bras')).variant.packCount).toBe(2);
    expect(normalizeListing(raw('2 Piece Set Crop Top and Skirt')).variant.packCount).toBeUndefined();
    expect(normalizeListing(raw('2 Pcs Women Set Ankara Top')).variant.packCount).toBeUndefined();
  });

  it('reads heel height and jewellery metal', () => {
    expect(normalizeListing(raw('Ladies Block Heels 4 inch Nude')).variant).toMatchObject({
      heelHeightCm: 10.2,
      colours: ['Nude'],
      audience: 'women',
    });
    expect(normalizeListing(raw('18K Gold-Plated Hoop Earrings')).variant).toMatchObject({
      material: '18K Gold Plated',
    });
  });

  it('maps thrift and UK-used wording to condition', () => {
    expect(normalizeListing(raw('Okrika First Grade Jeans')).condition).toBe('used');
    expect(normalizeListing(raw('UK Used iPhone 13 128GB')).condition).toBe('uk_used');
    expect(normalizeListing(raw('Midi Skirt', { condition: 'new' })).condition).toBe('new');
  });

  it('lets store variant fields win over the title', () => {
    const n = normalizeListing(raw('Sneakers Black', { variant: { colours: ['White'] } }));
    expect(n.variant.colours).toEqual(['White']);
  });

  it('flags used beauty for skipping', () => {
    expect(skipReason(normalizeListing(raw('Used Lipstick Ruby Woo')))).toBe('used_beauty');
    expect(skipReason(normalizeListing(raw('Lipstick Ruby Woo')))).toBeNull();
  });

  it('extracts phone memory as electronics variant', () => {
    expect(normalizeListing(raw('Tecno Camon 30 8/256 Black')).variant).toEqual({ ramGb: 8, storageGb: 256 });
  });
});

describe('Nigerian hair spellings (Jiji)', () => {
  it('reads one-word textures and "5by5" lace', () => {
    const n = normalizeListing(raw('12 Inches 5by5 SDD Vietnam Bonestraight Wig'));
    expect(normalizeListing(raw('Luxury 30-Inch Body Wave Human Hair Wig')).variant.hair).toMatchObject({
      lengthInches: 30,
    });
    expect(n.variant.hair).toMatchObject({ lengthInches: 12, texture: 'Bone Straight', lace: '5x5' });
    expect(normalizeListing(raw('Deepwave 13by4 Hdlace Frontal Wig')).variant.hair).toMatchObject({
      texture: 'Deep Wave',
      lace: '13x4',
    });
  });
});
