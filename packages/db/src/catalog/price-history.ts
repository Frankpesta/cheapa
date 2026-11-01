/**
 * price_history is range-partitioned by month on observed_at, which drizzle-kit
 * can't manage. This file is NOT in drizzle.catalog.config.ts; the table, its
 * partitions and ensure_price_history_partitions() come from the hand-written
 * migration migrations/catalog/0001_price_history_partitioned.sql.
 *
 * Insert ONLY when price or stock changed (02-crawler-core.md 2.4).
 */
import { bigint, bigserial, boolean, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { listings } from './schema.js';

export const priceHistory = pgTable(
  'price_history',
  {
    id: bigserial('id', { mode: 'number' }).notNull(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    priceKobo: bigint('price_kobo', { mode: 'number' }).notNull(),
    inStock: boolean('in_stock').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.id, t.observedAt] })],
);
