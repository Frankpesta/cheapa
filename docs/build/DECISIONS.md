# Decisions

Append-only. Newest at the bottom. Seeded from `12-roadmap-and-launch.md` 12.4.

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-01 | Name: Cheapa | Short, playful, Nigerian take on "cheaper" |
| 2026-11-01 | Vision LLM provider-agnostic + benchmark | Choose on measured cost × accuracy, switch freely |
| 2026-11-01 | Lean infra (~$50–150/mo), CPU embeddings | Prove demand before spending |
| 2026-11-01 | Partnerships only if blocked | Move fast on public data; talk when a store objects |
| 2026-11-01 | Temu via affiliate feed only | Search/detail are login/captcha-gated; no bypassing |
| 2026-11-01 | KORB parked | Focus on one product |
| 2026-11-01 | No Convex: one NestJS API (Fastify) for search and user side; Clerk kept for auth | One backend, one deploy, one framework; no extra vendor |
| 2026-11-01 | User data in a separate Postgres database (`cheapa_users`) | Keeps the catalog/PII split: crawl and B2B code can't reach user data |
| 2026-11-01 | Sentry (errors) + PostHog (analytics), EU regions, free tiers | Crash-free and funnel metrics from day one; pseudonymous ids only |
| 2026-11-01 | Node 26 LTS | Current Active LTS; matches dev machines |
| 2026-11-01 | Two Redis instances: queue (noeviction, AOF) and cache (LRU) | BullMQ jobs must never be evicted; caches should be |
| 2026-11-01 | Build locally first; hosting and deploy decided later | Ship features before infra spend |
| 2026-11-01 | One branch per feature off `main`; owner pushes and merges | Reviewable PR per section |
| 2026-11-01 | Fashion and beauty for young women is the primary focus; electronics secondary | Target audience shops fashion/beauty from Instagram and WhatsApp screenshots |
| 2026-11-01 | Results: exact item first, then lookalikes as a core section | Fashion rarely has an exact twin across stores |
| 2026-11-01 | Embeddings stored as `halfvec` with HNSW cosine indexes | Half the memory and disk of `vector` on the lean VPS; recall loss negligible for this use |
| 2026-11-01 | Money columns `bigint` kobo | `integer` caps at ₦21.4M |
| 2026-11-01 | `price_history` partitioned by month in a hand-written migration | drizzle-kit can't manage partitions; history is the one asset we can't re-crawl |

## Deferred

- Hosting provider/region, deploy pipeline, staging (decide before first VPS deploy).
- Price-history backups: nightly `pg_dump` vs WAL archiving (PITR) to R2/B2.
- Image embedding model: CLIP vs FashionCLIP vs Marqo-FashionSigLIP (benchmark per `13-fashion-and-beauty.md` 13.6).
