# CLAUDE.md — Cheapa

You are working on **Cheapa**: snap or share a product photo, see every Nigerian online listing for it, cheapest first.

**Primary focus: fashion and beauty for young Nigerian women** (clothing, shoes, bags and accessories, hair, beauty). Electronics are secondary. Results show the exact item cheapest first, then cheaper lookalikes. Read `docs/build/13-fashion-and-beauty.md` before any normalization, matching, search or results work.

Read the relevant `docs/build/*.md` file before any task. If the task conflicts with these rules, stop and ask.

## Repo layout

```
cheapa/
  apps/
    mobile/        Expo (React Native) app — primary client
    web/           Next.js (App Router) — upload search + SEO pages
    api/           NestJS (Fastify adapter) — search, products, /go clicks, users, history, watches, alerts
    worker/        Crawl + process workers — BullMQ consumers
  packages/
    core/          Shared types, normalization, matching, money utils
    db/            Drizzle schemas + migrations for both Postgres databases (catalog/, users/)
    adapters/      Source adapters (one folder per store or platform)
    ml/            Embeddings (CPU, transformers.js) + VisionProvider layer
    config/        eslint, tsconfig, prettier presets
  infra/           docker-compose.yml, Caddyfile, backup scripts
  docs/
    build/         Phase docs (this plan)
    design/        DESIGN.md (tokens, components, screen map) + screens/*.dc.html (UI source of truth)
    sources/       One file per reverse-engineered source
  scripts/         One-off tools (benchmarks, seeders, audits)
```

Turborepo + pnpm workspaces. Node 26 LTS (pinned in `.nvmrc` and `engines`). TypeScript strict everywhere.

Two Redis instances, never mixed up:
- `REDIS_QUEUE_URL` (`redis-queue`: `noeviction`, AOF on) = BullMQ queues, `events:price` stream, rate-limit buckets. Anything that must not be evicted.
- `REDIS_CACHE_URL` (`redis-cache`: `allkeys-lru`, no persistence) = search result cache, live-search cache, catalog lookups. Anything safe to lose.

## Hard rules

1. **Money is integer kobo** (`priceKobo: number`). Never floats. Format only at the UI edge with `formatNaira()` from `@cheapa/core`.
2. **Two Postgres databases, clear split** (same instance, separate databases and roles).
   - `cheapa_catalog` (`@cheapa/db/catalog`) = stores, listings, price history, vectors, canonical products.
   - `cheapa_users` (`@cheapa/db/users`) = users, devices, push tokens, searches, watches, alerts, clicks.
   - Never put catalog tables in the users DB. Never put user PII in the catalog DB.
   - No cross-database foreign keys; reference catalog rows by id only. The worker and adapters get catalog credentials only and must never import `@cheapa/db/users`.
3. **Crawling ethics are non-negotiable** (see `11-compliance-and-ops.md`):
   - Public, signed-out data only. No logins, no captcha solving, no bot-protection bypass, no residential proxy rotation to evade blocks.
   - Respect robots.txt and per-store `crawlPolicy`. Rate limit per domain via the shared limiter. Identify as `CheapaBot/1.0 (+https://cheapa.ng/bot)`.
   - On 403/429 or a challenge page: back off, mark the store `blocked`, alert. Do not work around it.
   - Store facts (price, title, specs, stock, image URL). Never re-host store images or copy descriptions.
4. **Uploaded user images are never persisted.** Process in memory, keep only the hash and extracted query.
5. **Every adapter** implements `SourceAdapter` from `@cheapa/adapters/types` and ships with fixture tests (saved sample responses in `__fixtures__/`). No adapter merges without fixtures.
6. **Vision LLM calls go through `VisionProvider`** in `@cheapa/ml`. Never import a vendor SDK directly in app code.
7. **Results are sorted by match quality, then price.** Sponsored content is labelled and never changes the order.
8. Secrets live in `.env` files, never in code. Add every new variable to `.env.example`.
9. **UI is built from the designs.** Before any UI task, read `docs/design/DESIGN.md` and the matching `docs/design/screens/<Screen>.dc.html`. Use the tokens and components defined there; do not invent colours, fonts, spacing or layouts. A screen with no design gets composed from existing components and flagged for review.

## Conventions

- API: NestJS on `@nestjs/platform-fastify`. One module per domain (`apps/api/src/modules/*`); HTTP in `main.ts`, background consumers in `main.jobs.ts`. Auth via Clerk (`@clerk/backend` JWT guard) plus the `X-Cheapa-Device` anonymous id.
- Validation: `zod` at every boundary (HTTP input, adapter output, env). In NestJS use `ZodPipe` (`apps/api/src/common/zod.pipe.ts`) with schemas from `@cheapa/core`; no `class-validator`. HTTP request/response shapes live in `@cheapa/core` (`api.ts`) so mobile and web share them.
- Logging: `pino` (`nestjs-pino` in the API), structured JSON, include `storeId` / `jobId` / `requestId`. Never log request bodies.
- HTTP: `undici` fetch + `cheerio` for HTML. Use Playwright **only** when a page truly needs JS; flag it in the source doc.
- Errors: Sentry everywhere (`@sentry/nestjs` in `apps/api`, `@sentry/node` in `apps/worker`, `@sentry/react-native`, `@sentry/nextjs`). Product analytics: PostHog (`posthog-node` server-side, `posthog-react-native`, `posthog-js`). Neither ever receives image bytes, request bodies, phone numbers or emails: identify by user id or anonymous device id only. Both use their EU data regions.
- Tests: `vitest` (with `unplugin-swc` in `apps/api` for decorator metadata). Adapters get fixture tests; core logic gets unit tests; matcher gets a labelled-pairs test set.
- Styling: mobile uses NativeWind; web uses Tailwind + shadcn/ui. Shared design tokens in `packages/config/tokens.ts`.
- Commits: conventional commits (`feat(adapters): add jumia search adapter`).
- Branches: one branch per feature/section, always cut from the latest `main`, named `feat/<section>-<slug>` (e.g. `feat/1.1-monorepo-scaffold`), or `fix/…`, `docs/…`, `chore/…`. Commit locally on the branch; the owner pushes to GitHub, opens the PR and merges. Never commit directly to `main` after the initial commit, and never push.
- Keep functions small; no file over ~300 lines without a reason.

## Definition of done (every task)

- Typecheck, lint and tests pass: `pnpm turbo run typecheck lint test`.
- New env vars documented. New tables migrated with Drizzle.
- The phase doc's acceptance criteria for that section are met and listed in your summary.
- No TODOs left in shipped paths unless logged in `docs/build/BACKLOG.md`.

## Brand

- Name: **Cheapa**. Tone: friendly, Nigerian, direct ("Wetin you wan buy? Snap am.").
- Look: deep green-black ink `#0E1A13`, ground `#F4F5EF`, lime savings accent `#C6F432` (always with ink text), link green `#0A7A3A`.
- Type: Bricolage Grotesque (display and prices), Geist (UI text), Geist Mono (small uppercase labels).
- Full tokens and components: `docs/design/DESIGN.md`. Visual canvas (owner only): https://claude.ai/artifact/9r8DJYZBkQp2cfkpNkJa51
- Currency always shown as `₦1,250,000`.
