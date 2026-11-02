/**
 * When each store is due for a sweep (02-crawler-core.md 2.3, 11-compliance-and-ops.md).
 * Pure functions: the tick job feeds them `now` and the store's last crawl.
 *
 * - Tiers 1 and 2: daily, inside the 01:00–05:00 WAT heavy-sweep window.
 * - Tier 3 and up (long tail): weekly, inside the window, on a weekday picked from the
 *   store id so stores are staggered across the week.
 * - Tier 4 feeds are one download per day, so they run daily at any hour.
 * - Every start is delayed by a random 0–40 min: ±20 min around the nominal slot.
 *
 * Hot tier-1 products every 6 h needs the search/watch signal from the API (users DB)
 * and lands with phase 08 (BACKLOG.md).
 */
import type { StoreTier } from '@cheapa/core';

/** WAT is UTC+1 all year (no daylight saving). */
const WAT_OFFSET_MS = 60 * 60 * 1000;
export const SWEEP_WINDOW = { startHour: 1, endHour: 5 } as const;
export const JITTER_MAX_MS = 40 * 60 * 1000;
export const TICK_EVERY_MS = 15 * 60 * 1000;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface DueInput {
  id: string;
  tier: StoreTier;
  lastCrawledAt: Date | null;
}

/** Hour, weekday and date as seen in Lagos. */
export function watParts(now: Date): { hour: number; weekday: number; date: string } {
  const wat = new Date(now.getTime() + WAT_OFFSET_MS);
  return { hour: wat.getUTCHours(), weekday: wat.getUTCDay(), date: wat.toISOString().slice(0, 10) };
}

export function inSweepWindow(now: Date): boolean {
  const { hour } = watParts(now);
  return hour >= SWEEP_WINDOW.startHour && hour < SWEEP_WINDOW.endHour;
}

/** 0–6, stable per store: its weekly sweep day. */
export function staggerDay(storeId: string): number {
  let h = 0;
  for (const ch of storeId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 7;
}

export function isDue(store: DueInput, now: Date): boolean {
  const age = store.lastCrawledAt ? now.getTime() - store.lastCrawledAt.getTime() : Infinity;
  switch (store.tier) {
    case 4:
      return age >= DAY - HOUR;
    case 1:
    case 2:
      // > 20 h: once per night even if last night's run started late in the window.
      return inSweepWindow(now) && age >= 20 * HOUR;
    default:
      return inSweepWindow(now) && watParts(now).weekday === staggerDay(store.id) && age >= 6 * DAY;
  }
}

export function jitterMs(random: () => number = Math.random): number {
  return Math.floor(random() * JITTER_MAX_MS);
}
