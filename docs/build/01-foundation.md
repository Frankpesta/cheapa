# Phase 0 — Foundation (Nov 2 – Nov 8, 2026)

Goal: a working monorepo and a single lean VPS running Postgres + pgvector, two Redis instances, the worker and the API. The same `docker-compose.yml` runs locally (Docker Desktop) for development. Everything later builds on this.

Budget target for this phase: **one VPS (4 vCPU / 8 GB RAM / 160 GB SSD class, roughly $15–30/month)** plus free tiers (Expo EAS, Clerk, Sentry, PostHog). Vercel Hobby is for non-commercial use only, so move the web app to a paid plan or self-host it before affiliate links go live.

---

## 1.1 Monorepo scaffold

Create with pnpm + Turborepo:

```
apps/mobile  apps/web  apps/api  apps/worker
packages/core  packages/db  packages/adapters  packages/ml  packages/config
infra/  docs/build/  docs/sources/  scripts/
```

- `packages/config`: shared `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`), eslint flat config, prettier.
- Root scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `db:generate`, `db:migrate` (both run for the catalog and users databases).
- `turbo.json` pipelines with correct `dependsOn` and outputs.

**Acceptance:** `pnpm i && pnpm turbo run typecheck lint test` passes on empty packages.

## 1.2 `@cheapa/core` basics

- `money.ts`: `toKobo(nairaString)`, `formatNaira(kobo)`, parsing for "₦1,250,000", "N1.25m", "1250000", "₦ 45,000.00". Unit tests for each format.
- `types.ts`: `Condition = 'new' | 'used' | 'uk_used' | 'refurbished' | 'unknown'`, `RawListing`, `NormalizedListing`, `StoreTier = 1|2|3|4|5`.
- `env.ts`: zod env loader used by every app.

**Acceptance:** money parser handles 15+ real price strings collected from Jumia, Konga and Jiji pages.

## 1.3 Infra (Docker Compose on the VPS)

`infra/docker-compose.yml` services:

| Service | Image | Notes |
| --- | --- | --- |
| postgres | `pgvector/pgvector:pg16` | Volume-mounted, tuned for 8 GB RAM (`shared_buffers=2GB`). Init script creates two databases with separate roles: `cheapa_catalog` (role `cheapa_catalog`) and `cheapa_users` (role `cheapa_app`); `cheapa_catalog` has no `CONNECT` on `cheapa_users` |
| redis-queue | `redis:7-alpine` | `maxmemory-policy noeviction`, AOF on. BullMQ, `events:price` stream, rate-limit buckets (`REDIS_QUEUE_URL`) |
| redis-cache | `redis:7-alpine` | `maxmemory 512mb`, `allkeys-lru`, no persistence. Search and lookup caches (`REDIS_CACHE_URL`) |
| api | built from `apps/api` (NestJS, `main.ts`) | HTTP, port 8080 behind Caddy. Gets both database URLs |
| api-jobs | same image as `api` (`main.jobs.ts`) | No HTTP: price-event consumer, notify/clicks queues, scheduled jobs (see `08-user-side.md` 8.1) |
| worker | built from `apps/worker` | Concurrency from env. Catalog database URL only |
| caddy | `caddy:2` | TLS for `api.cheapa.ng` |

Also:
- `infra/backup.sh`: nightly `pg_dump` of **both** databases (users dump encrypted with `age` before upload), compressed, keep 7 days locally, push to cheap object storage (Backblaze B2 or Cloudflare R2).
- `infra/README.md`: provisioning steps (Ubuntu 24.04, ufw allow 22/80/443 only, Docker, fail2ban).

**Acceptance:** `docker compose up -d` on a fresh VPS brings all services healthy; `/health` on the API returns catalog DB, users DB, redis-queue and redis-cache status.

## 1.4 Catalog schema (`@cheapa/db/catalog`, Drizzle, database `cheapa_catalog`)

The users database schema lives in `08-user-side.md` 8.2. Each database has its own Drizzle config and migrations folder (`packages/db/migrations/catalog/`, `packages/db/migrations/users/`).

