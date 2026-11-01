# Backlog

TODOs allowed in shipped paths must be logged here with file path and reason.

| Added | Path | Item | Why deferred |
| --- | --- | --- | --- |
| 2026-11-01 | `pnpm-workspace.yaml` catalog | Upgrade TypeScript 6.0 → 7.x | typescript-eslint 8.72 supports TypeScript < 6.1 only; bump both when typescript-eslint adds 7.x support |
| 2026-11-01 | `infra/` | VPS provisioning README (Ubuntu 24.04, ufw 22/80/443, fail2ban), Caddy service, `backup.sh` (both DBs, users dump encrypted, R2/B2 upload) | Hosting and deploy deferred by owner; local compose done in 1.3 |
| 2026-11-01 | `infra/docker-compose.yml` | `api`, `api-jobs`, `worker` services | Added with 1.5 (API) and 02 (worker) |
| 2026-11-01 | `apps/worker` scheduler | Daily job calling `select ensure_price_history_partitions(3)` | Worker scheduler lands in 02 §2.3; migration pre-creates 4 months, so the first gap would be 2027-03 |
| 2026-11-01 | monitoring (11.3) | Alert when next month's `price_history` partition is missing | Monitoring lands with 02 §2.5 |
| 2026-11-01 | `apps/worker` | Sentry (`@sentry/node`, shared scrubber from `@cheapa/core`) and failed-job capture with `storeId`/`jobId` | Worker entry point lands in 02 §2.3 |
| 2026-11-01 | CI (1.8) | Create Sentry release + upload API source maps on `main` (`SENTRY_AUTH_TOKEN`) | CI is section 1.8 |
