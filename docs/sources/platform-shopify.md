# Shopify platform source notes

Adapter: `platform:shopify` (`packages/adapters/src/shopify/`), for every store with `stores.platform = 'shopify'`
Verified: 2026-11-12 by Claude (CheapaBot, signed out) on brandlistry.ng, kuddycosmetics.com, garmisland.com, shopmaju.com
robots.txt: Shopify's default robots.txt allows `/products.json` and `/meta.json` (PoliteHttp checks every request; a store that disallows them is skipped). Stores may still block at the edge: zit.ng answers `/products.json` with 403, which we treat as blocked.
Terms note: public storefront JSON that Shopify serves to every visitor; we read product facts only.
Rendering: json, no browser needed

## Best list source
- Store facts: `GET /meta.json` → `currency` (must be `NGN`, else the store is refused: 09 §9.1) and `published_products_count`.
- Products: `GET /products.json?limit=250&page=N`, pages = ceil(count / 250), capped at 200. Deep pages work (brandlistry page 60 of 79: 250 products, 1.2 MB).
- Required headers: none.

## Field mapping
| Cheapa field | Source | Notes |
| --- | --- | --- |
| externalId | `product.id`, or `product.id:variant.id` when split | |
| title | `title` (+ " - " + hard option values when split) | |
| priceKobo | min `variants[].price` over in-stock variants (all if none in stock) | naira decimal strings ("65000.00") × 100; `from` when in-stock prices differ |
| oldPriceKobo | min `compare_at_price` above the price | |
| inStock | any variant `available` | |
| imageUrl | variant `featured_image.src`, else `images[0].src` | `cdn.shopify.com`; some products have none |
| brand | `vendor` unless it's the store's own name ("Shop Maju", "GARM ISLAND") | |
| categoryPath | `[product_type]` when set | often empty: the normalizer falls back to the title |
| sizes / colours | soft options | see below |
| attributes | `productId`, `soldOutSizes`, `option` (hard label) | `body_html` (descriptions) is never stored |

## Variants (13 §13.4)
- **Soft** options stay on one listing: `Title`, `Color/Colour`, and `Size` when every value is a garment/shoe/ring size ("M", "XL", "SMALL", "UK 12", "39", "7").
- **Hard** options split the product into one listing per distinct value, priced from that value's own variants: `Type`, `Shade`, `Length`, `Volume`, and `Size` when its values aren't garment sizes ("50ml", "100ml").
- Sold-out sizes are dropped from `variant.sizes` and kept in `attributes.soldOutSizes`.

## Gotchas
- `vendor` is often the shop itself; only other names are brands (Kuddy sells "Etlee", "Makari").
- Beauty shades named "Color" collapse onto one listing (colour is soft); see BACKLOG.
- Fixtures: real responses trimmed to a few products with `body_html` removed; `-meta.json` keeps name, currency, count and domain only.
