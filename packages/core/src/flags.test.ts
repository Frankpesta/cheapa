import { describe, expect, it } from 'vitest';
import { isListingHidden, listingFlags } from './flags.js';

const now = new Date('2026-11-20T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

describe('listingFlags (04 §4.5)', () => {
  it('stale after 48 hours unseen', () => {
    expect(listingFlags({ lastSeenAt: hoursAgo(47), suspectLow: false, sponsored: false }, now)).toEqual({});
    expect(listingFlags({ lastSeenAt: hoursAgo(49), suspectLow: false, sponsored: false }, now)).toEqual({
      stale: true,
    });
  });

  it('carries "check seller" and sponsored labels', () => {
    expect(listingFlags({ lastSeenAt: hoursAgo(1), suspectLow: true, sponsored: true }, now)).toEqual({
      suspectLow: true,
      sponsored: true,
    });
  });

  it('hidden after 30 days unseen', () => {
    expect(isListingHidden(hoursAgo(29 * 24), now)).toBe(false);
    expect(isListingHidden(hoursAgo(31 * 24), now)).toBe(true);
  });
});