```ts
stores: id (uuid), name, domain (unique), platform ('custom'|'woocommerce'|'shopify'|'wix'|'opencart'|'magento'|'affiliate'|'vendor'),
  tier (int), status ('active'|'paused'|'blocked'|'candidate'|'rejected'), crawlPolicy (jsonb: { robotsOk, maxRps, notes }),
  affiliate (jsonb|null), lastCrawledAt, createdAt

listings: id (uuid), storeId -> stores, externalId, sourceUrl, title, brand, model, modelNumber, gtin,
  department, category, categoryPath (text[]), variant (jsonb, see @cheapa/core Variant), attributes (jsonb), condition,
  priceKobo (bigint), priceKind ('exact'|'from'|'range'), priceMaxKobo, oldPriceKobo (bigint|null), currency ('NGN'), inStock (bool),
  imageUrl, phash (bigint|null), sellerName, region, sponsored (bool), canonicalProductId (uuid|null),
  search (generated tsvector, 'simple' config), firstSeenAt, lastSeenAt, updatedAt
  UNIQUE(storeId, externalId); INDEX(canonicalProductId); INDEX(lastSeenAt); INDEX(department, category);
  GIN(search); GIN trigram(title)

listing_embeddings: listingId (pk) -> listings, imageVec halfvec(512), textVec halfvec(384), modelVersion text
  HNSW indexes on imageVec and textVec (halfvec_cosine_ops)

price_history: id bigserial, listingId, priceKobo (bigint), inStock, observedAt; PK(id, observedAt)
  Partitioned by month (UTC) on observedAt via a hand-written migration; ensure_price_history_partitions(n)
  creates this month + n ahead. Insert ONLY when price or stock changed.

canonical_products: id, title, department, brand, model, modelNumber, gtin, category, variant (jsonb, hard attributes only), repImageUrl,
  minPriceKobo, maxPriceKobo, listingCount, slug (unique), updatedAt

match_reviews: id, listingId, candidateProductId, score (real), decision ('merge'|'split'|null), reviewer, createdAt

crawl_jobs: id, storeId, adapter, kind ('discover'|'fetch'), status, startedAt, finishedAt, itemsFound, itemsChanged, errors (jsonb)
```

Money columns are `bigint` kobo read as JS numbers (Postgres `integer` tops out at ₦21.4M). Vectors are `halfvec` (half the memory, negligible recall loss). Vector sizes assume CLIP ViT-B/32 image (512) and MiniLM text (384); the fashion model benchmark (`13-fashion-and-beauty.md` 13.6) may change them. If `05-visual-search.md` changes the model, update dims and `modelVersion`.

**Acceptance:** migrations run clean; a seed script inserts 3 stores and 10 fake listings; a cosine query on `imageVec` returns ordered results.

## 1.5 API skeleton (`apps/api`)

