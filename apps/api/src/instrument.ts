/**
 * Sentry bootstrap. Must run before anything else so auto-instrumentation can hook
 * http, fastify and pg: in production via `node --import ./dist/instrument.js`,
 * in dev by being the first import of main.ts / main.jobs.ts. Safe to load twice.
 *
 * Privacy (01-foundation.md 1.7): dataCollection off for user info, cookies, bodies,
 * query params, DB data and local variables; no session replay; every event,
 * transaction and breadcrumb passes through the shared scrubber in @cheapa/core.
 */
import { SAFE_HEADERS, scrubBreadcrumb, scrubSentryEvent, scrubSpan } from '@cheapa/core';
import * as Sentry from '@sentry/nestjs';
import { z } from 'zod';

const SentryEnv = z.object({
  SENTRY_DSN_API: z.url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  NODE_ENV: z.string().default('development'),
  APP_VERSION: z.string().default('dev'),
});

export function initSentry(
  source: Record<string, string | undefined> = process.env,
  overrides: Partial<Sentry.NodeOptions> = {},
): boolean {
  if (Sentry.isInitialized()) return true;
  const env = SentryEnv.parse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== '')));
  if (!env.SENTRY_DSN_API && !overrides.dsn) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN_API,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.APP_VERSION,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    // Collect as little as possible at the source; the scrubber below is the second layer.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: [...SAFE_HEADERS] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    beforeSend: (event) => scrubSentryEvent(event),
    // Spans stream by default in Sentry 11 (beforeSendTransaction is ignored).
    beforeSendSpan: (span) => scrubSpan(span),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
    ...overrides,
  });
  return true;
}

initSentry();
