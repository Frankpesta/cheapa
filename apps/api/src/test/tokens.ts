/** Clerk-shaped RS256 session tokens for tests, signed with a throwaway key. */
import { createSign, generateKeyPairSync } from 'node:crypto';

export interface TestSigner {
  publicKeyPem: string;
  sign: (
    claims: Record<string, unknown>,
    options?: { expiresInSec?: number; key?: 'valid' | 'other' },
  ) => string;
}

const b64url = (value: object | Buffer) =>
  (Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))).toString('base64url');

export function createTestSigner(): TestSigner {
  const valid = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    publicKeyPem: valid.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    sign(claims, { expiresInSec = 60, key = 'valid' } = {}) {
      const now = Math.floor(Date.now() / 1000);
      const header = b64url({ alg: 'RS256', typ: 'JWT', kid: 'test' });
      const payload = b64url({
        iat: now - 5,
        nbf: now - 5,
        exp: now + expiresInSec,
        sid: 'sess_test',
        ...claims,
      });
      const signer = createSign('RSA-SHA256').update(`${header}.${payload}`);
      const signature = signer.sign((key === 'valid' ? valid : other).privateKey);
      return `${header}.${payload}.${b64url(signature)}`;
    },
  };
}
