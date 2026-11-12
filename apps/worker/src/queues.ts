import type { JsonValue, ProductRef } from '@cheapa/adapters/types';
import { RawListing } from '@cheapa/core';
import { Queue, type DefaultJobOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { z } from 'zod';

/** BullMQ key prefix in redis-queue. */
export const QUEUE_PREFIX = 'cheapa';

/**
 * Queues (02-crawler-core.md 2.3). `embed` (05) and `match` (04) are named here so
 * producers can target them; their consumers land with those phases (BACKLOG.md).
 */
export const QUEUES = {
  schedule: 'schedule',
  discover: 'discover',
  fetch: 'fetch',
  process: 'process',
  embed: 'embed',
  match: 'match',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const DiscoverJob = z.object({ storeId: z.uuid() });
export type DiscoverJob = z.infer<typeof DiscoverJob>;

const JsonValueSchema = z.json() as z.ZodType<JsonValue>;

export const ProductRefData: z.ZodType<ProductRef> = z.object({
  kind: z.enum(['product', 'page']),
  url: z.url(),
  externalId: z.string().min(1).optional(),
  meta: z.record(z.string(), JsonValueSchema).optional(),
});

export const FetchJob = z.object({
  storeId: z.uuid(),
  crawlJobId: z.uuid(),
  adapterId: z.string().min(1),
  ref: ProductRefData,
});
export type FetchJob = z.infer<typeof FetchJob>;

/** Validated adapter output for one fetched payload, ready for normalize + upsert (2.4). */
export const ProcessJob = z.object({
  storeId: z.uuid(),
  crawlJobId: z.uuid(),
  fetchedAt: z.iso.datetime(),
  listings: z.array(RawListing),
});
export type ProcessJob = z.input<typeof ProcessJob>;

/** A listing whose image is new or changed; the consumer (phase 05) writes listing_embeddings. */
export const EmbedJob = z.object({
  listingId: z.uuid(),
  imageUrl: z.url(),
});
export type EmbedJob = z.infer<typeof EmbedJob>;

/** A listing with no canonical product yet (04 §4.3). */
export const MatchJob = z.object({ listingId: z.uuid() });
export type MatchJob = z.infer<typeof MatchJob>;

/**
 * Retries with backoff for unexpected errors. Blocked / robots / parse errors throw
 * UnrecoverableError and are never retried. Finished jobs are trimmed so Redis stays small.
 */
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
};

export type Queues = Record<QueueName, Queue>;

export function createQueues(connection: Redis, prefix = QUEUE_PREFIX): Queues {
  const make = (name: QueueName) =>
    new Queue(name, { connection, prefix, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  return Object.fromEntries(Object.values(QUEUES).map((name) => [name, make(name)])) as Queues;
}

export async function closeQueues(queues: Queues): Promise<void> {
  await Promise.all(Object.values(queues).map((q) => q.close()));
}

/** BullMQ custom ids may not contain ':'; hash long parts to keep ids short and safe. */
export function jobId(...parts: string[]): string {
  return parts.map((p) => (/^[\w.-]{1,64}$/.test(p) ? p : shortHash(p))).join('_');
}

export function shortHash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}
