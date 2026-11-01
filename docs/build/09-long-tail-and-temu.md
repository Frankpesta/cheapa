# Phase 2–3 — Long-Tail Stores, Temu and the Vendor Portal (Jan – Apr 2027)

Goal: reach "every Nigerian online store" by platform, not one store at a time, and add cross-border catalogs through affiliate feeds.

Context: WooCommerce dominates Nigerian e-commerce sites, and Store Leads counted 15,129 live WooCommerce stores in Nigeria (Oct 23, 2026) plus 1,454 live Shopify stores in Lagos alone. Many Woo sites are not product retailers (services, jobs, schools), so classification matters.

---

## 9.1 Platform adapters (`packages/adapters/src/platform/`)

One adapter per platform covers every store on it. Each must still pass through `PoliteHttpClient` and honour robots.txt.

| Platform | List source to verify | Notes |
| --- | --- | --- |
| WooCommerce | Store API `GET /wp-json/wc/store/v1/products?per_page=100&page=N` (public, unauthenticated on most stores) | Prices come in minor units with `currency_minor_unit`; convert to kobo carefully. Fallback: product sitemap + JSON-LD |
| Shopify | `GET /products.json?limit=250&page=N` | Variants carry price and availability; one listing per variant that differs on storage/size |
| Wix | Product sitemaps + JSON-LD on product pages | Slower; weekly |
| OpenCart / Magento / others | Sitemaps + JSON-LD; Magento sometimes exposes GraphQL product search | Only if store passes discovery scoring |
| Bumpa / Selar / other Nigerian builders | Investigate during discovery; document in `docs/sources/platform-<name>.md` | Could unlock many Instagram-first vendors with a storefront link |

Rules:
- If a platform endpoint is disabled on a store, fall back to sitemap + JSON-LD; never brute-force.
- Skip stores whose prices are not in NGN (or convert only if the store explicitly sells to Nigeria in USD).

**Acceptance:** Woo and Shopify adapters ingest 50 real Nigerian stores each with fixture tests for variant handling and price units.

## 9.2 Store discovery pipeline (`discovery` queue)

1. **Seed candidates:** public store directories and reports, search results for "buy <category> Nigeria", .ng/.com.ng domains found in listings and social bios, "Tell us where you saw it" submissions from users, vendor sign-ups.
2. **Fingerprint platform:** HTML/headers markers (`wp-content` + `woocommerce`, `cdn.shopify.com`, `wixstatic`, etc.).
3. **Classify:** is it a physical-goods retailer selling in naira? (product count ≥ 10, NGN prices, cart present). Small LLM call on homepage text when uncertain (counts toward `LLM_EXTRACT_DAILY_CAP`).
4. **Score** (product count, category value, freshness, robots allowance) → `stores.status = 'candidate'`.
5. **Approve:** auto-approve high scores; borderline ones go to `/admin/discovery`.
6. Approved stores get tier 3 and a weekly schedule, staggered.

**Acceptance:** discovery processes 1,000 candidate domains/day on the lean VPS; precision of auto-approved stores ≥ 90% on a manual sample of 100.

## 9.3 Temu via affiliate feed (never scraped)

Temu's search, category browsing and full product detail sit behind login/captcha, and it runs aggressive anti-bot defences. Under Cheapa's rules that means no scraping.

Plan:
1. Apply to the Temu Affiliate Program as a **business publisher / price comparison site** (price comparison sites are a named partner type; the program runs in 80+ countries and pays per order plus app-install bonuses).
2. Ask the affiliate manager for catalog/product-feed or API access for Nigeria.
3. Build `affiliate:temu` adapter against whatever feed format is granted (CSV/JSON/API), with affiliate deeplinks stored per listing.
4. Label Temu listings "Ships from abroad" with estimated delivery days if the feed provides them.
5. Treat Temu as replaceable: Nigeria's NDPC opened a data-protection probe into Temu in February 2026.

Repeat the same approach for AliExpress and Shein only through their official affiliate programs. **Shein is a priority for the fashion focus**: apply in Phase 0 alongside Temu (`13-fashion-and-beauty.md` 13.8).

**Acceptance:** blocked until approval; when granted, daily feed ingest with affiliate links verified by a test click.

## 9.4 Vendor portal (Phase 3)

For Instagram/WhatsApp vendors and small shops without a crawlable site (social platforms are login-walled and out of scope for crawling).

- `/sell` on web: vendor signs up (Clerk), verifies business phone, adds store name, city, delivery areas.
- Catalog input: CSV upload template, or connect a Woo/Shopify store URL (auto-detected), or add products manually with photos (vendor-owned images, stored in R2 with their consent).
- Listings marked "Listed by vendor". Moderation queue for new vendors; auto-hide on reports.
- Free listing; paid "Featured seller" placement (labelled) is the revenue hook.

## 9.5 If a store blocks Cheapa (partnerships only if blocked)

1. Stop crawling immediately (status `blocked`), keep existing history read-only, hide its listings after 7 days.
2. Email their e-commerce/partnerships contact with traffic stats ("we sent you N clicks last month") and offer: official feed, affiliate deal, or opt-out.
3. Record the outcome in `docs/sources/<store>.md`.
