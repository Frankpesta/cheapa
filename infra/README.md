# Infra

Local development runs the same `docker-compose.yml` the VPS will use (`01-foundation.md` 1.3).

| Command            | What it does                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `pnpm infra:up`    | Start Postgres (`cheapa_catalog` + `cheapa_users`), `redis-queue`, `redis-cache`; waits until healthy |
| `pnpm infra:check` | Verify roles/isolation, pgvector ≥ 0.8, pg_trgm, Redis eviction/persistence, localhost-only ports     |
| `pnpm infra:logs`  | Follow logs                                                                                           |
| `pnpm infra:down`  | Stop (data kept)                                                                                      |
| `pnpm infra:reset` | Stop and **delete all local data** (needed after changing DB passwords in `.env`)                     |

First time: `cp .env.example .env`, replace every `change-me-*` (the same password appears in the matching `*_DATABASE_URL`), then `pnpm infra:up && pnpm infra:check`.

If a local Postgres already uses 5432, set `POSTGRES_PORT=5433` and update both database URLs.

`postgres/init/01-databases.sh` runs only on an empty volume. It creates both databases and roles, revokes cross-database `CONNECT`, and installs `vector` and `pg_trgm` in the catalog.

Not here yet: `api`/`api-jobs` services (1.5), `worker` (02), Caddy, VPS provisioning and backups (deferred with hosting, see `docs/build/BACKLOG.md`).
