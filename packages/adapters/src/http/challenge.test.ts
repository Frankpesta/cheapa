import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isChallenge } from './challenge.js';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
const html = { 'content-type': 'text/html; charset=utf-8' };

describe('isChallenge', () => {
  it('detects Cloudflare and Akamai interstitials', () => {
    expect(isChallenge(html, fixture('cloudflare-challenge.html'))).toBe(true);
    expect(isChallenge(html, fixture('akamai-access-denied.html'))).toBe(true);
    expect(isChallenge({ 'cf-mitigated': 'challenge' }, '')).toBe(true);
  });

  it('treats a captcha-only tiny page as a challenge', () => {
    expect(
      isChallenge(html, '<html><body><div class="g-recaptcha" data-sitekey="x"></div></body></html>'),
    ).toBe(true);
  });

  it('ignores normal pages, including big ones with a captcha widget', () => {
    const product = `<html><head><title>Satin Midi Dress | Shop</title></head><body>${'<p>dress</p>'.repeat(
      3000,
    )}<form><div class="g-recaptcha"></div></form></body></html>`;
    expect(isChallenge(html, product)).toBe(false);
    expect(isChallenge(html, fixture('429-too-many-requests.html'))).toBe(false);
  });

  it('never scans non-HTML bodies', () => {
    expect(isChallenge({ 'content-type': 'application/json' }, '{"title":"Just a moment..."}')).toBe(false);
  });
});
