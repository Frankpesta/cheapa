import { describe, expect, it } from 'vitest';
import {
  BINARY,
  REDACTED,
  redactText,
  scrubAnalyticsProps,
  scrubBreadcrumb,
  scrubSentryEvent,
  scrubSpan,
  scrubValue,
} from './privacy.js';

describe('redactText', () => {
  it.each([
    ['call me on 08031234567', 'call me on [redacted]'],
    ['+2348031234567 please', '[redacted] please'],
    ['234 803 123 4567', '[redacted]'],
    ['0905-123-4567', '[redacted]'],
    ['uk +447700900123', 'uk [redacted]'],
    ['mail ada.obi+shop@gmail.com now', 'mail [redacted] now'],
    ['Authorization: Bearer abc.def-ghi', 'Authorization: Bearer [redacted]'],
    ['key sk_test_abcdefgh12345678 leaked', 'key [redacted] leaked'],
    ['jwt eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJl here', 'jwt [redacted] here'],
  ])('%j', (input, expected) => {
    expect(redactText(input)).toBe(expected);
  });

  it.each(['₦ 18,500', 'Tecno Camon 30 8GB/256GB', 'order 12345', '13x4 HD lace 24 inch', '2026-11-01'])(
    'leaves %j alone',
    (input) => {
      expect(redactText(input)).toBe(input);
    },
  );
});

describe('scrubValue', () => {
  it('replaces binaries and sensitive keys, deeply', () => {
    const out = scrubValue({
      image: Buffer.from('jpeg'),
      nested: { bytes: new Uint8Array([1, 2]), note: 'reach 08031234567', ok: 42, buf: new ArrayBuffer(4) },
      list: ['ada@example.com', Buffer.from('x')],
      Authorization: 'Bearer abc',
      phone: '+2348031234567',
    });
    expect(out).toEqual({
      image: REDACTED,
      nested: { bytes: REDACTED, note: `reach ${REDACTED}`, ok: 42, buf: BINARY },
      list: [REDACTED, BINARY],
      Authorization: REDACTED,
      phone: REDACTED,
    });
  });
});

describe('scrubSentryEvent', () => {
  const event = () => ({
    message: 'failed for ada@example.com',
    user: { id: 'u_1', email: 'ada@example.com', ip_address: '102.89.1.1', username: 'ada' },
    request: {
      url: 'https://api.cheapa.ng/search/image?debug=1',
      method: 'POST',
      data: { image: 'base64...', query: 'black satin dress' },
      cookies: { session: 'abc' },
      query_string: 'q=black+dress',
      headers: {
        authorization: 'Bearer secret',
        cookie: 'session=abc',
        'x-cheapa-device': '7d1e2f3a-4b5c-4d6e-8f70-819a2b3c4d5e',
        'user-agent': 'okhttp/4',
        'x-request-id': 'req-123456',
      },
    },
    exception: { values: [{ type: 'Error', value: 'boom 08031234567' }] },
    breadcrumbs: [
      { category: 'http', data: { url: 'https://x.ng/a?token=1', status_code: 500 } },
      { message: 'user ada@example.com' },
    ],
    extra: { upload: Buffer.from('raw image'), note: 'ok' },
    tags: { requestId: 'req-123456' },
  });

  it('drops bodies, cookies, unsafe headers and search query strings', () => {
    const out = scrubSentryEvent(event());
    expect(out.request).toEqual({
      url: 'https://api.cheapa.ng/search/image',
      method: 'POST',
      headers: { 'user-agent': 'okhttp/4', 'x-request-id': 'req-123456' },
    });
  });

  it('keeps only the user id', () => {
    expect(scrubSentryEvent(event()).user).toEqual({ id: 'u_1' });
  });

  it('redacts messages, exception values, breadcrumbs and extras', () => {
    const out = scrubSentryEvent(event());
    expect(out.message).toBe(`failed for ${REDACTED}`);
    expect(out.exception.values[0]?.value).toBe(`boom ${REDACTED}`);
    expect(out.breadcrumbs[0]?.data).toEqual({ url: 'https://x.ng/a', status_code: 500 });
    expect(out.breadcrumbs[1]?.message).toBe(`user ${REDACTED}`);
    expect(out.extra).toEqual({ upload: BINARY, note: 'ok' });
    expect(out.tags).toEqual({ requestId: 'req-123456' });
  });

  it('keeps non-search query strings but redacts them', () => {
    const out = scrubSentryEvent({
      request: { url: '/products/x/history', query_string: 'days=30&e=a@b.co' },
    });
    expect(out.request.query_string).toBe(`days=30&e=${REDACTED}`);
  });

  it('leaves the original-shaped object usable for non-request events', () => {
    expect(scrubSentryEvent({ message: 'plain' })).toEqual({ message: 'plain' });
  });
});

describe('scrubSentryEvent stack frames', () => {
  it('redacts source context lines and drops local variables', () => {
    const out = scrubSentryEvent({
      exception: {
        values: [
          {
            value: 'x',
            stacktrace: {
              frames: [
                {
                  context_line: "throw new Error('ada@example.com')",
                  pre_context: ['const phone = "08031234567";'],
                  post_context: ['done();'],
                  vars: { phone: '08031234567' },
                },
              ],
            },
          },
        ],
      },
    });
    const frame = out.exception.values[0]?.stacktrace.frames[0];
    expect(frame).toEqual({
      context_line: `throw new Error('${REDACTED}')`,
      pre_context: [`const phone = "${REDACTED}";`],
      post_context: ['done();'],
    });
  });
});

describe('scrubSpan', () => {
  it('strips query strings, drops user-data attributes, redacts the rest', () => {
    const out = scrubSpan({
      name: 'GET /search/text?q=black+dress',
      attributes: {
        'url.full': 'https://api.cheapa.ng/search/text?q=black+dress',
        'url.query': 'q=black+dress',
        'http.request.header.authorization': 'Bearer x',
        'user.email': 'ada@example.com',
        'client.address': '102.89.1.1',
        'db.query.parameter.0': '08031234567',
        'db.system': 'postgresql',
        'http.response.status_code': { value: 200, type: 'integer' },
        note: { value: 'call 08031234567', type: 'string' },
      },
    });
    expect(out).toEqual({
      name: 'GET /search/text',
      attributes: {
        'url.full': 'https://api.cheapa.ng/search/text',
        'db.system': 'postgresql',
        'http.response.status_code': { value: 200, type: 'integer' },
        note: { value: `call ${REDACTED}`, type: 'string' },
      },
    });
  });
});

describe('scrubBreadcrumb', () => {
  it('passes non-objects through', () => {
    expect(scrubBreadcrumb(null)).toBeNull();
  });
});

describe('scrubAnalyticsProps', () => {
  it('keeps flat primitives; drops sensitive keys, hashes, free text and nested values', () => {
    expect(
      scrubAnalyticsProps({
        source: 'share',
        latencyMs: 812,
        cacheHit: false,
        visionProvider: null,
        query: 'black satin slip dress',
        imageSha256: 'abc',
        searchText: 'wig',
        productTitle: 'Bone straight wig',
        nested: { a: 1 },
        note: 'mail ada@example.com',
      }),
    ).toEqual({
      source: 'share',
      latencyMs: 812,
      cacheHit: false,
      visionProvider: null,
      note: `mail ${REDACTED}`,
    });
  });
});
