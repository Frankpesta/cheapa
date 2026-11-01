# Fashion and Beauty Focus (all phases)

Cheapa's **primary audience is young Nigerian women shopping for fashion and beauty**: clothing, shoes, bags and accessories, hair and beauty. Electronics stay as a **secondary** category on the same engine. Where this doc and another phase doc disagree on a fashion or beauty item, this doc wins.

The hero moment: she sees a dress, wig or bag on an Instagram vendor's page or a WhatsApp status, shares the screenshot to Cheapa, and sees who sells **that exact item** cheapest, then **cheaper items that look like it**.

---

## 13.1 Launch categories

| Department | Leaf examples (taxonomy ids in `taxonomy.json`) | Match style |
| --- | --- | --- |
| Clothing | dresses, tops, two-piece sets, jeans, skirts, trousers, jumpsuits, lingerie, nightwear, swimwear, native/ankara, abaya/jallabiya | Image-led, lookalikes common |
| Shoes | heels, sneakers, slides/slippers, sandals, flats, boots | Image-led; sizes are soft |
| Bags & accessories | handbags, purses/clutches, backpacks, jewellery, watches, sunglasses, belts, scarves, hair accessories | Image-led; branded watches/sunglasses can match exactly |
| Hair | wigs, bundles/extensions, braids/attachments | Image + attributes (length, texture, density) |
| Beauty | makeup, skincare, perfume, body care, nails | Exact branded products: brand + product + shade/size |
| Electronics (secondary) | phones, tablets, laptops, TVs/audio, appliances | Original rules in `04-normalization-matching.md` |

Taxonomy: fashion and beauty leaves come first and are the most detailed (~120 of the ~150 leaves). `audience` (women, men, unisex, girls, boys, kids, baby) is a separate field, not part of the category, so "women's sneakers" = category `sneakers` + audience `women`.

## 13.2 How fashion listings differ (observed 2026-11-01)

- **"From ₦X" prices**: a card shows the cheapest size or colour, and the old price can be a "From" price too. Stored as `priceKind: 'from'` (`@cheapa/core` `parsePrice`). Never compare a "From" price as if it were the price of every size.
- **Multipacks**: "2-Pack", "4-in-1", "3 Piece" sets. `variant.packCount`; compare **per item** (`priceKobo / packCount`) when pack counts differ, and show the pack size on the row.
- **Size runs in titles**: "Sizes S-XXXL", "M-5XL", "Big Size 39-46". Parsed into `variant.sizes` with a size system (letter, EU, UK, US, waist, age).
- **Generic brands**: "Fashion", unbranded vendor names, supplier names. Brand is often missing or meaningless, so **the image carries the match**.
- **Same supplier photo everywhere**: many sellers (Jumia marketplace, Jiji, Instagram vendors, Temu/Shein) reuse the same factory or catalogue photo for the same item. A near-identical image (phash distance ≤ 6, or image cosine ≥ 0.95) is the strongest exact-match signal in fashion.
- **Jiji titles are often shop names** ("Thriftbykelly"). Use the image and the category; do not trust the title.
- **Condition**: thrift / okrika / "bale" / "first grade" clothing = `used`; "Brand New" = `new`. Beauty is always `new` (used beauty listings are skipped).

## 13.3 Normalization additions (`packages/core/src/normalize/`)

Regex/dictionary packs per department, added to `04-normalization-matching.md` 4.1 step 4:

| Department | Extract |
| --- | --- |
| Clothing | item type, sizes, pack count, audience, colour(s), pattern (floral, striped, plain, animal print), material (cotton, satin, chiffon, denim, ankara, lace), fit/length (bodycon, maxi, midi, mini, oversized) |
| Shoes | item type, sizes (EU/UK/US), heel height (inches/cm), colour, material |
| Bags & accessories | item type, colour, material (leather, PU, straw), metal (gold-plated, stainless, sterling), brand + model for watches/sunglasses |
| Hair | type (wig, bundle, closure, frontal, braids), length (inches), texture (straight/bone straight, body wave, deep wave, kinky curly), density (%), lace (HD, transparent, 13x4, 4x4), human vs synthetic, colour |
| Beauty | brand, product line, shade/colour name or code, size (ml, g, oz), SPF, set/bundle count |

Brand dictionary (`brands.json`) gains fashion, hair and beauty brands (global and Nigerian), with aliases. Unknown brand is normal for fashion: leave `brand` null rather than guessing.

## 13.4 Canonical products and matching (overrides 4.2–4.3 for these departments)

**What "the same product" means:**

| Department | Same canonical product when | Soft (shown per listing) | Hard (split / veto) |
| --- | --- | --- | --- |
| Clothing, shoes, bags | Same design: near-identical image, or same brand + model/style code | size, colour (when the same design comes in colours) | audience, pack count, item type |
| Hair | Same design and spec | colour | length, texture, density, lace type, human vs synthetic |
| Beauty | Same brand + product line | — | shade, size (ml/g), set count |
| Electronics | As in 4.2 | colour | storage, RAM, size, capacity |

**Matcher weights by department** (in config, tuned on labelled pairs):

| Department | Image | Text | Attributes |
| --- | --- | --- | --- |
| Clothing, shoes, bags, hair | 0.65 | 0.15 | 0.20 |
| Beauty | 0.30 | 0.40 | 0.30 |
| Electronics | 0.35 | 0.45 | 0.20 |

