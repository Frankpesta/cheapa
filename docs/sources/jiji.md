# Jiji source notes

Adapter: `jiji` (`packages/adapters/src/jiji/`)
Store: https://jiji.ng/ (classifieds: private sellers and shops, haggle prices)
Verified: 2026-11-12 by Claude (CheapaBot, signed out), for the owner to re-check
robots.txt: `User-agent: *` disallows only `/test/*`, `/admin/*`, `/crm/*`, `/auth/facebook*`. (Sort, query and period parameters are disallowed for Bingbot only.) The listing API under `/api_web/` is allowed. `/llms.txt` describes the site and its categories for automated readers.
Terms note: no published crawl-rate guidance; we use `maxRps` 1, one IP, the CheapaBot UA. Seller phone numbers and contact flows are never touched (they need login anyway).
Departments: clothing, shoes, bags, clothing accessories, wedding wear, jewellery, watches, hair, makeup, skin care, fragrance, body care. Never vehicles or property.
Rendering: json (listing API), no browser needed

## Best list source
- Endpoint: `GET https://jiji.ng/api_web/v1/listing?slug=<category>&sort=new&webp=true&page=N` (what the category pages call for "next page"; returns JSON).
- The category HTML (`/clothing`) carries the same first page inside Nuxt's `__NUXT_DATA__` payload; the API is simpler and ~40 KB a page.
- Params: `slug` category, `sort=new` newest first (stable order), `webp=true` image format, `page`.
- Pagination: `adverts_list.total_pages`; **Jiji serves pages 1–1,000 only** (page 1,001 answers `{"status":"redirect","url":"/clothing"}`), so at most 20,000 ads per category. Newest-first means each sweep sees the freshest 20,000; older ads age out via the 7-day unseen rule.
- Items per page: 20, of which 7–13 are paid "TOP" ads pinned on every page.
- Required headers: none (`Accept: application/json` sent anyway).
- Sizes on 2026-11-12 (pages): clothing 1,547 (→1,000), bags 928, shoes 739, accessories 648, fragrance 545, bath-body 368, skin-care 323, watches 268, hair-beauty 264, jewellery-and-watches 251, wedding-wear 78, makeup 43. **~5,450 pages ≈ 109,000 ads a sweep**, ~1.5 h at `maxRps` 1. (03 §3.4 target: 5,000.)
- Slugs that don't exist: `jewelry`, `jewellery`, `make-up`, `womens-watches`, `clothing-accessories` (404).

## Product detail source
- Ad pages (`/<region>/<category>/<slug>-<guid>.html`) hold the condition and full description; not fetched (descriptions are never stored, and the list has what we need).

## Field mapping
| Cheapa field | Source path (`adverts_list.adverts[]`) | Notes |
| --- | --- | --- |
| externalId | `id` | numeric ad id |
| title | `title` | often a shop name ("Lily Fashion", "Midey Empire"): kept as is; image and category carry the match |
| priceKobo | `price_obj.value` × 100 | naira integer. No value ("Contact for price") or a `period` (rent) = skipped |
| oldPriceKobo | — | classifieds have none |
| inStock | always true | an ad on the list is live; unseen ads go out of stock after 7 days |
| imageUrl | `images[0].url`, else `image_obj.url` | `pictures-nigeria.jijistatic.net` webp; never re-hosted |
| condition | not on the list | the normalizer reads thrift / okrika / "UK used" / "brand new" from titles; used beauty is dropped |
| brand | — | none on the list |
| categoryPath | the swept category's breadcrumb (`ref.meta.path`) | e.g. `Fashion > Women's Fashion > Women's Clothing` |
| sizes | `attrs[name=Size].value` | "XL, XXL, 3XL", "One Size / No Size", shoes "39, 40.5" (EU) |
| audience | `attrs[name=Gender].value` | Women's / Men's / Unisex; `/clothing` mixes all three |
| sellerName | `seller.user_name` | present for shops only; display name only, never phone or address |
| region | `region_item_text` | "Lagos, Ikeja" (show the buyer's city first, 03 §3.4) |
| sponsored | `is_top` / `is_boost` / `as_top` | paid placements: labelled, never change the order (rule 7) |
| attributes | `user_id` → `sellerId`, `labels[type=id_verify]` → `verifiedSeller`, "Bulk prices" attr → `bulkPrices`, `repostKey` | |

## Dedupe (03 §3.4)
- `repostKey` = hash(seller id, cleaned title, price). Reposts on the same page collapse to the first copy in `parse`. Cross-page and cross-day reposts keep their own listings carrying the same `repostKey`; phase 05 adds the image phash to the key and the search side collapses them (BACKLOG).

## Live search (for query time)
- `GET https://jiji.ng/api_web/v1/listing?query=<text>&webp=true` (verified 2026-11-12: "satin slip dress" → 8 ads, one page, same JSON as category pages). robots.txt restricts `query` for Bingbot only.
- `jijiAdapter.liveSearch` keeps Jiji's relevance order and only ads in the categories we sweep (each with its own breadcrumb); vehicles, property and services never come through.
- Fixture: `search-satin-slip-dress.json` (anonymised like the others).

## Gotchas
- 1,000-page cap per category (above).
- TOP ads repeat on every page: the upsert by ad id makes that harmless; they're flagged `sponsored`.
- The Gender attribute is seller-entered and sometimes wrong ("Men's Quality Shoes" tagged Women's); it still wins over title guesses.
- Hair titles use Nigerian spellings ("Bonestraight", "Deepwave", "5by5", "30-Inch"); the normalizer handles them.
- Fixtures are anonymised: seller names → "Seller N", user ids remapped, `details` / `short_description` / `message_url` emptied (free text can hold phone numbers). `derived-repost-and-no-price.json` adds a repost and a no-price ad built from real ones.

## Adapter checklist
- [x] robots.txt and terms reviewed; `stores.crawl_policy.robotsOk` set (seed)
- [x] Fixture saved signed-out in `__fixtures__/` (no cookies, no personal data)
- [x] Categories and field paths filled in
- [x] `pnpm --filter @cheapa/adapters test` passes and the snapshot was reviewed
- [x] Added to `allAdapters` in `packages/adapters/src/all.ts`
