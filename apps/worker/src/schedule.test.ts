import { describe, expect, it } from 'vitest';
import { inSweepWindow, isDue, JITTER_MAX_MS, jitterMs, staggerDay, watParts } from './schedule.js';

/** Lagos wall-clock time -> UTC Date (WAT = UTC+1). */
const wat = (iso: string) => new Date(new Date(`${iso}Z`).getTime() - 3600_000);
const hoursBefore = (d: Date, h: number) => new Date(d.getTime() - h * 3600_000);
const id = '6f1c2a3b-0000-4000-8000-000000000001';

describe('watParts / sweep window', () => {
  it('reads Lagos time', () => {
    expect(watParts(new Date('2026-11-02T00:30:00Z'))).toEqual({ hour: 1, weekday: 1, date: '2026-11-02' });
    expect(watParts(new Date('2026-11-01T23:30:00Z')).date).toBe('2026-11-02');
  });

  it('is open 01:00–05:00 WAT only', () => {
    expect(inSweepWindow(wat('2026-11-02T00:59:00'))).toBe(false);
    expect(inSweepWindow(wat('2026-11-02T01:00:00'))).toBe(true);
    expect(inSweepWindow(wat('2026-11-02T04:59:00'))).toBe(true);
    expect(inSweepWindow(wat('2026-11-02T05:00:00'))).toBe(false);
  });
});

describe('isDue', () => {
  const night = wat('2026-11-02T02:00:00');
  const noon = wat('2026-11-02T12:00:00');

  it('tiers 1 and 2: nightly, in the window, at most once per night', () => {
    for (const tier of [1, 2] as const) {
      expect(isDue({ id, tier, lastCrawledAt: null }, night)).toBe(true);
      expect(isDue({ id, tier, lastCrawledAt: null }, noon)).toBe(false);
      expect(isDue({ id, tier, lastCrawledAt: hoursBefore(night, 23) }, night)).toBe(true);
      expect(isDue({ id, tier, lastCrawledAt: hoursBefore(night, 2) }, night)).toBe(false);
    }
  });

  it('tier 3+: weekly on the store’s stagger day, in the window', () => {
    const day = staggerDay(id);
    // 2026-11-01 is a Sunday (weekday 0); pick the date whose weekday is the stagger day.
    const onDay = wat(`2026-11-0${1 + day}T02:00:00`);
    const offDay = wat(`2026-11-0${1 + ((day + 1) % 7)}T02:00:00`);
    for (const tier of [3, 5] as const) {
      expect(isDue({ id, tier, lastCrawledAt: null }, onDay)).toBe(true);
      expect(isDue({ id, tier, lastCrawledAt: null }, offDay)).toBe(false);
      expect(isDue({ id, tier, lastCrawledAt: hoursBefore(onDay, 3 * 24) }, onDay)).toBe(false);
      expect(isDue({ id, tier, lastCrawledAt: hoursBefore(onDay, 7 * 24) }, onDay)).toBe(true);
    }
  });

  it('tier 4 feeds: daily at any hour', () => {
    expect(isDue({ id, tier: 4, lastCrawledAt: null }, noon)).toBe(true);
    expect(isDue({ id, tier: 4, lastCrawledAt: hoursBefore(noon, 24) }, noon)).toBe(true);
    expect(isDue({ id, tier: 4, lastCrawledAt: hoursBefore(noon, 12) }, noon)).toBe(false);
  });
});

describe('staggerDay / jitter', () => {
  it('spreads stores over the week, stable per id', () => {
    const days = new Set(Array.from({ length: 50 }, (_, i) => staggerDay(`store-${i}`)));
    expect(days.size).toBe(7);
    expect(staggerDay(id)).toBe(staggerDay(id));
  });

  it('jitters 0–40 min (±20 around the slot)', () => {
    expect(jitterMs(() => 0)).toBe(0);
    expect(jitterMs(() => 0.999999)).toBeLessThan(JITTER_MAX_MS);
    expect(JITTER_MAX_MS).toBe(40 * 60 * 1000);
  });
});