Exact-key shortcuts before scoring: GTIN; brand + model code; **phash distance ≤ 6 within the same category and audience** (supplier-photo match).

Merge thresholds stay at ≥ 0.82 (auto) and 0.65–0.82 (review). A wrong fashion merge (two different dresses as one product) is worse than a missed one; lookalikes catch what the matcher misses.

## 13.5 Lookalikes (core feature, not a footer)

Results lead with **exact matches** (the same canonical product, cheapest first), then a **"Looks like this, for less"** section.

- Candidates: top 200 listings by image vector in the same category and audience, seen in the last 7 days, excluding the exact-match product.
- Keep candidates with image similarity ≥ `LOOKALIKE_MIN_SIM` (start 0.80, tune on labels), dedupe to one card per canonical product.
- Order: similarity band first (very close ≥ 0.90, close 0.80–0.90), then **price ascending within each band**. Match quality, then price (rule 7).
- Show up to 20 with image, price, store, and a "Similar style" label. Never present a lookalike as the same item.
- When there is no exact match, lookalikes become the main result, with the headline "We no find the exact one. These look like am:".
- Text-only searches ("black satin slip dress") use the text vector plus attribute filters, and return lookalike-style results.

## 13.6 Visual search changes (`05-visual-search.md`)

- **Image model:** CLIP ViT-B/32 is weak on fashion detail. Benchmark a fashion-tuned model before Phase 1 search work: FashionCLIP (ViT-B/32 base, 512 dims, same footprint) vs Marqo-FashionSigLIP vs plain CLIP, on 300 labelled fashion and beauty images. Choose the best accuracy within the CPU latency budget (≤ 500 ms per query image); record the decision in `DECISIONS.md` and update vector dims in `01-foundation.md` 1.4 if needed. Treat these models as hypotheses until the benchmark runs.
- **Crop to the item:** screenshots of a woman wearing an outfit contain more than one item and a person. `VisionResult` gains `items: { kind, bbox, description }[]` (normalised box). The API embeds the crop of the chosen item, not the whole screenshot. If several items are clearly visible (dress + bag + shoes), return `needsConfirmation` with item chips ("The dress", "The bag", "The shoes").
- **Vision fields for fashion:** `itemType`, `audience`, `colours`, `pattern`, `material`, and hair/beauty attributes (length, texture, shade, size), all inside `variant`.
- **Prompt context:** Instagram vendor posts with price overlays ("₦18,500", "18.5k", "DM to order"), WhatsApp status screenshots, TikTok frames, model photos, flat-lays, and mirror selfies. Ignore people: describe only the item; never describe or identify the person.

## 13.7 Results UI (`06-mobile-app.md` 6.3)

- Detected card example: "Looks like: Black satin slip dress (women)".
- Filters: size (only sizes the listing says it has), colour, condition, store, in stock.
- "From ₦X" shown as such; pack counts shown ("2-pack, ₦3,676 each").
- Lookalikes in a 2-column image grid below exact matches, with the 13.5 headline when there is no exact match.
- **Design gap:** the current `Results.dc.html` was drawn around a phone search and has no lookalike grid, size filter or item-picker chips. Compose them from existing components (`Chip`, `ProductRowCompact`, thumbnail tiles) and **flag for design review** (CLAUDE.md rule 9).

## 13.8 Sources that matter most for this audience

- **Tier 1 (crawl now):** Jumia and Konga fashion, shoes, bags, jewellery, watches, hair and beauty trees; Jiji clothing, shoes, bags, jewellery, watches, hair and beauty categories.
- **Tier 2 (verify during discovery):** Nigerian fashion, hair and beauty online stores. Many run WooCommerce or Shopify, so the platform adapters in `09-long-tail-and-temu.md` cover them. Record each in `docs/sources/`.
- **Affiliate feeds:** Shein and Temu are major sources for this audience. Apply to both affiliate programs in Phase 0 (`09-long-tail-and-temu.md` 9.3); never scrape them.
- **Instagram and WhatsApp vendors** sell a large share of this category but are login-walled and out of scope for crawling. The vendor portal (`09-long-tail-and-temu.md` 9.4) is how they get listed; consider pulling it earlier once launch metrics are in.

## 13.9 Labelled data and metrics

- Labelled title set (`04` 4.1): at least 60% fashion and beauty titles.
- Labelled pairs (`04` 4.4): at least 60% fashion and beauty pairs, including supplier-photo duplicates and near-miss lookalikes (same style, different item).
- Search test set: 200 screenshots, at least 70% fashion and beauty (Instagram vendor posts, WhatsApp statuses, outfit photos, flat-lays).
- Success measure for fashion: **exact item in top 3, or an acceptable lookalike in the top 5**, judged by a reviewer. Target ≥ 80% on the test set (the `12-roadmap-and-launch.md` 12.2 accuracy gate).

**Acceptance (this doc's work, spread across phases):** fashion fixtures in every tier-1 adapter (multi-size "From" price, multipack, out-of-stock size, shop-name title on Jiji); matcher passes the fashion labelled pairs at ≥ 95% auto-merge precision; lookalikes returned for 90% of fashion test searches with no exact match.
