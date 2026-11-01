# Phase 1–2 — User Side on NestJS + Postgres: Accounts, History, Clicks, Watches, Alerts

Clicks and search history ship in Phase 1 (needed at launch). Watches, alerts and the fake-discount check ship in Phase 2 (Jan 2027).

Goal: users can see their search history, watch a product and get told when the price drops; every outbound click is attributed for affiliate revenue. All of this is served by the one NestJS API (`apps/api`) and stored in a **separate Postgres database, `cheapa_users`**, never in the catalog database.

---

## 8.1 Architecture

One NestJS app, one Docker image, two processes:

| Compose service | Entry | Runs |
| --- | --- | --- |
| `api` | `apps/api/src/main.ts` | HTTP only (Fastify adapter): search, products, `/go`, `/me/*`, webhooks, admin |
| `api-jobs` | `apps/api/src/main.jobs.ts` | No HTTP. Price-event consumer, `notify` and `clicks` BullMQ processors, scheduled jobs (digests, retention, receipt checks) |

Splitting the processes keeps alert bursts and digest sends from adding latency to search.

Modules (`apps/api/src/modules/`):

| Module | DB access | Responsibility |
| --- | --- | --- |
| `health` | both | `GET /health` (catalog DB, users DB, redis-queue, redis-cache) |
| `auth` | users | Clerk JWT guard, device guard, `@Public()`, `@Roles('admin')`, `@CurrentUser()`, Clerk webhook |
| `search` | catalog (read) + users (write history) | `POST /search/image`, `POST /search/text` (see `05-visual-search.md`) |
| `products` | catalog | `GET /products/:slug`, `/products/:id/history`, `/products/:id/deal` |
| `go` | catalog (read) + users (write) | `GET /go/:listingId` click + affiliate redirect |
| `users` | users | `/me`, devices, push tokens, account deletion |
| `searches` | users | Search history |
| `watches` | users (+ catalog read for current price) | Watch CRUD, plan limits |
| `alerts` | users (+ catalog read) | Price-event consumer, rules, throttling |
| `notifications` | users | Expo push, Resend email, WhatsApp later |
| `admin` | catalog | Review queue, stores, discovery APIs for `/admin` web pages |

Framework rules:
- `@nestjs/platform-fastify`; multipart via `@fastify/multipart` with `request.file()` → `toBuffer()` (5 MB limit). **Uploads stay in memory; never `saveRequestFiles`, never temp files.**
- Validation with zod through `ZodPipe` (`apps/api/src/common/zod.pipe.ts`), schemas shared from `@cheapa/core`. No `class-validator`.
- Logging with `nestjs-pino`; request id on every log line; request bodies never logged.
- Config via the typed `API_ENV` provider (`apps/api/src/config`), loaded once with the zod env loader from `@cheapa/core`.
- Two Drizzle clients injected by token: `CATALOG_DB` and `USERS_DB`. A module only imports the token it is allowed to use (table above). A lint rule (`no-restricted-imports`) blocks `@cheapa/db/users` from `apps/worker` and `packages/adapters`.
- Errors to Sentry via `@sentry/nestjs` and product events to PostHog via the `AnalyticsModule` (`01-foundation.md` 1.7). Both processes (`api`, `api-jobs`) initialise Sentry; failed `notify`/`clicks` jobs are reported after their final retry.
- Rate limiting: the existing Redis token-bucket guard (`01-foundation.md` 1.5), keyed by user or device first, IP as a high backstop.

## 8.2 Users database (`packages/db/src/users/`, Drizzle)

Separate database `cheapa_users` on the same Postgres instance, its own role `cheapa_app`, its own `drizzle.users.config.ts` and migrations folder (`packages/db/migrations/users/`). The worker and adapters only get catalog credentials.

Catalog references (`productId`, `listingId`, `storeId`) are plain `uuid` columns. **No cross-database foreign keys**; the API resolves them against the catalog when it needs titles or prices.