- NestJS 12 on `@nestjs/platform-fastify`. Per-argument `ZodPipe` (in-house; `nestjs-zod` doesn't support NestJS 12 yet) with shared schemas from `@cheapa/core/api`, `nestjs-pino` reusing Fastify's pino logger, request id (`genReqId` honours a sane incoming `X-Request-Id`, echoed on every response), CORS for the web origin, typed env provider (`API_ENV`) from the zod env loader.
- Docker image `apps/api/Dockerfile` (Debian slim, not Alpine: onnxruntime-node needs glibc) runs both `api` and `api-jobs`; Compose `app` profile (`pnpm infra:up:app`).
- Two entry points from day one: `src/main.ts` (HTTP) and `src/main.jobs.ts` (application context, no HTTP; empty for now).
- Drizzle providers `CATALOG_DB` and `USERS_DB` in a global `DatabaseModule`.
- Modules stubbed: `health` (`GET /health`), `search` (`POST /search/image`, `POST /search/text`), `products` (`GET /products/:slug`, `GET /products/:id/history`).
- Multipart via `@fastify/multipart`, in memory only (`toBuffer()`, 5 MB cap); never write uploads to disk.
- Rate-limit guard (token bucket on `redis-queue`), keyed by user id or `X-Cheapa-Device` id: anonymous 20 image searches/hour per device, plus a much higher per-IP ceiling (Nigerian mobile carriers put many users behind one IP).
- Vitest with `unplugin-swc` for decorator metadata.

**Acceptance:** stub routes return typed placeholder responses; rate limiter returns 429 after the device limit; an image upload leaves no file on disk.

## 1.6 Users database + Clerk setup (`packages/db/src/users`, `apps/api` `auth` module)

- Create the Clerk application (phone OTP for +234, Google). Add `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_WEBHOOK_SECRET` to `.env.example`.
- Users-DB Drizzle config and first migration with `users` and `devices` (full schema in `08-user-side.md` 8.2; later tables come with their sections).
- `auth` module: `ClerkAuthGuard` (networkless `verifyToken`), `DeviceGuard` (`X-Cheapa-Device`), `@Public()`, `@CurrentUser()`, `@Roles('admin')`.
- `GET /me` returns the user (signed in) or the device record (signed out).

**Acceptance:** mobile and web call `GET /me` signed out (device returned) and signed in (user upserted on first call); an invalid token gets 401; the `cheapa_catalog` role cannot connect to `cheapa_users`.

## 1.7 Observability: Sentry + PostHog

Both on free tiers, both in their **EU data regions** (Sentry `de.sentry.io`, PostHog `eu.i.posthog.com`), one project per app (`api`, `worker`, `mobile`, `web`) so quotas and alerts stay separate.

**Sentry (errors + light tracing)**
- `apps/api`: `@sentry/nestjs`. `instrument.ts` imported first in both `main.ts` and `main.jobs.ts`; `SentryModule.forRoot()` + `SentryGlobalFilter`. Tag every event with `requestId`, `jobId`, `storeId` where present.
- `apps/worker`: `@sentry/node`; capture failed BullMQ jobs (after final retry) with queue, job id and `storeId`. `Blocked` and `RobotsDisallowed` are expected states, not errors: they go to the alert channel, not Sentry.
- Mobile (`@sentry/react-native` with the Expo plugin, source maps uploaded in EAS Build) and web (`@sentry/nextjs`) are wired in their phases (`06`, `07`).
- Privacy settings, same everywhere: `sendDefaultPii: false`; no request bodies, no `Authorization`/cookie headers, no query strings on `/search/*`; a `beforeSend` scrubber drops anything that looks like a phone number or email and strips `data`/`extra` fields holding buffers. No Session Replay. `tracesSampleRate` 0.1 (raise only while debugging latency).
- `release` = git SHA, `environment` = `production` / `development`.

**PostHog (product analytics)**
- `apps/api`: a small `AnalyticsModule` wrapping `posthog-node` (batched, flushed on shutdown, `disableGeoip: false` for city-level only). Server-side events are the source of truth for things the client can't see reliably: `search_served` (source, latencyMs, cacheHit, productCount, visionProvider, lowConfidence), `click_redirected` (storeId, affiliate yes/no), `watch_created`, `alert_sent` (channel), `account_deleted`.
- `distinct_id` = user id when signed in, else the anonymous device id. On `POST /me/link-device`, call `alias` so pre-sign-in events join the user.
- Event properties never include the image, its hash, the raw query text, phone or email. Search queries are reported as category/brand only.
- Mobile and web client events are listed in `06-mobile-app.md` 6.6 and `07-web-app.md`.
- Feature flags (PostHog) are allowed for UI experiments only; **never** for anything that changes result order (rule 7).

Env vars (add to `.env.example`): `SENTRY_DSN_API`, `SENTRY_DSN_WORKER`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_AUTH_TOKEN` (CI source-map upload only), `POSTHOG_API_KEY`, `POSTHOG_HOST`, plus `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY` for the clients.

**Acceptance:** a test route throws and the event appears in Sentry with `requestId` and no body or auth header; a failed worker job appears with `storeId`; a `search_served` event appears in PostHog with no query text or hash; a unit test feeds the scrubber a phone number, email and image buffer and asserts all are removed.

## 1.8 CI

GitHub Actions on push: install, typecheck, lint, test. Cache pnpm store and turbo. On `main`, create a Sentry release and upload source maps for `api` and `worker`.
