# Phase 1 — Web App (Next.js) (Nov 18 – Dec 13, 2026)

Goal: a web version for upload search, SEO pages that bring free traffic ("iPhone 15 price in Nigeria"), and a Black Friday teaser live by **Nov 27, 2026**.

Design: use the tokens, type and component rules in `docs/design/DESIGN.md`. Web screens mirror the mobile designs in `docs/design/screens/` (results, product, sign-in), widened into a max 1120 px container; restyle shadcn/ui components with the Cheapa tokens rather than shipping shadcn defaults.

Stack: Next.js (App Router), Tailwind, shadcn/ui, TanStack Query (against the NestJS API), Clerk, `@sentry/nextjs`, `posthog-js` (EU host; pageviews + the same search/click events as mobile; cookieless until consent, autocapture and session recording off). Hosting: Vercel Hobby during development only (non-commercial terms); before affiliate links go live, move to a paid plan or run `next start` on the VPS behind Caddy (fits the lean budget).

---

## 7.1 Black Friday teaser (ship by Nov 26)

Smallest useful thing while the full MVP is built:
- `/` landing: "Is that Black Friday deal real?" Text search over Jumia, Konga and Jiji listings.
- `/p/[slug]` product page: all current listings cheapest first + **"Price 2 weeks ago"** from `price_history` (data collected since Phase 0 started).
- Badge rules: if current price ≥ the 14-day minimum, show "Not the lowest we've seen"; if the old/strike-through price was never observed, show "Original price not seen in our data".
- Email capture: "Get the app when it launches" (Resend audience).

**Acceptance:** 200+ product pages live with at least 10 days of history; Lighthouse mobile performance ≥ 85.

## 7.2 Upload search (MVP)

- `/search`: drag-and-drop or file picker, paste image from clipboard (Ctrl/Cmd+V), mobile camera via `<input type="file" accept="image/*" capture>`.
- Client-side resize to 1080px before upload.
- Results page mirrors the mobile layout (see `06-mobile-app.md` 6.3).

## 7.3 SEO product pages

- Route: `/p/[slug]` (e.g. `/p/apple-iphone-15-pro-256gb`).
- Server-rendered with ISR (revalidate 6 h); only canonical products with ≥ 2 listings get indexed.
- Content: H1 "Apple iPhone 15 Pro 256GB price in Nigeria", cheapest new/used, store table, price history chart (Recharts), last updated time, short spec summary generated from attributes (no copied store descriptions).
- JSON-LD `Product` with `AggregateOffer` (lowPrice, highPrice, offerCount, priceCurrency NGN).
- Category hubs, fashion first: `/c/dresses`, `/c/sneakers`, `/c/handbags`, `/c/wigs`, `/c/skincare` (plus `/c/phones`, `/c/laptops`), with "cheapest this week" lists. H1 pattern for fashion: "Black satin slip dress price in Nigeria".
- `sitemap.xml` generated from canonical products; `robots.txt` allows all public pages, disallows `/admin`, `/go`.
- Open Graph image per product (`@vercel/og` or Satori) showing "From ₦X at N stores".

## 7.4 Admin area (`/admin`, Clerk role `admin`)

- `/admin/review` match review queue (see `04-normalization-matching.md` 4.4).
- `/admin/stores` list stores, tier, status, last crawl, items, errors; buttons to pause/resume or mark `blocked`.
- `/admin/discovery` approve/reject candidate long-tail stores (Phase 2).

## 7.5 Legal pages

`/privacy`, `/terms`, `/bot` (what CheapaBot does, how stores opt out, contact email), `/affiliate-disclosure`.

**Acceptance (phase):** web upload search works on mobile browsers; 1,000+ indexed product pages by Dec 13; `/bot` page live before crawling scales.
