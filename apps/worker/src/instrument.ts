/**
 * Sentry for the worker (01-foundation.md 1.7). Loaded first via
 * `node --import ./dist/instrument.js`, or as the first import of main.ts in dev.
 * Same privacy rules as the API: no bodies, no local variables, shared scrubber.
 */
import { scrubBreadcrumb, scrubSentryEvent, scrubSpan } from '@cheapa/core';
import * as Sentry from '@sentry/node';
import { z } from 'zod';

const SentryEnv = z.object({
  SENTRY_DSN_WORKER: z.url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  NODE_ENV: z.string().default('development'),
  APP_VERSION: z.string().default('dev'),
});

export function initSentry(source: Record<string, string | undefined> = process.env): boolean {
  if (Sentry.isInitialized()) return true;
  const env = SentryEnv.parse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== '')));
  if (!env.SENTRY_DSN_WORKER) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN_WORKER,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.APP_VERSION,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    beforeSend: (event) => scrubSentryEvent(event),
    beforeSendSpan: (span) => scrubSpan(span),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
  return true;
}

initSentry();
