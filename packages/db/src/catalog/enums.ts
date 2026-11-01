import { CONDITIONS, DEPARTMENTS, PRICE_KINDS, STORE_PLATFORMS, STORE_STATUSES } from '@cheapa/core';
import { pgEnum } from 'drizzle-orm/pg-core';

// Postgres enums share their value tuples with the zod enums in @cheapa/core so the two can never drift.
export const storePlatform = pgEnum('store_platform', STORE_PLATFORMS);
export const storeStatus = pgEnum('store_status', STORE_STATUSES);
export const condition = pgEnum('listing_condition', CONDITIONS);
export const priceKind = pgEnum('price_kind', PRICE_KINDS);
export const department = pgEnum('department', DEPARTMENTS);

export const matchDecision = pgEnum('match_decision', ['merge', 'split']);
export const crawlKind = pgEnum('crawl_kind', ['discover', 'fetch']);
export const crawlStatus = pgEnum('crawl_status', ['queued', 'running', 'succeeded', 'failed', 'blocked']);
