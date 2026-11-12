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
