# Jumia source notes

Adapter: `jumia` (`packages/adapters/src/jumia/`)
Store: https://www.jumia.com.ng/
Verified: 2026-11-12 by Claude (CheapaBot, signed out), for the owner to re-check
robots.txt: crawling **explicitly permitted** for bots that identify themselves with an owner URL and stay under 200 requests/minute ("Bots with fake user-agent will be blocked"; contact `techops at jumia com` for more). `User-agent: *` disallows: site search (`/*q=`), sort (`/*sort=`, `/*dir=`), every facet filter (`/*size=`, `/*color=`, `/*price=`, `/*gender=`, ...), `/fragment/*` (sponsored-product blocks), `/catalog/`, `/customer/`, `/cart/`, `/mobapi/`, `*--*` multi-brand pages, any path three or more levels deep (`/*/*/*/`), and the `/*/fashion/`, `/*/generic/` brand pages. Plain category pages with `?page=N` are allowed.
Terms note: robots.txt is Jumia's stated bot policy; we stay well inside it (CheapaBot UA with https://cheapa.ng/bot, one IP, `maxRps` 2 = 120/min).
Departments: clothing, shoes, bags & accessories, jewellery, watches, hair, beauty (this sweep); electronics later
Rendering: html with embedded JSON, no browser needed

## Best list source
- Endpoint: `GET https://www.jumia.com.ng/<category-slug>/` and `?page=N`
- The HTML embeds every product card as JSON: `<script>window.__STORE__={...};</script>`, key `products` (40 per page). We parse that, not the HTML cards.
- Pagination: `?page=N`; the last page is in `<a ... class="pg" aria-label="Last Page" href="/<slug>/?page=50#catalog-listing">`. **Jumia never pages past 50**, so at most 2,000 products per category: broad categories (dresses has 16,085) are swept through their narrower children.
- Items per page: 40
- Required headers: none (plain GET with the CheapaBot UA)
- Category slugs: `https://static.jumia.com.ng/categories-sitemap.xml.gz` (12,659 entries, from the sitemap index in robots.txt). The women-first list we sweep is `START_PATHS` in `index.ts` (42 categories).
- Measured 2026-11-12 with the real `discover` through PoliteHttp: ~1,100 pages ≈ **44,000 products per sweep** (target 10,000), ~10 min at `maxRps` 2. Many narrow beauty slugs (`lipstick-makeup`, `foundation-primers-makeup`, `eyeshadow-makeup`, `womens-necklaces`) hold one or two products, so we sweep their parents (`lips-make-up`, `eyes-makeup`, `nail-makeup`, `womens-jewelry-fashion-d`).

## Product detail source
- Not needed for the sweep: the list JSON carries everything below. Product pages (`/<slug>-<id>.html`) also have JSON-LD; use them later for GTINs if the matcher needs them.

## Field mapping
| Cheapa field | Source path (`__STORE__.products[]`) | Notes |
| --- | --- | --- |
| externalId | `sku` | e.g. `BR325MW7H927TNAFAMZ`; stable per product |
| title | `displayName` (falls back to `name`) | `displayName` = brand + name |
| priceKobo | in-stock `simples[].prices.price`, else `displayPrices.price`, else `prices.price` | sizes can differ in price; only sizes still in stock count. Several in-stock prices = `priceKind: 'from'` |
| oldPriceKobo | `prices.oldPrice` | strike-through; kept only when above the current price |
| inStock | `isBuyable` and any `simples[].isBuyable` | no sold-out product appeared in the sample; sold-out shows per size |
| imageUrl | `images[0].img` (520×520), else `image` (300×300) | `ng.jumia.is` CDN URL; never re-hosted |
| condition | not given | Jumia sells new by default; the normalizer reads "refurbished/renewed" from titles |
| brand | `brand` | "Generic"/"Fashion" are dropped by the normalizer |
| categoryPath | `categories` | e.g. `Fashion > Women's Fashion > Clothing > Dresses > Casual Dresses` |
| sizes | `simples[].name` where `isBuyable` | "EU 38", "US 8.5", "EU L", "CH XL", "M/L", "ONE SIZE FITS ALL". Colours, lengths and seller junk in this field are ignored |
| sponsored | `isSponsored` | always false in server HTML: sponsored blocks load from `/fragment/sp/...`, which robots.txt disallows, so we never see them |
| attributes | `sellerId`, `isShopExpress` → `jumiaExpress`, `badges.main.identifier == 'JMALL'` → `officialStore`, `badges.campaign.name` → `campaign`, `rating.average/totalRatings`, sold-out sizes → `soldOutSizes` | seller id only; no seller names on list pages |

## Live search (for query time)
- **Not allowed**: robots.txt disallows `/*q=` (site search). `liveSearch` stays unimplemented for Jumia; query-time freshness comes from the nightly sweep. (03 §3.6 assumed Jumia search would be usable; it isn't.)

## Gotchas
- 50-page cap per category (see above).
- Pages are ~0.7–1.9 MB of HTML. On a slow link a few hit the 20 s PoliteHttp timeout and succeeded on retry; watch the crawl report's error rate after the first VPS sweep.
- A product can sit in two swept categories (e.g. a jewellery set under earrings and fashion jewellery); the upsert by SKU makes that harmless.
- Multipacks are common in fashion: "Cotton Pant 6pcs", "12 Pairs of Mixed Set Earring Set", "5pcs Set ... Watches". The count stays in the title; the normalizer sets `packCount`.
- Size names are seller-entered: wigs put colours or lengths there ("1B # (Including Website)", "20 inches"), which we ignore as sizes.
- Same product in several colours = separate SKUs (`relatedProds` links them), each its own listing.
- `csrfToken` and `loginUrl` are in the state: never stored in fixtures or listings.
- Fixtures are real pages trimmed to `__STORE__` products + the pagination link; `derived-sold-out.html` is a real product with buyable flags flipped (no sold-out sample existed).

## Adapter checklist
- [x] robots.txt and terms reviewed; `stores.crawl_policy.robotsOk` set (seed)
- [x] Fixture saved signed-out in `__fixtures__/` (no cookies, no personal data)
- [x] `START_PATHS` and selectors / field paths filled in
- [x] `pnpm --filter @cheapa/adapters test` passes and the snapshot was reviewed
- [x] Added to `allAdapters` in `packages/adapters/src/all.ts`
