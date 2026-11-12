# Backlog

TODOs allowed in shipped paths must be logged here with file path and reason.

| Added | Path | Item | Why deferred |
| --- | --- | --- | --- |
| 2026-11-01 | `pnpm-workspace.yaml` catalog | Upgrade TypeScript 6.0 → 7.x | typescript-eslint 8.72 supports TypeScript < 6.1 only; bump both when typescript-eslint adds 7.x support |
| 2026-11-01 | `infra/` | VPS provisioning README (Ubuntu 24.04, ufw 22/80/443, fail2ban), Caddy service, `backup.sh` (both DBs, users dump encrypted, R2/B2 upload) | Hosting and deploy deferred by owner; local compose done in 1.3 |
| 2026-11-02 | deploy pipeline | Deploy the `main` build whose source maps CI uploaded (debug ids are injected into `dist/` by `scripts/ci/sentry-release.sh`) and set `APP_VERSION=<commit sha>` on `api`, `api-jobs` and `worker` | Hosting and deploy deferred; the Docker image builds its own `dist/` without debug ids |
| 2026-11-02 | `apps/worker/src/workers.ts` | `embed` and `match` consumers (queues already named in `queues.ts`) | Phases 05 and 04 |
| 2026-11-02 | `apps/worker/src/jobs/discover.ts` | Playwright pool (max 2 browsers) + `fetch-browser` route for `needsBrowser` adapters; until then they fail with a clear error | No adapter needs a browser yet; build with the first one (phase 03) |
| 2026-11-02 | `apps/worker/src/schedule.ts` | Tier-1 hot products every 6 h (products with recent searches or watches) | Needs a search/watch signal from the API (users DB) published to redis-queue; phase 08 |
| 2026-11-12 | `packages/core/src/normalize/` | Brand dictionary (`brands.json`, fashion/hair/beauty + phone brands, aliases), electronics model packs, `TextExtractor` LLM fallback below `LOW_CONFIDENCE`, 500-title labelled set | Phase 04 §4.1; v1 here is fashion-first rules only |
| 2026-11-12 | search (phase 05/06) | Filter out listings with `last_seen_at` older than `LISTING_HIDDEN_DAYS` (30) and show `flags.stale` after 48 h | No listing search query exists yet |
| 2026-11-12 | `apps/worker/src/jobs/process.ts` | Enqueue `match` for new/changed listings | Matcher lands in phase 04 §4.3 |
| 2026-11-12 | ops (11.3) | Sentry issue alerts routed to the Telegram ops chat (Sentry → Alerts → Telegram/webhook integration) | Needs the Sentry org, which the owner hasn't created yet |
| 2026-11-12 | `apps/worker/src/crawl/report.ts` | Admin page with the crawl report table | 02 §2.5 "admin page later"; `pnpm crawl:report` prints it for now |
| 2026-11-12 | Konga (03 §3.3) | Ask Konga for a product feed or an allow-listed crawler; then run discovery and `pnpm gen:adapter konga` | Blocked by Cloudflare; partnership only (docs/sources/konga.md) |
| 2026-11-12 | `packages/adapters/src/jiji/parse.ts` | Cross-page / cross-day repost dedupe: add the image phash to `attributes.repostKey` and collapse same-key listings in search | Needs phash from phase 05; same-page reposts already collapse |
| 2026-11-12 | `packages/adapters/src/woocommerce/` | One listing per variation for hard options (wig length, shade, volume): one Store API call per variation, cached | List response has no per-variation price/stock; options are recorded in `attributes.options` for now |
| 2026-11-12 | `packages/adapters/src/shopify/` | Beauty shades sold under a "Color" option should split (shade is hard for beauty) | Needs the product's department at parse time; colour is soft today |
| 2026-11-12 | `packages/adapters/src/woocommerce/` | Sitemap + JSON-LD fallback when the Store API is disabled (09 §9.1) | No verified store needs it yet |
| 2026-11-12 | platform: Bumpa | `platform:bumpa` adapter (bawsty.com and many Instagram-first vendors) | Needs its own discovery; 09 §9.1 |
| 2026-11-12 | 09 §9.2 | Discovery pipeline (fingerprint, classify, score) to reach 50 stores per platform | 7 tier-2 stores verified by hand (docs/sources/tier2-stores.md) |
| 2026-11-12 | `apps/api/src/modules/search/` (phase 05) | Call `LiveSearchService` on low-confidence searches, upsert live listings into the catalog (they need ids for `/go/:listingId`), and return them with `flags.live` | The search pipeline (5.3) isn't built yet; the hook is ready and tested |
