# Phase 1 — Normalization and Product Matching (Nov 16 – Nov 30, 2026)

Goal: turn messy listings into clean attributes, then group "the same product" across stores into canonical products. **This is Cheapa's moat.** Grouping errors are the fastest way to lose user trust.

---

## 4.1 Normalization pipeline (`packages/core/src/normalize/`)

Input: `RawListing`. Output: `NormalizedListing`.

Steps, in order:
1. **Clean title:** strip emojis, promo noise ("HOT DEAL!!!", "Free delivery", "Black Friday"), collapse whitespace, keep original in `attributes.rawTitle`.
2. **Brand:** dictionary match (`brands.json`, ~2,000 brands incl. Nigerian and Chinese phone brands like Tecno, Infinix, itel, Oraimo) with alias map ("Samsung Galaxy" → Samsung).
3. **Category:** map store category path to Cheapa taxonomy (`taxonomy.json`, ~150 leaf categories). Fallback: text classifier on title.
4. **Model + model number:** category-specific regex packs:
   - Phones: series + model + storage + RAM ("iPhone 15 Pro Max 256GB", "Tecno Camon 30 8/256").
   - Laptops: brand line + CPU + RAM + SSD.
   - TVs: size (inch) + panel + model code.
   - Appliances: capacity (litres, kg, HP) + model code.
5. **Variant attributes:** storage, RAM, colour, size, capacity into `attributes.variant`.
6. **Condition:** from store field or title keywords ("UK used", "London used", "refurbished", "open box").
7. **LLM fallback:** when regex confidence < 0.6 and the listing is in a priority category, call a small text LLM via the same provider-agnostic layer (`TextExtractor` in `@cheapa/ml`) to return strict JSON. Cache by title hash. Daily cap from env (`LLM_EXTRACT_DAILY_CAP`, default 2,000) to protect the lean budget.

**Acceptance:** a labelled set of 500 real titles (`scripts/data/titles-labelled.jsonl`) scores ≥ 90% correct brand and ≥ 80% correct model + storage on phones and laptops.

> **Fashion and beauty** (the primary focus) have their own extraction packs, canonical-product rules and matcher weights in `13-fashion-and-beauty.md` 13.3–13.4. The rules below are the electronics baseline.

## 4.2 Canonical products

A canonical product = brand + model + **exact variant** (storage, size, capacity). Colour is a soft attribute: same canonical product, colour shown per listing.

`slug` example: `apple-iphone-15-pro-256gb`, `tecno-camon-30-8gb-256gb`.

Denormalised on `canonical_products`: `minPriceKobo`, `maxPriceKobo`, `listingCount`, recomputed after each match batch.

## 4.3 Matcher (`apps/worker` `match` queue, logic in `packages/core/src/match/`)

For each new or changed listing:

1. **Exact keys:** GTIN, or brand + model number → attach directly.
2. **Candidate retrieval:** top 20 canonical products by text vector (same category), plus top 20 by image vector.
3. **Score** each candidate:
   - +0.45 text similarity (cosine of title embeddings)
   - +0.35 image similarity
   - +0.20 attribute agreement (brand, model tokens)
   - **Hard veto** (score = 0) if storage, size, capacity or RAM conflict, or brand conflicts. For fashion and beauty use the hard/soft table in `13-fashion-and-beauty.md` 13.4 (clothing/shoe size is soft; audience, pack count, shade, hair length are hard).
   - Weights above are the electronics weights; fashion and beauty weights are in `13-fashion-and-beauty.md` 13.4.
4. **Decide:**
   - score ≥ 0.82 → merge.
   - 0.65–0.82 → merge provisionally and write a `match_reviews` row.
   - < 0.65 → create a new canonical product.
5. Condition never splits a canonical product; it is a filter in results.

Thresholds live in env/config and are tuned against the labelled pairs set.

## 4.4 Review queue (internal tool)

Small page in `apps/web` under `/admin/review` (Clerk role `admin`):
- Shows listing vs candidate side by side (titles, attributes, thumbnails linking to the source).
- Buttons: Merge, Split, Skip. Keyboard shortcuts.
- Decisions update `match_reviews` and are exported weekly to `scripts/data/pairs-labelled.jsonl` to retune thresholds.

**Acceptance:** 1,000 labelled pairs; precision ≥ 95% on auto-merges (wrong merges are worse than missed ones); recall reported.

## 4.5 Outlier and trust flags

Computed per canonical product after matching:
- Listing price < 50% of the group median → `flags.suspectLow` ("check seller").
- Listing not seen in 48 h → `flags.stale` (dimmed in UI); 7 days → hidden.
- Used/refurbished never compared directly against new in the headline "cheapest" figure; headline shows cheapest **new** and cheapest **used** separately.