```ts
users: id (uuid), clerkId (unique), email (nullable), phone (nullable, E.164),
  city (nullable), whatsappOptIn (bool, default false), plan ('free'|'premium'),
  role ('user'|'admin'), createdAt, updatedAt

devices: id (uuid), anonId (uuid, unique), userId (nullable -> users, on delete set null),
  platform ('android'|'ios'|'web'), appVersion, firstSeenAt, lastSeenAt

push_tokens: id, userId -> users (cascade), deviceId -> devices (cascade), token (unique),
  platform, createdAt, lastUsedAt, invalidatedAt (nullable)

searches: id (uuid, = search requestId), userId (nullable, cascade), deviceId (nullable, cascade),
  imageHash (nullable, sha-256 hex), query, detected (jsonb), resultProductIds (uuid[]),
  source ('camera'|'share'|'gallery'|'text'|'link'), latencyMs (int), createdAt
  INDEX(userId, createdAt desc); INDEX(deviceId, createdAt desc)

watches: id (uuid), userId -> users (cascade), productId (uuid), productSlug, productTitle,
  condition ('new'|'used'|'any'), targetPriceKobo (int|null), baselinePriceKobo (int),
  lastNotifiedPriceKobo (int|null), lastNotifiedAt (nullable), active (bool), mutedUntil (nullable), createdAt
  UNIQUE(userId, productId, condition); partial INDEX(productId) WHERE active

alerts: id (uuid), watchId -> watches (cascade), userId -> users (cascade), productId, listingId,
  storeName, oldPriceKobo, newPriceKobo, channel ('push'|'email'|'whatsapp'),
  status ('queued'|'sent'|'failed'), error (nullable), createdAt, sentAt (nullable)
  INDEX(userId, createdAt desc); UNIQUE(watchId, listingId, newPriceKobo, channel)   -- idempotent replays

clicks: id (uuid, = affiliate sub-id), userId (nullable), deviceId (nullable), listingId, productId,
  storeId, affiliateNetwork (nullable), searchRequestId (nullable), createdAt
  INDEX(storeId, createdAt); INDEX(createdAt)
```

Money is integer kobo throughout. Uploaded images are never stored; `imageHash` only.

## 8.3 Auth and identity

- **Signed-out:** the app generates an `anonId` (uuid) on first launch, keeps it in SecureStore (web: `localStorage`), and sends it as `X-Cheapa-Device` on every request. `DeviceGuard` upserts `devices` and attaches `req.device`.
- **Signed-in:** Clerk session token in `Authorization: Bearer`. `ClerkAuthGuard` verifies it with `@clerk/backend` `verifyToken` using `CLERK_JWT_KEY` (networkless) and upserts `users` just-in-time on first request.
- **Linking:** `POST /me/link-device` after sign-in sets `devices.userId`, reassigns that device's anonymous `searches` to the user, and calls PostHog `alias(deviceId → userId)`.
- **Webhook:** `POST /webhooks/clerk` (svix signature check with `CLERK_WEBHOOK_SECRET`) handles `user.updated` (email/phone sync) and `user.deleted` (runs 8.10).
- **Roles:** `role = 'admin'` gates `/admin/*` routes via `@Roles('admin')`. The role comes from a custom session-token claim: in the Clerk dashboard (Sessions → Customize session token) add `{"role": "{{user.public_metadata.role}}"}`, then set `public_metadata.role = "admin"` on staff accounts. Unknown values are ignored.
- **Access levels:** every route requires a signed-in user unless marked `@Public()` (health, search, products) or `@DeviceOrUser()` (`/me`, history). A Bearer token that fails verification is 401 even on public routes. Without `CLERK_JWT_KEY` (local, before keys exist) Bearer requests get 503 and everything signed-out still works.
- **Profile data:** email is copied from Clerk once, when the user row is created. The phone number is **not** copied: it's stored only with explicit WhatsApp opt-in (11.2).

Endpoints (all zod-validated):

| Method + path | Auth | Purpose |
| --- | --- | --- |
| `GET /me` · `PATCH /me` | user | Profile, city, WhatsApp opt-in |
| `DELETE /me` | user | Delete account and data (8.10) |
| `POST /me/link-device` | user + device | Merge anonymous history |
| `POST /me/push-tokens` · `DELETE /me/push-tokens/:token` | user | Register / remove Expo push token |
| `GET /me/searches?cursor=` · `DELETE /me/searches/:id` · `DELETE /me/searches` | user or device | History screen |
| `GET /me/watches` · `POST /me/watches` · `PATCH /me/watches/:id` · `DELETE /me/watches/:id` | user | Watches |
| `GET /me/alerts?cursor=` | user | Alert history |

## 8.4 Click tracking (Phase 1, needed at launch)

`GET /go/:listingId?s=<searchRequestId>`:
1. Load the listing + store affiliate config from the catalog (`redis-cache`, 10 min).
2. Generate `clickId` (uuid v7) in-process and build the outbound URL (affiliate template, sub-id = `clickId`, see `10-monetization.md`).
3. Enqueue a `clicks` job (BullMQ, ~1 ms) and **302 immediately**. The `api-jobs` processor inserts the row with retries. The redirect never waits on Postgres.
4. Unknown or hidden listing → 302 to the store homepage if known, else 404 page.

## 8.5 Search history (Phase 1)

After the search response is sent, `SearchModule` writes a `searches` row (id = `requestId`) for the user or device. Server-side only; clients never write history. History is returned paged, newest first; the app groups by day (WAT).

## 8.6 Price-change alerts (Phase 2)

