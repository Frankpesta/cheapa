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
| 2026-11-02 | Crawl rate limit = per-domain slot reservation in redis-queue (token bucket of capacity 1) | Exact 1/maxRps spacing across all workers, no bursts, no polling |
| 2026-11-02 | robots.txt: 404/other 4xx = allow all; 5xx/unreachable = disallow all for 1 h; 403/429 or a challenge page on robots.txt = `Blocked` | RFC 9309 for the first two; a refused robots.txt is treated as a block, never crawled through |
| 2026-11-02 | Redirects followed by hand; every hop rate limited and robots-checked | A redirect must not skip another host's limits or rules |
| 2026-11-12 | Taxonomy and word lists are TypeScript (`packages/core/src/normalize/taxonomy.ts`, `lexicon.ts`), not `taxonomy.json` | Ordered regex leaves need comments and type checks; first match wins, specific before broad |
| 2026-11-12 | `events:price` is at-least-once: entries are added inside the upsert transaction, before commit | A Redis failure rolls the upsert back and the job retries; a lost event would never be re-detected. Consumers dedupe on (listingId, observedAt) |
| 2026-11-12 | Unseen 7 days → `inStock=false` after a successful sweep (with history + event); unseen 30 days → hidden at query time (`LISTING_HIDDEN_DAYS`) | 02 §2.4. 04 §4.5's "7 days → hidden" read as: out-of-stock listings drop out of default results |
| 2026-11-12 | `gen:adapter` never registers the adapter; a guard test fails any adapter folder without fixtures | A half-built adapter must not reach the scheduler; rule 5 enforced by the build, not by memory |
| 2026-11-12 | Jumia: parse the embedded `window.__STORE__` JSON on category pages, not the HTML cards; no `liveSearch` | The JSON carries SKU, brand, category path, per-size price and stock. robots.txt disallows site search (`/*q=`), so 03 §3.6's Jumia live search is not allowed |
| 2026-11-12 | A multi-size price counts only sizes still in stock (`from` when they differ) | A "From ₦X" whose cheapest size sold out is not a price anyone can pay (13 §13.2) |
| 2026-11-12 | Konga is blocked: partnership track, no adapter | Cloudflare answers CheapaBot with 403 "you have been blocked", even on robots.txt. Rule 3: no other UA, browser, proxy or search-backend route around it (docs/sources/konga.md) |
| 2026-11-12 | Jiji via its listing API (`/api_web/v1/listing`), `sort=new`, ≤1,000 pages per category | robots.txt allows it; JSON is ~40 KB a page. Jiji serves only 1,000 pages, so newest-first gives each sweep a stable window of the freshest 20,000 ads per category |
| 2026-11-12 | Jiji fixtures are anonymised (seller names, user ids, free text) | Private sellers; descriptions can carry phone numbers. Ad facts stay verbatim |
| 2026-11-12 | Platform adapters split products only on hard options; size and colour stay on one listing | 13 §13.4 (09 §9.1 said one listing per size/storage variant, which is the electronics rule). A "Size" whose values are ml/g is hard |
| 2026-11-12 | A store is refused unless its platform API prices in NGN (Shopify `/meta.json` currency, Woo `currency_code`) | 09 §9.1. A ₦ symbol on the home page isn't enough: crypsbeauty shows ₦ but its API answers in USD |

## Deferred

- Hosting provider/region, deploy pipeline, staging (decide before first VPS deploy).
- Price-history backups: nightly `pg_dump` vs WAL archiving (PITR) to R2/B2.
- Image embedding model: CLIP vs FashionCLIP vs Marqo-FashionSigLIP (benchmark per `13-fashion-and-beauty.md` 13.6).
