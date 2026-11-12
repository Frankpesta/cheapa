import { PRICE_EVENTS_MAXLEN, PRICE_EVENTS_STREAM, type PriceChangedEvent } from '@cheapa/core';
import type { Redis } from 'ioredis';

export interface PriceEventSink {
  publish(events: readonly PriceChangedEvent[]): Promise<void>;
}

/**
 * Appends `price.changed` entries to the `events:price` stream on redis-queue, one
 * pipeline per batch. Each entry has `type` and `data` (the JSON event).
 */
export class RedisPriceEvents implements PriceEventSink {
  constructor(
    private readonly redis: Redis,
    private readonly stream = PRICE_EVENTS_STREAM,
  ) {}

  async publish(events: readonly PriceChangedEvent[]): Promise<void> {
    if (events.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const event of events) {
      pipeline.xadd(
        this.stream,
        'MAXLEN',
        '~',
        PRICE_EVENTS_MAXLEN,
        '*',
        'type',
        event.type,
        'data',
        JSON.stringify(event),
      );
    }
    const results = (await pipeline.exec()) ?? [];
    const failed = results.find(([err]) => err);
    if (failed?.[0]) throw failed[0];
  }
}
