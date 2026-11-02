import { redactText } from '@cheapa/core';
import { Transform } from 'node:stream';
import { pino, type Logger } from 'pino';

/**
 * One pino instance for the worker. Every line passes through redactText before it is
 * written. Child loggers carry storeId / jobId / queue (CLAUDE.md logging rule).
 */
export function createLogger(level: string, destination: NodeJS.WritableStream = process.stdout): Logger {
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      done(null, redactText(chunk.toString('utf8')));
    },
  });
  stream.pipe(destination);
  return pino({ level, base: { service: 'worker' } }, stream);
}

export type { Logger };
