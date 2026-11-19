import { z } from 'zod';

/** BullMQ queue on redis-queue: /go enqueues, api-jobs inserts the row (08 §8.4). */
export const CLICKS_QUEUE_NAME = 'clicks';
export const QUEUE_PREFIX = 'cheapa';

export const ClickJob = z.object({
  id: z.uuid(),
  userId: z.uuid().nullable(),
  deviceId: z.uuid().nullable(),
  listingId: z.uuid(),
  productId: z.uuid().nullable(),
  storeId: z.uuid(),
  affiliateNetwork: z.string().nullable(),
  searchRequestId: z.uuid().nullable(),
  /** When the redirect happened (ISO); the row keeps it, not the insert time. */
  at: z.iso.datetime(),
});
export type ClickJob = z.infer<typeof ClickJob>;

export const CLICK_JOB_OPTIONS = {
  attempts: 8,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
} as const;
