import { describe, expect, it } from 'vitest';
import { isUuid, uuidv7 } from '../../common/uuid7.js';
import { outboundUrl, safeHttpUrl } from './affiliate.js';

const LISTING = 'https://www.jumia.com.ng/dress-123.html?x=1';
const CLICK = '01937a2b-0000-7000-8000-000000000001';

describe('outboundUrl', () => {
  it('wraps the listing URL and adds the click id as the sub-id parameter', () => {
    const out = outboundUrl(
      LISTING,
      { network: 'jumia', linkTemplate: 'https://aff.test/r?url={url}', subIdParam: 'sub', active: true },
      CLICK,
    );
    const url = new URL(out.url);
    expect(out.network).toBe('jumia');
    expect(url.searchParams.get('url')).toBe(LISTING);
    expect(url.searchParams.get('sub')).toBe(CLICK);
  });

  it('fills {subId} when the template places it', () => {
    const out = outboundUrl(
      LISTING,
      {
        network: 'n',
        linkTemplate: 'https://aff.test/{subId}/go?to={url}',
        subIdParam: 'ignored',
        active: true,
      },
      CLICK,
    );
    expect(out.url.startsWith(`https://aff.test/${CLICK}/go?to=`)).toBe(true);
    expect(new URL(out.url).searchParams.has('ignored')).toBe(false);
  });

  it('falls back to the plain listing URL when inactive, malformed or not http', () => {
    const base = { network: 'n', subIdParam: 'sub' };
    expect(outboundUrl(LISTING, null, CLICK)).toEqual({ url: LISTING, network: null });
    expect(
      outboundUrl(LISTING, { ...base, linkTemplate: 'https://a.test/?u={url}', active: false }, CLICK)
        .network,
    ).toBeNull();
    expect(
      outboundUrl(LISTING, { ...base, linkTemplate: 'https://a.test/no-placeholder', active: true }, CLICK)
        .url,
    ).toBe(LISTING);
    expect(outboundUrl(LISTING, { ...base, linkTemplate: 'javascript:{url}', active: true }, CLICK).url).toBe(
      LISTING,
    );
  });
});

describe('safeHttpUrl', () => {
  it('accepts http(s) only', () => {
    expect(safeHttpUrl(LISTING)).toBe(LISTING);
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});

describe('uuidv7', () => {
  it('is a v7 uuid that sorts by time', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe('7');
    expect(a < b).toBe(true);
    expect(a.replaceAll('-', '').slice(0, 12)).toBe((1_700_000_000_000).toString(16).padStart(12, '0'));
  });
});
