# Tier-2 stores (03 §3.5)

Nigerian fashion, hair and beauty stores checked on 2026-11-12 by Claude with CheapaBot (signed out, robots.txt checked by PoliteHttp before every request, 1 request/second). Candidates came from web searches, a Zikoko list of Nigerian women's brands, blog lists of Nigerian online fashion stores, and StoreCensus's list of Nigerian WooCommerce beauty stores. For the owner to re-check before production.

## Crawled (seeded as tier 2, nightly)

| Store | Domain | Platform | What | Size |
| --- | --- | --- | --- | --- |
| Brandlistry Nigeria | www.brandlistry.ng | Shopify | beauty marketplace | ~19,600 products |
| Kuddy Cosmetics | kuddycosmetics.com | Shopify | beauty chain, 15 shops | ~1,300 products |
| Garm Island | garmisland.com | Shopify | fashion | ~8,500 products |
| Shop Maju | shopmaju.com | Shopify | women's fashion brand | ~265 products |
| Okriks | okriks.com | WooCommerce | thrift women's wear, lingerie | ~2,800 products |
| Mesh Hairline | www.meshhairline.com | WooCommerce | wigs, frontals | ~66 products |
| Essentials Hub | essentialshub.com | WooCommerce | skincare, beauty | ~990 products |

About 33,500 products a night across the seven, all in NGN.

## Not crawled

| Store | Domain | Why |
| --- | --- | --- |
| Zit Nigeria | zit.ng | `/products.json` answers 403: blocked, never worked around |
| Garmspot | garmspot.com | 403 on every request: blocked |
| Cryps Beauty | crypsbeauty.com | Store API prices in USD although the site shows ₦: refused (09 §9.1) |
| Bawsty | bawsty.com | Built on **Bumpa** (Nigerian store builder): no platform adapter yet (09 §9.1, BACKLOG) |
| Crystal Beauty Hub | crystalbeautyhub.com | Sells peptide pens and service bookings, not fashion or beauty retail |
| 5KShop, Grey Velvet | 5kshop.ng, greyvelvet.ng | robots.txt unreachable: PoliteHttp treats that as "disallow all" |
| 5KShop (.com), Dexstitches, Paxo Beauty | 5kshop.com, dexstitches.com, paxobeauty.com | Custom platforms (no Shopify or Store API JSON); need their own discovery |
| Dhaveena, Beauty Frenzy | dhaveenastores.com, thebeautyfrenzy.com | robots.txt unreachable |

## Next
- 09 §9.2 discovery pipeline to grow this list automatically (platform fingerprint + scoring). 09 §9.1's acceptance (50 stores per platform) needs it.
- Bumpa platform adapter (Instagram-first vendors use it).
