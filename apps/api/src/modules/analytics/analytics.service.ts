import { scrubAnalyticsProps } from '@cheapa/core';
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { PostHog } from 'posthog-node';
import { API_ENV, type ApiEnv } from '../../config/env.js';
import type { Identity } from '../auth/auth.decorators.js';

/** Server-side events (01-foundation.md 1.7). Add new ones here so the shape stays reviewed. */
export interface AnalyticsEvents {
  search_served: {
    kind: 'image' | 'text';
    source: string;
    latencyMs: number;
    cacheHit: boolean;
    productCount: number;
    lookalikeCount: number;
    visionProvider: string | null;
    lowConfidence: boolean;
  };
  click_redirected: { storeId: string; affiliate: boolean };
  watch_created: { condition: string; hasTarget: boolean };
  alert_sent: { channel: string };
  account_deleted: Record<string, never>;
}

/**
 * PostHog wrapper. A no-op without POSTHOG_API_KEY. Identifies people by user id or
 * anonymous device id only; properties pass through scrubAnalyticsProps (no free
 * text, hashes, emails or phone numbers). No GeoIP: the server's IP says nothing
 * about the shopper, and the shopper's IP is personal data.
 */
@Injectable()
export class AnalyticsService implements OnApplicationShutdown {
  private readonly log = new Logger(AnalyticsService.name);
  private readonly client: PostHog | null;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.client = env.POSTHOG_API_KEY
      ? new PostHog(env.POSTHOG_API_KEY, {
          host: env.POSTHOG_HOST,
          disableGeoip: true,
          flushAt: 20,
          flushInterval: 10_000,
        })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  capture<E extends keyof AnalyticsEvents>(
    identity: Identity,
    event: E,
    properties: AnalyticsEvents[E],
    requestId?: string,
  ): void {
    if (!this.client) return;
    const distinctId = identity.user?.id ?? identity.device?.id;
    this.client.capture({
      distinctId: distinctId ?? `req:${requestId ?? 'unknown'}`,
      event,
      properties: {
        ...scrubAnalyticsProps(properties),
        signedIn: identity.user !== null,
        // Requests with no user or device don't create person profiles.
        ...(distinctId ? {} : { $process_person_profile: false }),
      },
    });
  }

  /** After sign-in: join the device's earlier events to the user. */
  alias(userId: string, deviceId: string): void {
    this.client?.alias({ distinctId: userId, alias: deviceId });
  }

  async flush(): Promise<void> {
    await this.client?.flush();
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.client?.shutdown(5_000);
    } catch (error) {
      this.log.warn({ err: error instanceof Error ? error.message : 'unknown' }, 'posthog shutdown failed');
    }
  }
}
