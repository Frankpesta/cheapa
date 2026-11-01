import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { EnvError } from '@cheapa/core';
import { loadApiEnv } from '../../config/env.js';
import { createTestSigner } from '../../test/tokens.js';
import { ClerkVerifier } from './clerk-verifier.js';

const baseEnv = {
  CATALOG_DATABASE_URL: 'postgres://u:p@localhost:5432/cheapa_catalog',
  USERS_DATABASE_URL: 'postgres://u:p@localhost:5432/cheapa_users',
  REDIS_QUEUE_URL: 'redis://localhost:6379',
  REDIS_CACHE_URL: 'redis://localhost:6380',
};

describe('ClerkVerifier', () => {
  it('answers 503 when sign-in is not configured (keys not filled in yet)', async () => {
    const verifier = new ClerkVerifier(loadApiEnv(baseEnv));
    await expect(verifier.verify('anything')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('verifies a token and reads sub and role', async () => {
    const signer = createTestSigner();
    const verifier = new ClerkVerifier(loadApiEnv({ ...baseEnv, CLERK_JWT_KEY: signer.publicKeyPem }));
    await expect(verifier.verify(signer.sign({ sub: 'user_1', role: 'admin' }))).resolves.toEqual({
      clerkUserId: 'user_1',
      role: 'admin',
    });
  });

  it('rejects tokens from another key', async () => {
    const signer = createTestSigner();
    const verifier = new ClerkVerifier(loadApiEnv({ ...baseEnv, CLERK_JWT_KEY: signer.publicKeyPem }));
    await expect(verifier.verify(signer.sign({ sub: 'user_1' }, { key: 'other' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('Clerk env', () => {
  it('requires the Clerk keys in production', () => {
    expect(() => loadApiEnv({ ...baseEnv, NODE_ENV: 'production' })).toThrow(EnvError);
  });

  it('rejects keys in the wrong format', () => {
    expect(() => loadApiEnv({ ...baseEnv, CLERK_SECRET_KEY: 'pk_test_wrong' })).toThrow(EnvError);
    expect(() => loadApiEnv({ ...baseEnv, CLERK_JWT_KEY: 'not a pem' })).toThrow(EnvError);
  });

  it('accepts the PEM on one line with literal \\n sequences, as in .env', () => {
    const pem = createTestSigner().publicKeyPem;
    const env = loadApiEnv({ ...baseEnv, CLERK_JWT_KEY: pem.replaceAll('\n', '\\n') });
    expect(env.CLERK_JWT_KEY).toBe(pem.trim());
  });
});
