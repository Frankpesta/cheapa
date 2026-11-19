import type { SearchHistoryItem } from '@cheapa/core/client';
import { describe, expect, it } from 'vitest';
import { groupHistory, groupLabel, historyTitle, whenLabel } from './history';

// 19 Nov 2026, 21:30 in Lagos (20:30 UTC).
const now = new Date('2026-11-19T20:30:00.000Z');

describe('groupLabel', () => {
  it('uses the Lagos calendar, not UTC', () => {
    // 23:30 UTC on the 18th is 00:30 on the 19th in Lagos: today.
    expect(groupLabel(new Date('2026-11-18T23:30:00.000Z'), now)).toBe('TODAY');
    expect(groupLabel(new Date('2026-11-18T22:30:00.000Z'), now)).toBe('YESTERDAY');
    expect(groupLabel(new Date('2026-11-15T10:00:00.000Z'), now)).toBe('THIS WEEK');
    expect(groupLabel(new Date('2026-11-10T10:00:00.000Z'), now)).toBe('LAST WEEK');
    expect(groupLabel(new Date('2026-10-01T10:00:00.000Z'), now)).toBe('OCT 2026');
  });
});

describe('whenLabel', () => {
  it('shows the Lagos time for recent rows, then the weekday, then the date', () => {
    expect(whenLabel(new Date('2026-11-19T15:12:00.000Z'), now)).toBe('4:12 pm');
    expect(whenLabel(new Date('2026-11-18T23:05:00.000Z'), now)).toBe('12:05 am');
    expect(whenLabel(new Date('2026-11-17T10:00:00.000Z'), now)).toBe('Tue');
    expect(whenLabel(new Date('2026-11-03T10:00:00.000Z'), now)).toBe('3 Nov');
  });
});

const row = (over: Partial<SearchHistoryItem>): SearchHistoryItem => ({
  id: '00000000-0000-4000-8000-000000000001',
  source: 'text',
  query: null,
  imageSearch: false,
  detected: {},
  resultCount: 0,
  topProduct: null,
  createdAt: now.toISOString(),
  ...over,
});

describe('history rows', () => {
  it('titles by product, then query, then what we read', () => {
    expect(historyTitle(row({ query: 'hisense 43 inch smart tv' }))).toBe('“hisense 43 inch smart tv”');
    expect(historyTitle(row({ imageSearch: true, detected: { brand: 'Oraimo', model: 'FreePods 4' } }))).toBe(
      'Oraimo FreePods 4',
    );
    expect(historyTitle(row({ imageSearch: true }))).toBe('Photo search');
  });

  it('groups consecutive rows by day', () => {
    const groups = groupHistory(
      [
        row({ createdAt: '2026-11-19T10:00:00.000Z' }),
        row({ createdAt: '2026-11-19T09:00:00.000Z' }),
        row({ createdAt: '2026-11-18T09:00:00.000Z' }),
      ],
      now,
    );
    expect(groups.map((g) => [g.title, g.data.length])).toEqual([
      ['TODAY', 2],
      ['YESTERDAY', 1],
    ]);
  });
});