1. The worker emits `price.changed` to `redis-queue` stream `events:price` (`02-crawler-core.md` 2.4) with `{ listingId, productId, storeId, storeName, condition, oldPriceKobo, newPriceKobo, inStock, observedAt }`. Events with no `productId` (not yet matched) are skipped.
2. `api-jobs` reads the stream with consumer group `alerts` (`XREADGROUP`, batches of 100). It drops events whose `productId` is not in the watched-products set (in-memory, refreshed every 5 min from `SELECT DISTINCT productId FROM watches WHERE active`). Stuck entries are reclaimed with `XAUTOCLAIM`. Entries are `XACK`ed only after the DB transaction commits.
3. For each remaining event, in one transaction per watch (`SELECT … FOR UPDATE` on the watch row):
   - Match condition: `any`, or `new` ↔ `new`, or `used` ↔ `used | uk_used | refurbished`. Ignore out-of-stock prices.
   - Notify if `newPrice <= targetPriceKobo`, or (no target) if it is ≥ 5% below `lastNotifiedPriceKobo ?? baselinePriceKobo`.
   - Throttle: max 1 alert per watch per 12 h (`lastNotifiedAt`); max 5 alerts per user per WAT calendar day; skip if `mutedUntil` is in the future.
   - Insert `alerts` rows (one per enabled channel, `status = 'queued'`), update `lastNotifiedPriceKobo` / `lastNotifiedAt`, enqueue `notify` jobs.
4. Thresholds (`ALERT_DROP_PCT`, `ALERT_WATCH_COOLDOWN_H`, `ALERT_USER_DAILY_MAX`) live in env with the defaults above.

## 8.7 Notification channels (lean budget order)

| Channel | Phase | Notes |
| --- | --- | --- |
| Push (Expo push service, `expo-server-sdk`) | v1 launch | Free; primary. Check receipts after 15 min; `DeviceNotRegistered` → set `push_tokens.invalidatedAt` |
| Email (Resend) | v1 launch | Free tier; instant or daily digest (repeatable job 08:00 WAT) |
| WhatsApp (Business Cloud API) | Premium, later | Paid per business-initiated message; only for premium users with `whatsappOptIn` |

`notify` jobs retry 3 times with exponential backoff, then mark the alert `failed`.

Message template: "Price drop: Tecno Camon 30 (256GB) is now ₦289,000 at Jumia (was ₦312,000). Tap to see all stores." Prices formatted with `formatNaira()`.

## 8.8 Watch UX

- "Watch price" on product pages (mobile + web) → sign-in if needed → optional target price (defaults to 5% below current cheapest). `POST /me/watches` stores `baselinePriceKobo` = current cheapest for the chosen condition, read from the catalog.
- `GET /me/watches` returns each watch with current cheapest and change since watching (catalog lookup batched by `productId`).
- Free plan: up to `FREE_WATCH_LIMIT` (5) active watches, enforced in `WatchesService` (403 `{ code: 'WATCH_LIMIT' }`). Premium: unlimited + WhatsApp + instant alerts (see `10-monetization.md`).

## 8.9 Fake-discount check (v1)

`GET /products/:id/deal` in `ProductsModule` (catalog only, no user data; `redis-cache`, 1 h) reads 30 days of `price_history`:
- "Real deal": current price is the lowest in 30 days and ≥ 10% below the 30-day median.
- "Normal price": within ±5% of the median.
- "Inflated discount": the store's strike-through price was never observed in the last 30 days.

## 8.10 Account deletion and retention

`DELETE /me` (and the Clerk `user.deleted` webhook), in one users-DB transaction:
- Delete the `users` row; cascades remove watches, alerts and push tokens.
- Delete the user's `searches` and their linked `devices`.
- Anonymise the user's `clicks` (`userId`, `deviceId` → null) so affiliate reconciliation still balances; nothing left links to the person.
- Then delete the Clerk user via the Clerk Backend API (retry job on failure) and the PostHog person for that `distinct_id` via the PostHog API.

Retention job (daily): delete anonymous `searches` older than `SEARCH_RETENTION_DAYS` (default 180) and `devices` unseen for the same period with no user.

## 8.11 Env vars (add to `.env.example`)

`USERS_DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_WEBHOOK_SECRET`, `EXPO_ACCESS_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM`, `ALERT_DROP_PCT`, `ALERT_WATCH_COOLDOWN_H`, `ALERT_USER_DAILY_MAX`, `FREE_WATCH_LIMIT`, `SEARCH_RETENTION_DAYS`.

## 8.12 Testing

- Vitest with `unplugin-swc` (NestJS needs decorator metadata, which esbuild does not emit).
- Unit: alert rules, throttling, condition matching, deal classification.
- E2E: `@nestjs/testing` + Testcontainers (Postgres with both databases, both Redis instances); Clerk tokens signed with a test key.

**Acceptance (Phase 1 parts):** `/go` returns 302 in < 50 ms p50 and the click row appears; a search writes one `searches` row; anonymous history moves to the user on link; the catalog role cannot connect to `cheapa_users`.

**Acceptance (phase):** an end-to-end test changes a fixture price and a watching test user receives exactly one push and one email; replaying the same stream entry sends nothing new; throttle rules verified by unit tests; `DELETE /me` leaves no row referencing the user.
