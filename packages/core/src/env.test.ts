import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { baseEnv, catalogDbEnv, envBoolean, envInt, envList, EnvError, loadEnv, redisEnv } from './env.js';

const schema = baseEnv.extend(catalogDbEnv.shape).extend(redisEnv.shape);
const valid = {
  CATALOG_DATABASE_URL: 'postgres://cheapa_catalog:pw@localhost:5432/cheapa_catalog',
  REDIS_QUEUE_URL: 'redis://localhost:6379',
  REDIS_CACHE_URL: 'redis://localhost:6380',
};

describe('loadEnv', () => {
  it('parses and applies defaults', () => {
    expect(loadEnv(schema, valid)).toEqual({ ...valid, NODE_ENV: 'development', LOG_LEVEL: 'info' });
  });

  it('lists every problem in one error', () => {
    try {
      loadEnv(schema, { REDIS_QUEUE_URL: 'http://wrong', NODE_ENV: 'staging' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const { issues } = error as EnvError;
      expect(issues.some((i) => i.startsWith('CATALOG_DATABASE_URL'))).toBe(true);
      expect(issues.some((i) => i.startsWith('REDIS_QUEUE_URL'))).toBe(true);
      expect(issues.some((i) => i.startsWith('REDIS_CACHE_URL'))).toBe(true);
      expect(issues.some((i) => i.startsWith('NODE_ENV'))).toBe(true);
    }
  });

  it('treats empty strings as unset', () => {
    expect(() => loadEnv(schema, { ...valid, CATALOG_DATABASE_URL: '' })).toThrow(EnvError);
    expect(loadEnv(schema, { ...valid, LOG_LEVEL: '' }).LOG_LEVEL).toBe('info');
  });

  it('never echoes secret values in the error', () => {
    const secret = 'postgres://u:supersecret@host/db?x';
    expect(() => loadEnv(schema, { ...valid, REDIS_CACHE_URL: secret })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('supersecret') as unknown }),
    );
  });
});

describe('field helpers', () => {
  const helpers = z.object({ FLAG: envBoolean, CAP: envInt, ORIGINS: envList });

  it('coerces strings', () => {
    expect(
      loadEnv(helpers, { FLAG: 'yes', CAP: '2000', ORIGINS: 'https://cheapa.ng, http://localhost:3000,' }),
    ).toEqual({
      FLAG: true,
      CAP: 2000,
      ORIGINS: ['https://cheapa.ng', 'http://localhost:3000'],
    });
  });

  it('rejects invalid values', () => {
    expect(() => loadEnv(helpers, { FLAG: 'maybe', CAP: '1.5', ORIGINS: '' })).toThrow(EnvError);
  });
});
