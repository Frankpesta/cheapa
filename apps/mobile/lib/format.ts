/**
 * Display formatting at the UI edge (CLAUDE.md rule 1: money stays integer kobo until here).
 */
export { formatNaira } from '@cheapa/core/client';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "40m ago", "5h ago", "1d ago"; under a minute is "just now". */
export function ago(at: Date | string, now: Date = new Date()): string {
  const ms = Math.max(0, now.getTime() - new Date(at).getTime());
  if (ms < MIN) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  return `${Math.floor(ms / DAY)}d ago`;
}

/** ListingRow meta line: "seen 5h ago", or "live now" for live-search results. */
export function seenLabel(at: Date | string, live: boolean, now: Date = new Date()): string {
  if (live) return 'live now';
  const a = ago(at, now);
  return a === 'just now' ? 'seen just now' : `seen ${a}`;
}

/** "−14%" with a true minus sign, for drop badges. */
export function dropPercent(oldKobo: number, newKobo: number): string | null {
  if (oldKobo <= 0 || newKobo >= oldKobo) return null;
  return `−${Math.round(((oldKobo - newKobo) / oldKobo) * 100)}%`;
}

/** 0..1 progress from the start price down to the target (WatchCard bar). */
export function watchProgress(startKobo: number, nowKobo: number, targetKobo: number): number {
  if (startKobo <= targetKobo) return nowKobo <= targetKobo ? 1 : 0;
  return Math.min(1, Math.max(0, (startKobo - nowKobo) / (startKobo - targetKobo)));
}
