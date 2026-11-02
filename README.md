# Cheapa

Snap or share a product photo, see every Nigerian online listing for it, cheapest first.

- Conventions and hard rules: [`CLAUDE.md`](CLAUDE.md)
- Build plan: [`docs/build/00-README.md`](docs/build/00-README.md)
- Design spec: [`docs/design/DESIGN.md`](docs/design/DESIGN.md)

## Requirements

- Node 26 (`.nvmrc`), pnpm 12 (`npm i -g pnpm`)
- Docker Desktop (for Postgres and Redis, from `01-foundation.md` 1.3)

## Commands

```sh
pnpm install
pnpm turbo run typecheck lint test   # definition of done
pnpm test:down                       # remove throwaway test containers when finished
pnpm build
pnpm format
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR: install, `format:check`,
then `turbo run typecheck lint test` (tests start Postgres and Redis through Testcontainers on the
runner's Docker). On pushes to `main` it also creates a Sentry release named after the commit SHA
and uploads `api` and `worker` source maps (`scripts/ci/sentry-release.sh`). To turn that on, add
the repo secret `SENTRY_AUTH_TOKEN` and the repo variable `SENTRY_ORG` (optional:
`SENTRY_PROJECT_API`, `SENTRY_PROJECT_WORKER`, default `api` / `worker`). Without them the job is
skipped with a notice.

## Layout

| Path                | What                                                         |
| ------------------- | ------------------------------------------------------------ |
| `apps/api`          | NestJS API: search, products, clicks, users, watches, alerts |
| `apps/worker`       | Crawl and process workers                                    |
| `apps/mobile`       | Expo app (placeholder until phase 06)                        |
| `apps/web`          | Next.js app (placeholder until phase 07)                     |
| `packages/core`     | Shared types, normalization, matching, money                 |
| `packages/db`       | Drizzle schemas + migrations (catalog and users databases)   |
| `packages/adapters` | Source adapters                                              |
| `packages/ml`       | Embeddings + VisionProvider                                  |
| `packages/config`   | tsconfig, eslint, prettier, vitest presets                   |

Workspace packages resolve to their TypeScript source in typecheck and tests (export condition `@cheapa/source`) and to `dist/` at runtime after `pnpm build`.
