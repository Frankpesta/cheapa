# WooCommerce platform source notes

Adapter: `platform:woocommerce` (`packages/adapters/src/woocommerce/`), for every store with `stores.platform = 'woocommerce'`
Verified: 2026-11-12 by Claude (CheapaBot, signed out) on okriks.com, meshhairline.com, essentialshub.com (NGN) and crypsbeauty.com (USD, refused)
robots.txt: WordPress defaults allow `/wp-json/`; PoliteHttp checks every request.
Terms note: the Store API is WooCommerce's public, unauthenticated catalogue API for storefronts.
Rendering: json, no browser needed

## Best list source
- `GET /wp-json/wc/store/v1/products?per_page=100&page=N`
- Pagination: response headers `x-wp-total`, `x-wp-totalpages` (read on page 1 by `discover`), capped at 200 pages.
- Required headers: none. `per_page` must be an integer ≤ 100.
- Fallback when the Store API is disabled (09 §9.1): product sitemap + JSON-LD. Not built yet; such stores fail with a ParseError and show up in the crawl report.

## Field mapping
| Cheapa field | Source | Notes |
| --- | --- | --- |
| externalId | `id` | |
| title | `name` | WordPress HTML entities decoded (`&#8211;`, `&amp;`) |
| priceKobo | `prices.price_range.min_amount`, else `prices.price` | **minor units of `currency_minor_unit`**: unit 2 → "200000" = ₦2,000 (okriks); unit 0 → "27000" = ₦27,000 (essentialshub). Converted with `minorUnitsToKobo` |
| priceKind | `from` when `price_range.max_amount` > min | |
| oldPriceKobo | `prices.regular_price` above the price | exact-price products only |
| currency | `prices.currency_code` must be `NGN` | any other currency fails the page: a store showing ₦ but pricing the API in USD (crypsbeauty) is refused |
| inStock | `is_in_stock` | |
| imageUrl | `images[0].src` | store or Jetpack CDN URL; never re-hosted |
| brand | `brands[0].name` | |
| categoryPath | `categories[].name` | a tag set, not a breadcrumb; combined names ("Tops and Jackets") are settled by the title in the normalizer |
| sizes / colours | `attributes[]` terms: garment-size names → sizes, Color → colours | |
| attributes.options | every other attribute's terms | e.g. wigs: `Available Lengths`, `Frontal Type` |

## Gotchas
- Variable products: the list response has the price range but not each variation's price or stock. Hard options (wig length, frontal type, shade, volume) are recorded in `attributes.options`; one listing per variation needs a Store API call per variation (BACKLOG).
- `is_purchasable: false` or a zero price ("service booking") is skipped.
- Fixtures: real responses trimmed to a few products with `description` / `short_description` removed.
