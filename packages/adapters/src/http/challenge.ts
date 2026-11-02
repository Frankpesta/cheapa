/**
 * Bot-protection interstitials (Cloudflare, Akamai, generic). Seeing one means the store
 * doesn't want automated traffic right now: we stop and alert, we never solve or evade.
 */

/** Specific to interstitial pages; checked in the first 64 KB of any HTML response. */
const STRONG: readonly RegExp[] = [
  /<title>\s*Just a moment\.\.\.\s*<\/title>/i,
  /<title>\s*Attention Required! \| Cloudflare\s*<\/title>/i,
  /cdn-cgi\/challenge-platform/i,
  /window\._cf_chl_opt/i,
  /<title>\s*Access Denied\s*<\/title>[\s\S]{0,2000}Reference(?:\s|&#32;)*(?:#|&#35;)/i,
  /<title>[^<]*(?:are you a robot|verify you are human|bot check)[^<]*<\/title>/i,
];

/**
 * Captcha widgets also appear on normal pages (newsletter, reviews), so they only count
 * on tiny pages, where the widget is the whole page.
 */
const WEAK: readonly RegExp[] = [/class=["'][^"']*\b(?:g-recaptcha|h-captcha|cf-turnstile)\b/i];
const WEAK_MAX_BYTES = 20 * 1024;
const SCAN_LIMIT = 64 * 1024;

export function isChallenge(headers: Record<string, string>, body: string): boolean {
  if (headers['cf-mitigated'] === 'challenge') return true;
  const type = headers['content-type'] ?? '';
  if (type && !type.includes('html')) return false;
  const head = body.length > SCAN_LIMIT ? body.slice(0, SCAN_LIMIT) : body;
  if (STRONG.some((re) => re.test(head))) return true;
  return body.length <= WEAK_MAX_BYTES && WEAK.some((re) => re.test(body));
}
