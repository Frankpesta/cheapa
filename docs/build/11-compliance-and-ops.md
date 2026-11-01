# Compliance and Operations (all phases)

Goal: Cheapa survives only if stores tolerate it and users trust it. These rules are fixed. Claude Code must not "optimise" around them.

---

## 11.1 Crawl policy (enforced in code)

| Rule | Where enforced |
| --- | --- |
| Public, signed-out pages and endpoints only | Adapter review checklist; no cookie jars for auth |
| No captcha solving, no bot-protection bypass, no proxy rotation to evade blocks | `PoliteHttpClient` has no proxy option; `Blocked` stops the store |
| robots.txt honoured | `PoliteHttpClient` |
| Max 1 req/s per domain by default, never above 3 | Redis limiter |
| Crawl heavy sweeps 01:00–05:00 WAT | Scheduler |
| Identify as `CheapaBot/1.0 (+https://cheapa.ng/bot)` | `PoliteHttpClient` |
| Store facts only; no re-hosting images or copying descriptions | Schema has no image blob or description column |
| Opt-out and takedown within 48 h | `/bot` page + `stores.status = 'paused'` |

Adapter review checklist (PR template):
- [ ] Source doc in `docs/sources/` with robots/terms notes
- [ ] Uses only `ctx.http`
- [ ] No auth headers, cookies or tokens from a logged-in session
- [ ] Fixtures stripped of personal data
- [ ] Rate within policy

## 11.2 Privacy (Nigeria Data Protection Act 2023)

- **Images:** processed in memory and deleted; keep SHA-256 hash and extracted query only.
- **Minimal data:** search works without an account; phone collected only for WhatsApp alerts with explicit opt-in.
- **Separation:** user data only in the `cheapa_users` database; catalog only in `cheapa_catalog`. Separate roles; crawl workers have no access to user data; the users backup is encrypted.
- **Third parties:** vision LLM providers receive the image; choose providers that do not train on API data by default and state this in the privacy policy.
- **People in photos:** fashion screenshots often show a person wearing the item. The vision prompt describes the item only; no face detection, recognition or description of people, and crops sent for embedding are the item box only. Nothing is stored either way.
- **Sentry and PostHog** are processors named in the privacy policy. EU regions only; they receive pseudonymous ids (user id / device id) and event metadata, never images, image hashes, query text, phone numbers or emails. No session replay. Scrubbing is enforced in code and unit-tested (`01-foundation.md` 1.7).
- **Rights:** in-app "Delete my account and data" (`DELETE /me` deletes the user, devices, searches, watches, alerts and push tokens, anonymises clicks so nothing links back to the person, and deletes the PostHog person; see `08-user-side.md` 8.10).
- **Registration:** check NDPC registration requirements as user numbers grow; appoint a data protection contact.
- **Jiji and seller data:** store seller display names only; never phone numbers or addresses.

## 11.3 Monitoring

| Signal | Alert when |
| --- | --- |
| Store item count | Drops > 40% vs 7-day median |
| Store error rate | > 10% of requests in a run |
| Store status | Becomes `blocked` |
| Freshness (tier 1) | < 95% of listings seen in last 48 h |
| Search p50 latency | > 5 s for 15 min |
| Vision spend | 80% of daily cap |
| Disk | > 80% on VPS |
| Backups | Nightly dump missing (either database) |
| Alert pipeline | `events:price` consumer lag > 15 min, or notify failures > 5% in an hour |
| New error spike | Sentry issue alert: new issue in `api`/`worker`, or > 50 events/hour on one issue |

Uptime check on `api.cheapa.ng/health` (free uptime monitor). Errors to Sentry free tier (alerts routed to the same Telegram/email channel); product metrics and funnels in PostHog.

## 11.4 Runbooks (`docs/runbooks/`)

- `store-blocked.md`: stop, verify, notify, partnership email template (see `09-long-tail-and-temu.md` 9.5).
- `adapter-broken.md`: capture new fixture, diff against old, fix parse, backfill.
- `vision-provider-down.md`: switch `VISION_PROVIDER` to fallback, verify, post-mortem.
- `restore-db.md`: restore latest dump to a fresh VPS, re-point DNS.
- `takedown-request.md`: pause store within 48 h, confirm by email.

## 11.5 Lean budget plan (~$50–150/month)

| Item | Plan | Rough cost |
| --- | --- | --- |
| VPS (Postgres, Redis, worker, API, web) | 1 × 4 vCPU / 8 GB | $15–30 |
| Backups | R2 or B2 object storage | < $5 |
| Vision LLM | Cheapest benchmark winner, cache, daily cap | $20–80 (capped) |
| Text LLM extraction | Daily cap 2,000 calls | $5–15 |
| Clerk, Expo EAS, PostHog, Sentry, Resend | Free tiers (watch Sentry's monthly error quota; sample and rate-limit noisy errors) | $0 |
| Domain | cheapa.ng or alternative | ~$15–40/yr |

Scale triggers: add a second VPS for workers when crawl windows overrun 4 hours; add a GPU box only when B2B revenue or premium covers it.
