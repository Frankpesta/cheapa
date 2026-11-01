import { REQUEST_ID_HEADER, redactText } from '@cheapa/core';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pino, type Logger } from 'pino';
import type { ApiEnv } from '../config/env.js';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Reuse a caller's x-request-id when it looks sane (Caddy, mobile retries), else mint one. */
export function genReqId(req: IncomingMessage): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value && SAFE_REQUEST_ID.test(value) ? value : randomUUID();
}

/**
 * Last line of defence: every finished log line passes through redactText (emails,
 * phone numbers, bearer tokens, keys) before it is written, whichever logger produced
 * it (Fastify request logs, nestjs-pino app logs, Nest's exception handler).
 * Pino writes one JSON object per line, and redactText never introduces quotes,
 * so the output stays valid JSON.
 */
export function redactingStream(destination: NodeJS.WritableStream = process.stdout): Transform {
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      done(null, redactText(chunk.toString('utf8')));
    },
  });
  stream.pipe(destination);
  return stream;
}

/**
 * The one pino instance for a process. Fastify (loggerInstance) and nestjs-pino both
 * use it, so options and redaction apply everywhere.
 */
export function createLogger(
  env: ApiEnv,
  service: 'api' | 'api-jobs' = 'api',
  destination?: NodeJS.WritableStream,
): Logger {
  const options = {
    level: env.LOG_LEVEL,
    base: { service },
    // Never log credentials. Bodies (uploads, queries) are never logged at all.
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      remove: true,
    },
  };
  const pretty = !destination && env.NODE_ENV === 'development' && process.stdout.isTTY;
  if (pretty) {
    // pino-pretty is a dev dependency: only loaded for local interactive runs.
    // pino.transport returns a ThreadStream: it implements write/end/on, which is all
    // pipe() uses, but its typings don't extend NodeJS.WritableStream.
    const transport = pino.transport({
      target: 'pino-pretty',
      options: { singleLine: true },
    }) as unknown as NodeJS.WritableStream;
    return pino(options, redactingStream(transport));
  }
  return pino(options, redactingStream(destination));
}
