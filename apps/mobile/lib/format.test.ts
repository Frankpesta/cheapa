import { tintFor, tints } from '@cheapa/config/tokens';
import { describe, expect, it } from 'vitest';
import { ago, dropPercent, formatNaira, seenLabel, watchProgress } from './format';

const now = new Date('2026-11-19T12:00:00Z');
const before = (ms: number) => new Date(now.getTime() - ms);

describe('format', () => {
  it('formats kobo as naira', () => {
    expect(formatNaira(31_850_000)).toBe('₦318,500');
  });

  it('says how long ago', () => {
    expect(ago(before(30_000), now)).toBe('just now');
    expect(ago(before(40 * 60_000), now)).toBe('40m ago');
    expect(ago(before(5 * 3_600_000), now)).toBe('5h ago');
    expect(ago(before(26 * 3_600_000), now)).toBe('1d ago');
    expect(seenLabel(before(3_600_000), false, now)).toBe('seen 1h ago');
    expect(seenLabel(before(3_600_000), true, now)).toBe('live now');
  });

  it('drop badge with a real minus sign, only for drops', () => {
    expect(dropPercent(33_600_000, 28_900_000)).toBe('−14%');
    expect(dropPercent(100, 120)).toBeNull();
  });

  it('watch progress from start to target, clamped', () => {
    expect(watchProgress(35_900_000, 31_850_000, 30_250_000)).toBeCloseTo(0.717, 2);
    expect(watchProgress(100, 120, 80)).toBe(0);
    expect(watchProgress(100, 70, 80)).toBe(1);
  });
});

describe('tintFor', () => {
  it('is stable per name and always a palette tint', () => {
    expect(tintFor('Jumia')).toBe(tintFor('Jumia'));
    for (const name of ['Jiji', 'Konga', 'Slot', '3CHUB', '']) expect(tints).toContain(tintFor(name));
  });
});
