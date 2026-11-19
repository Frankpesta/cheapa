/**
 * Outbound URL for /go (10-monetization.md 10.1). `stores.affiliate.linkTemplate` holds
 * `{url}` (the listing URL, encoded) and optionally `{subId}` (the click id). Without
 * `{subId}`, the click id is added as the `subIdParam` query parameter. A bad or inactive
 * template falls back to the plain listing URL: a click must never break.
 */

export interface AffiliateConfig {
  network: string;
  linkTemplate: string;
  subIdParam: string;
  active: boolean;
}

export interface Outbound {
  url: string;
  network: string | null;
}

const isHttp = (u: URL) => u.protocol === 'https:' || u.protocol === 'http:';

export function outboundUrl(
  listingUrl: string,
  affiliate: AffiliateConfig | null,
  clickId: string,
): Outbound {
  if (!affiliate?.active || !affiliate.linkTemplate.includes('{url}'))
    return { url: listingUrl, network: null };
  try {
    const built = new URL(
      affiliate.linkTemplate
        .replaceAll('{url}', encodeURIComponent(listingUrl))
        .replaceAll('{subId}', encodeURIComponent(clickId)),
    );
    if (!isHttp(built)) return { url: listingUrl, network: null };
    if (!affiliate.linkTemplate.includes('{subId}') && affiliate.subIdParam) {
      built.searchParams.set(affiliate.subIdParam, clickId);
    }
    return { url: built.toString(), network: affiliate.network };
  } catch {
    return { url: listingUrl, network: null };
  }
}

/** Only http(s) URLs leave through /go; anything else is treated as unknown. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return isHttp(new URL(value)) ? value : null;
  } catch {
    return null;
  }
}
