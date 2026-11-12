# Phase 0 — Tier-1 Adapters: Jumia, Konga, Jiji (Nov 6 – Nov 15, 2026)

Goal: the three biggest sources crawling daily so price history starts accumulating before Black Friday and December. These are the first real use of your reverse-engineering skill.

Anything below about how a site works is a **hypothesis to verify**. Sites change; the source doc you write is the truth.

---

## 3.1 Reverse-engineering workflow (do this before writing code)

For each store, in a normal browser session (signed out):

1. **Map the surfaces:** home, category page, search results, product page, sitemap (`/sitemap.xml`, `robots.txt` → `Sitemap:` lines).
2. **Watch the network tab** on search and category pages. Look for JSON/XHR/GraphQL calls returning product lists. Note URL, method, query params, pagination, headers that are actually required.
3. **Check product pages for structured data:** `<script type="application/ld+json">` (`Product`, `Offer`), Open Graph tags, embedded state blobs (`window.__INITIAL_STATE__`, `__NEXT_DATA__`).
4. **Check search backends:** hosted search services expose a public search key in the frontend by design. If present, that is usually the cleanest list source.
5. **Read robots.txt and terms.** Record what is allowed.
6. **Save 3–5 real responses** as fixtures (strip cookies and any personal data).
7. **Write `docs/sources/<store>.md`** using the template below, then build the adapter.

Stop and record "blocked" if any step requires logging in, solving a captcha, or defeating bot protection. That source goes to the partnership track (decision: partnerships only if blocked).

### Source doc template (`docs/sources/<store>.md`)

```md
# <Store> source notes
Verified: YYYY-MM-DD by <name>
robots.txt: <allowed paths / disallowed paths>
Terms note: <one line>

## Best list source
- Endpoint: <METHOD URL>
- Params: <name: meaning>
- Pagination: <how>
- Items per page: <n>
- Required headers: <only those actually required>

## Product detail source
- <structured data / endpoint>

## Field mapping
| Cheapa field | Source path | Notes |
| externalId | ... | |
| title | ... | |
| priceKobo | ... | parse with toKobo |
| oldPriceKobo | ... | strike-through price |
| inStock | ... | |
| imageUrl | ... | largest stable URL |
| condition | ... | |
| brand / model / specs | ... | |

## Live search (for query time)
- <endpoint or "not suitable">

## Gotchas
- <variants, sponsored items, seller vs store, currency quirks>
```

---

## 3.2 Jumia adapter

What to investigate:
- Category and search listing pages (product cards carry price, old price, discount, rating, image, SKU).
- Product page JSON-LD for brand, GTIN-like identifiers and offers.
- Whether listing pages expose an embedded JSON state you can parse instead of HTML cards.
- Marketplace sellers vs Jumia-fulfilled items: record seller name and fulfilment flag in `attributes`.
- Sponsored products in listings: flag and dedupe.

Discovery strategy: walk category trees by page, fashion and beauty first (women's clothing, shoes, bags, jewellery, watches, hair, beauty; then men's and kids' fashion), then electronics, phones, computing and appliances as secondary, plus sitemaps for long-tail products. See `13-fashion-and-beauty.md` 13.1.

**Acceptance:** 10,000+ Jumia listings ingested in one nightly sweep within the rate limit; parse tests cover a normal product, a discounted product, an out-of-stock product, a variant product, a multi-size fashion item with a "From" price, and a multipack (`13-fashion-and-beauty.md` 13.2).

## 3.3 Konga adapter

What to investigate:
- The search request the frontend makes (check whether a hosted search API powers it; if so, document the public index name and query shape).
- Product page structured data.
- Konga marketplace sellers and condition labels.

**Acceptance:** same as Jumia, 5,000+ listings per sweep, plus a fixture for a multi-seller product.

## 3.4 Jiji adapter (classifieds)

Jiji is different: user ads, mixed new and used, haggle prices, many duplicates.

What to investigate:
- Listing API used by category and search pages (JSON with ad id, title, price, region, condition, images).
- Region/location fields: stored as a store fact and shown on the listing row ("Lagos, Ikeja"). No buyer-location sorting: Cheapa doesn't collect a city (owner decision 2026-11-12).

Special handling:
- `condition` from the ad ("Brand New", "Foreign Used" = `uk_used`, "Local Used" = `used`).
- Store each ad as a listing with `storeId = jiji` and seller info in `attributes` (seller display name only; no phone numbers).
- Ads without price or with "contact for price" are skipped.
- Dedupe identical ads reposted by the same seller (same title + price + image phash within 7 days).

Scope for MVP: women's and men's clothing, shoes, bags, jewellery and watches, hair and beauty first; then phones, tablets, laptops, TVs/audio, home appliances, video game consoles. Vehicles and property never.

Fashion on Jiji: titles are often shop names ("Thriftbykelly"), so keep the image URL and category path; thrift / okrika / bale = `used`; skip used beauty listings.

**Acceptance:** 5,000+ ads per sweep in the MVP categories; region stored; dedupe test passes.

## 3.5 Tier-2 vertical stores (Phase 1, by Dec 1)

Shortlist to verify during discovery: **Nigerian fashion, hair and beauty online stores first** (find them through discovery; record each in `docs/sources/`), then Slot, Pointek, 3CHUB, Kara (electronics). Groceries are out of scope for now.

For each: detect platform first. If it runs WooCommerce or Shopify, use the platform adapter from `09-long-tail-and-temu.md` instead of a custom one.

Target for MVP launch: **10–15 stores total** across tiers 1–2.

## 3.6 Live search hooks

Implement `liveSearch()` for Jumia and Konga (and Jiji if its search endpoint is simple). The Search API calls these only when indexed results are low-confidence, capped at 1 call per store per search and cached 30 minutes per query.
