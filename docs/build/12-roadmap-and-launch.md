# Roadmap, Gates, Metrics and Launch

Start crawling the big three in the first week of November. Every day of price history makes the Black Friday teaser, the fake-discount check and alerts more credible.

---

## 12.1 Timeline

| Phase | Dates | Build docs | Gate to pass before next phase |
| --- | --- | --- | --- |
| 0 Foundations | Nov 2 – Nov 15, 2026 | 01, 02, 03 | Tier-1 crawl stable 7 days, no silent drops |
| 1 MVP | Nov 16 – Dec 13, 2026 | 04, 05, 06, 07, 10.1, 08.1–8.5 | Top match correct 8 in 10 on the labelled test set |
| 2 v1 | Jan – Feb 2027 | 08, 09.1–9.3, 10.2–10.3 | Users return weekly (retention trending up) |
| 3 Scale | Mar – Apr 2027 | 09.4, 10.4 | B2B design partners signed |

Key dates:
- **Nov 2:** repo + VPS up; apply to Jumia, Konga, Temu affiliate programs.
- **Nov 8:** Jumia, Konga, Jiji adapters crawling nightly.
- **Nov 26:** Black Friday web teaser live (Black Friday is Nov 27, 2026).
- **Dec 1:** Android closed beta (30–50 testers).
- **Dec 14:** public Play Store launch + web upload search; iOS shortly after review.

## 12.2 Success metrics

| Metric | MVP target (proposed) |
| --- | --- |
| Top-match accuracy (labelled set; fashion = exact item in top 3 or acceptable lookalike in top 5) | ≥ 80% |
| Auto-merge precision | ≥ 95% |
| Search latency p50 / cache hit | < 5 s / < 300 ms |
| Searches with ≥ 1 outbound click | 30% |
| Tier-1 freshness (seen < 48 h) | 95% |
| Crash-free sessions | ≥ 99% |
| Weekly returning users | Track from launch, trend up |
| Cost per search vs revenue per search | Revenue ≥ cost by end of v1 |

## 12.3 MVP launch checklist

**Product**
- [ ] Share-sheet flow works on Android 10+ and iOS 16+ from a closed app
- [ ] 10–15 stores live, tier-1 freshness ≥ 95%
- [ ] Labelled test set accuracy gate passed
- [ ] Affiliate links tested end to end with a real click per network
- [ ] Empty states and "Tell us where you saw it" working

**Trust and legal**
- [ ] `/privacy`, `/terms`, `/bot`, `/affiliate-disclosure` live
- [ ] Image deletion verified (no image bytes on disk or in logs)
- [ ] Opt-out flow tested

**Ops**
- [ ] Backups restore-tested
- [ ] Alerts firing to Telegram/email
- [ ] Sentry receiving from api, worker, mobile, web with source maps; scrubber test passing
- [ ] PostHog funnel `search_started → search_completed → listing_clicked` populated
- [ ] Vision daily cap and fallback tested

**Growth**
- [ ] Play Store listing with share-flow screenshots
- [ ] 10 short videos: "Snap it on Instagram, found it ₦40k cheaper" for TikTok/Instagram/X
- [ ] SEO product pages indexed (sitemap submitted)
- [ ] December gifting campaign: "Before you pay, Cheapa am"

## 12.4 Decision log (`docs/build/DECISIONS.md` seed)

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

## 12.5 Still open

- [ ] Affiliate rates and terms (after applications are reviewed)
- [ ] Domain: `cheapa.ng` / `cheapa.com.ng` / `getcheapa.com` availability, and a trademark search for "Cheapa"
- [ ] Premium price point (set after v1 usage data)
