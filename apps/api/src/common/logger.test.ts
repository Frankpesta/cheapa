import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { loadApiEnv } from '../config/env.js';
import { createLogger } from './logger.js';

const env = loadApiEnv({
  NODE_ENV: 'test',
  CATALOG_DATABASE_URL: 'postgres://u:p@localhost:5432/c',
  USERS_DATABASE_URL: 'postgres://u:p@localhost:5432/u',
  REDIS_QUEUE_URL: 'redis://localhost:6379',
  REDIS_CACHE_URL: 'redis://localhost:6380',
});

function capture() {
  const chunks: string[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _enc, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  const logger = createLogger(env, 'api', sink);
  // The redacting Transform is async: wait a tick for piped data to arrive.
  const lines = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    return chunks.join('');
  };
  return { logger, lines };
}

describe('logger redaction', () => {
  it('redacts emails and phone numbers however they are logged', async () => {
    const { logger, lines } = capture();
    logger.error({ err: new Error('failed for ada@example.com') }, 'call 08031234567 back');
    logger.info('user +2348031234567 searched');
    logger.error({ msg: 'nest style ada@example.com' });
    logger.error({ err: new Error('only err 08031234567') });
    logger.info({ note: 'nested field 0905-123-4567' }, 'ok');
    const out = await lines();
    for (const leak of ['ada@example.com', '08031234567', '2348031234567', '0905-123-4567']) {
      expect(out).not.toContain(leak);
    }
    expect(out).toContain('[redacted]');
    expect(out).toContain('"type":"Error"');
  });

  it('keeps every line valid JSON', async () => {
    const { logger, lines } = capture();
    logger.info({ email: 'ada@example.com', token: 'Bearer abc.def' }, 'x');
    const out = await lines();
    for (const line of out.trim().split('\n')) expect(() => JSON.parse(line) as unknown).not.toThrow();
  });

  it('drops authorization and cookie headers', async () => {
    const { logger, lines } = capture();
    logger.info({ req: { headers: { authorization: 'Bearer abc', cookie: 's=1', accept: '*/*' } } }, 'req');
    const out = await lines();
    expect(out).not.toContain('Bearer abc');
    expect(out).not.toContain('s=1');
    expect(out).toContain('*/*');
  });
});
