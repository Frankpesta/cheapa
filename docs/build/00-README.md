# Cheapa — Build Docs for Claude Code

**Cheapa** lets a Nigerian shopper snap or share a photo of any product and see every listing for it across Nigerian online stores, cheapest first. The primary audience is young women shopping for fashion and beauty: she sees a dress, wig or bag on Instagram, shares the screenshot, and sees who sells that exact item cheapest, then cheaper lookalikes.

> Pitch: See it anywhere. Snap it. Find who sells it cheapest in Nigeria.

These files turn the PRD into a phase-by-phase build plan you feed to Claude Code. Each phase file has goals, exact deliverables, file paths, schemas, and acceptance criteria.

---

## Locked decisions (Nov 1, 2026)

| Decision | Choice | Consequence |
| --- | --- | --- |
| Product name | **Cheapa** | Package scope `@cheapa/*`, app id `ng.cheapa.app` (confirm domain + trademark before launch) |
| Platforms | Mobile-first (Expo) + Next.js web | Share-sheet screenshot flow is the hero feature |
| Vision LLM | **Provider-agnostic** | One `VisionProvider` interface + a benchmark script; the winner on cost × accuracy becomes default |
| Infra budget | **Lean, ~$50–150/month** | One VPS (Docker Compose: Postgres+pgvector, Redis, workers, API), CPU embeddings, free tiers elsewhere |
| Store partnerships | **Only if blocked** | Crawl public data politely; open partnership talks only when a store objects or blocks |
| Temu | Affiliate program feed, **never scraped** | Temu adapter waits on affiliate approval |
| KORB | Parked | Nothing shared yet; Cheapa is standalone |
| Focus | **Fashion and beauty first** (clothing, shoes, bags & accessories, hair, beauty); electronics secondary | Matching, vision prompt, taxonomy, store list and copy tuned for fashion; lookalikes are a core feature (`13-fashion-and-beauty.md`) |
| Backend | **One NestJS API + Postgres** (no Convex) | Search and user side in `apps/api`; user data in a separate `cheapa_users` database; Clerk for auth |
| Observability | **Sentry + PostHog** (EU regions, free tiers) | Errors/crashes in Sentry, product analytics in PostHog; no PII or image data in either |

Still open (cannot be decided yet):
- Affiliate rates and terms for Jumia, Konga, Temu (known after applications are reviewed).
- Domain availability for `cheapa.ng` / `cheapa.com.ng` / `getcheapa.com`.

---

## File map

| File | What it covers | Phase |
| --- | --- | --- |
| `CLAUDE.md` | Repo conventions Claude Code must follow every session | All |
| `01-foundation.md` | Monorepo, Docker Compose infra, Postgres schema, env | 0 |
| `02-crawler-core.md` | Adapter interface, queue, scheduler, politeness, health | 0 |
| `03-tier1-adapters.md` | Jumia, Konga, Jiji adapters + reverse-engineering workflow | 0 |
| `04-normalization-matching.md` | Attribute extraction, canonical products, matcher | 1 |
| `05-visual-search.md` | Embeddings, vision provider layer, Search API, benchmark | 1 |
| `06-mobile-app.md` | Expo app, camera, share sheet, results UI | 1 |
| `07-web-app.md` | Next.js upload search, SEO product pages, Black Friday teaser | 1 |
| `08-user-side.md` | NestJS + Postgres user side: auth, history, clicks, watches, alerts | 1–2 |
| `09-long-tail-and-temu.md` | Platform adapters, store discovery, Temu affiliate feed, vendor portal | 2–3 |
| `10-monetization.md` | Affiliate links, sponsored slots, premium, B2B | 1–3 |
| `11-compliance-and-ops.md` | Crawl policy, NDPA privacy, monitoring, runbooks | All |
| `13-fashion-and-beauty.md` | Fashion/beauty focus: categories, matching rules, lookalikes, vision and UI changes | All |
| `12-roadmap-and-launch.md` | Dates, gates, metrics, launch checklists | All |
| `design/DESIGN.md` | Design tokens, components, screen map, copy rules | 1 |
| `design/screens/*.dc.html` | The 15 designed phone screens (UI source of truth) | 1 |

Design canvas (visual, owner sign-in required): https://claude.ai/artifact/9r8DJYZBkQp2cfkpNkJa51. Claude Code cannot open that link, so it builds from the files in `design/`.

---

## How to use these with Claude Code

1. Create the repo, put `CLAUDE.md` at the root, copy the `0X-*.md` files to `docs/build/`, and copy the `design/` folder to `docs/design/`.
2. Work one phase file at a time. Start each session with:
   > Read `CLAUDE.md` and `docs/build/0X-<file>.md`. Implement section N only. Stop when its acceptance criteria pass and summarize what changed.
3. Do one section per session. Commit after each one passes.
4. Never let Claude Code skip acceptance criteria. Run them yourself on a real device for anything mobile.
5. When reverse-engineering a store, use your reverse-engineering skill and save findings to `docs/sources/<store>.md` before writing the adapter (see `03-tier1-adapters.md`).

## Timeline at a glance

| Phase | Dates | Outcome |
| --- | --- | --- |
| 0 Foundations | Nov 2 – Nov 15, 2026 | Big-three crawlers live, price history accumulating |
| 1 MVP | Nov 16 – Dec 13, 2026 | Snap + share search, app + web, 10–15 stores; Nov 27 web teaser |
| 2 v1 | Jan – Feb 2027 | Long tail (Woo/Shopify), Temu feed, alerts, fake-discount check |
| 3 Scale | Mar – Apr 2027 | Vendor portal, B2B dashboard, data API, Chrome extension |
