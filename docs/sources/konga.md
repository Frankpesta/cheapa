# Konga source notes

Adapter: none. **Status: blocked, partnership track** (03 §3.1, CLAUDE.md rule 3)
Store: https://www.konga.com/
Verified: 2026-11-12 by Claude (CheapaBot, signed out), for the owner to re-check
robots.txt: could not be read. `GET https://www.konga.com/robots.txt` with the CheapaBot UA returned **403**, a Cloudflare "Sorry, you have been blocked" page (WAF block, not a JS challenge).
Terms note: not reviewed further; a site that blocks our identified bot at the edge has said no.

## What we did not do (and must not)
- Retry with a browser user agent, a headless browser, other IPs or proxies.
- Use Konga's hosted search backend (03 §3.3 suggested checking for one) from outside the site: that would route around the block.
- Scrape cached copies or mirrors of Konga pages.

## Next steps (owner)
- Ask Konga for access: an affiliate/product feed or an allow-listed crawler (CheapaBot UA, https://cheapa.ng/bot, published rate limit). Contact via their partner/marketplace channels.
- If they allow-list us, re-run discovery from 03 §3.1 and build the adapter with `pnpm gen:adapter konga --domain www.konga.com`.
- Until then: `stores.status = 'blocked'`, `crawl_policy.robotsOk = false` (seed), so the scheduler never touches it.

## Effect on the plan
- 03 §3.3 acceptance (5,000+ Konga listings per sweep) cannot be met by crawling. Fashion and beauty coverage comes from Jumia, Jiji and the tier-2 stores (03 §3.5) instead.
- No Konga `liveSearch` (03 §3.6).
