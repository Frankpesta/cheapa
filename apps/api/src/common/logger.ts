import { REQUEST_ID_HEADER } from '@cheapa/core';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { LoggerOptions } from 'pino';
import type { ApiEnv } from '../config/env.js';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Reuse a caller's x-request-id when it looks sane (Caddy, mobile retries), else mint one. */
export function genReqId(req: IncomingMessage): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value && SAFE_REQUEST_ID.test(value) ? value : randomUUID();
}

export function loggerOptions(env: ApiEnv, service: 'api' | 'api-jobs' = 'api'): LoggerOptions {
  const pretty = env.NODE_ENV === 'development' && process.stdout.isTTY;
  return {
    level: env.LOG_LEVEL,
    base: { service },
    // Never log credentials. Bodies (uploads, queries) are never logged at all.
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      remove: true,
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  };
}
