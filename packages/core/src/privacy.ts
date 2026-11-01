/**
 * Scrubbing for anything sent to third-party observability (Sentry, PostHog).
 * 01-foundation.md 1.7 and 11-compliance-and-ops.md 11.2: never images, request
 * bodies, auth headers, cookies, phone numbers or emails. Pure functions with no
 * vendor types, so the API, worker, web and mobile share one implementation.
 */

export const REDACTED = '[redacted]';
export const BINARY = '[binary]';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** +234 / 234 / 0 followed by a Nigerian mobile prefix, or any other +<8–15 digits>. */
const PHONE = /(?:\+?234[\s-]?|\b0)[789][01]\d(?:[\s-]?\d){7}\b|\+[1-9](?:[\s-]?\d){7,14}\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
/** Secret-looking tokens: Clerk/Stripe-style keys and JWTs. */
const SECRETS =
  /\b(?:sk|pk|whsec|phc|rk)_[A-Za-z0-9_]{8,}\b|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

/** Replace emails, phone numbers, bearer tokens and secret-looking strings. */
export function redactText(text: string): string {
  return text
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(SECRETS, REDACTED)
    .replace(EMAIL, REDACTED)
    .replace(PHONE, REDACTED);
}

/** Headers that may leave the server. Everything else (auth, cookies, device ids) is dropped. */
export const SAFE_HEADERS = new Set([
  'user-agent',
  'content-type',
  'content-length',
  'accept',
  'accept-language',
  'x-request-id',
  'x-cheapa-platform',
  'x-cheapa-app-version',
]);

/** Keys whose values are never sent, wherever they appear. */
const SENSITIVE_KEYS =
  /^(?:authorization|cookie|set-cookie|password|secret|token|access_token|refresh_token|api_?key|phone|email|image|bytes|buffer|body|data|payload|query)$/i;

const MAX_DEPTH = 8;

function isBinary(value: unknown): boolean {
  return (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof Blob !== 'undefined' && value instanceof Blob)
  );
}

/** Deep-scrub an arbitrary value: binary -> [binary], sensitive keys -> [redacted], strings redacted. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value !== 'object') return value;
  if (isBinary(value)) return BINARY;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.test(key) ? REDACTED : scrubValue(v, depth + 1);
  }
  return out;
}

type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Scrub a Sentry event (error or transaction) in place-safe fashion and return it.
 * - request: no body, no cookies, safe headers only, no query string on /search/*
 * - user: id only (no email, ip, username)
 * - message, exception values, breadcrumbs, extra, contexts, tags: redacted deeply
 */
export function scrubSentryEvent<T extends object>(event: T): T {
  const e = event as Loose;

  if (isObject(e.request)) {
    const request = { ...e.request };
    delete request.data;
    delete request.cookies;
    if (isObject(request.headers)) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([k]) => SAFE_HEADERS.has(k.toLowerCase())),
      );
    }
    const url = typeof request.url === 'string' ? request.url : '';
    if (url.includes('/search/')) delete request.query_string;
    else if (typeof request.query_string === 'string')
      request.query_string = redactText(request.query_string);
    if (typeof request.url === 'string') request.url = redactText(request.url.split('?')[0] ?? '');
    e.request = request;
  }

  if (isObject(e.user)) e.user = typeof e.user.id === 'string' ? { id: e.user.id } : {};
  if (typeof e.message === 'string') e.message = redactText(e.message);
  if (isObject(e.logentry) && typeof e.logentry.message === 'string') {
    e.logentry = { ...e.logentry, message: redactText(e.logentry.message), params: [] };
  }

  if (isObject(e.exception) && Array.isArray(e.exception.values)) {
    e.exception = { ...e.exception, values: e.exception.values.map(scrubException) };
  }

  if (Array.isArray(e.breadcrumbs)) e.breadcrumbs = e.breadcrumbs.map(scrubBreadcrumb);
  for (const key of ['extra', 'contexts', 'tags'] as const) {
    if (isObject(e[key])) e[key] = scrubValue(e[key]);
  }
  return event;
}

/** Exception value and the source lines Sentry attaches around each stack frame. */
function scrubException(ex: unknown): unknown {
  if (!isObject(ex)) return ex;
  const out: Loose = { ...ex };
  if (typeof out.value === 'string') out.value = redactText(out.value);
  if (isObject(out.stacktrace) && Array.isArray(out.stacktrace.frames)) {
    out.stacktrace = {
      ...out.stacktrace,
      frames: out.stacktrace.frames.map((frame: unknown) => {
        if (!isObject(frame)) return frame;
        const f: Loose = { ...frame };
        delete f.vars;
        if (typeof f.context_line === 'string') f.context_line = redactText(f.context_line);
        for (const key of ['pre_context', 'post_context'] as const) {
          if (Array.isArray(f[key]))
            f[key] = f[key].map((l: unknown) => (typeof l === 'string' ? redactText(l) : l));
        }
        return f;
      }),
    };
  }
  return out;
}

/** Span attributes that may carry user data; dropped outright. */
const SPAN_DENY =
  /query|body|header|cookie|user\.(?:email|name|full_name|ip_address)|client\.address|db\.query\.parameter/i;

const stripQuery = (text: string) => text.replace(/\?[^\s"]*/g, '');

/**
 * Sentry streamed span (beforeSendSpan): strip query strings from the name and URL
 * attributes, drop attributes that can carry user data, redact the rest.
 */
export function scrubSpan<T extends object>(span: T): T {
  const s = span as Loose;
  if (typeof s.name === 'string') s.name = redactText(stripQuery(s.name));
  if (isObject(s.attributes)) {
    const attributes: Loose = {};
    for (const [key, raw] of Object.entries(s.attributes)) {
      if (SPAN_DENY.test(key)) continue;
      const clean = (v: unknown) => (typeof v === 'string' ? redactText(stripQuery(v)) : v);
      attributes[key] = isObject(raw) && 'value' in raw ? { ...raw, value: clean(raw.value) } : clean(raw);
    }
    s.attributes = attributes;
  }
  return span;
}

/** Breadcrumbs: redact message and data; drop HTTP breadcrumb query strings. */
export function scrubBreadcrumb<T>(crumb: T): T {
  if (!isObject(crumb)) return crumb;
  const c: Loose = { ...crumb };
  if (typeof c.message === 'string') c.message = redactText(c.message);
  if (isObject(c.data)) {
    const data = scrubValue(c.data) as Loose;
    if (typeof data.url === 'string') data.url = data.url.split('?')[0];
    c.data = data;
  }
  return c as T;
}

/** Never in analytics: image hashes, search text, titles or any other free text a user typed. */
const ANALYTICS_DENY = /sha|hash|query|text|title|message|search_?term/i;

/**
 * Analytics properties: only flat primitives, never free text from users.
 * Strings are redacted and capped; nested objects and binaries are dropped.
 */
export function scrubAnalyticsProps(
  props: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(props)) {
    if (SENSITIVE_KEYS.test(key) || ANALYTICS_DENY.test(key)) continue;
    if (value === null || typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string') out[key] = redactText(value).slice(0, 100);
  }
  return out;
}
