/**
 * History grouping (History.dc.html): rows grouped by Lagos day, newest first. WAT is
 * UTC+1 all year (no DST), so the shift is a constant rather than an Intl time zone,
 * which Hermes doesn't support everywhere.
 */
import type { SearchHistoryItem, SearchSource } from '@cheapa/core/client';

const WAT_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Days since the Unix epoch on the Lagos calendar. */
const lagosDay = (d: Date) => Math.floor((d.getTime() + WAT_MS) / DAY_MS);
const lagos = (d: Date) => new Date(d.getTime() + WAT_MS);

export function groupLabel(at: Date, now: Date): string {
  const diff = lagosDay(now) - lagosDay(at);
  if (diff <= 0) return 'TODAY';
  if (diff === 1) return 'YESTERDAY';
  if (diff < 7) return 'THIS WEEK';
  if (diff < 14) return 'LAST WEEK';
  const l = lagos(at);
  return `${MONTHS[l.getUTCMonth()]} ${l.getUTCFullYear()}`;
}

/** "4:12 pm" for today and yesterday, else the weekday ("Tue") or date ("3 Nov"). */
export function whenLabel(at: Date, now: Date): string {
  const diff = lagosDay(now) - lagosDay(at);
  const l = lagos(at);
  if (diff <= 1) {
    const h = l.getUTCHours();
    const m = String(l.getUTCMinutes()).padStart(2, '0');
    return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
  }
  if (diff < 7) return WEEKDAYS[l.getUTCDay()]!;
  return `${l.getUTCDate()} ${MONTHS[l.getUTCMonth()]!.charAt(0)}${MONTHS[l.getUTCMonth()]!.slice(1).toLowerCase()}`;
}

export const SOURCE_WORD: Record<SearchSource, string> = {
  camera: 'Camera',
  share: 'Shared screenshot',
  gallery: 'Gallery',
  text: 'Typed search',
  link: 'Shared link',
};

/** Row title: the matched product, else the typed query in quotes, else what we read. */
export function historyTitle(item: SearchHistoryItem): string {
  if (item.topProduct) return item.topProduct.title;
  if (item.query) return item.imageSearch ? item.query : `“${item.query}”`;
  const d = item.detected;
  return [d.brand, d.model].filter(Boolean).join(' ') || d.category || 'Photo search';
}

export function groupHistory(
  items: readonly SearchHistoryItem[],
  now: Date,
): { title: string; data: SearchHistoryItem[] }[] {
  const groups: { title: string; data: SearchHistoryItem[] }[] = [];
  for (const item of items) {
    const title = groupLabel(new Date(item.createdAt), now);
    const last = groups[groups.length - 1];
    if (last?.title === title) last.data.push(item);
    else groups.push({ title, data: [item] });
  }
  return groups;
}
