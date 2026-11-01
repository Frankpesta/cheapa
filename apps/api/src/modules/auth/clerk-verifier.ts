import { verifyToken } from '@clerk/backend';
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';
import { API_ENV, type ApiEnv } from '../../config/env.js';

/** Claims we rely on, validated after the signature check. Unknown roles are ignored. */
const Claims = z.object({
  sub: z.string().min(1),
  role: z.enum(['user', 'admin']).optional().catch(undefined),
});

export interface VerifiedSession {
  clerkUserId: string;
  /** From a custom session-token claim {"role": "{{user.public_metadata.role}}"}, if configured. */
  role: 'user' | 'admin' | null;
}

/**
 * Verifies Clerk session tokens without a network call (CLERK_JWT_KEY).
 * Signature, expiry, not-before and (when configured) authorized party are checked.
 */
@Injectable()
export class ClerkVerifier {
  private readonly log = new Logger(ClerkVerifier.name);

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  async verify(token: string): Promise<VerifiedSession> {
    if (!this.env.CLERK_JWT_KEY) {
      throw new ServiceUnavailableException('Sign-in is not configured on this server');
    }
    // The public verifyToken returns the payload and THROWS on any failure (its .d.ts
    // describes the internal { data, errors } form; the runtime export wraps it).
    let payload: unknown;
    try {
      payload = await verifyToken(token, {
        jwtKey: this.env.CLERK_JWT_KEY,
        ...(this.env.CLERK_AUTHORIZED_PARTIES.length > 0
          ? { authorizedParties: this.env.CLERK_AUTHORIZED_PARTIES }
          : {}),
      });
    } catch (error) {
      return this.reject(errorReason(error));
    }
    const claims = Claims.safeParse(payload);
    if (!claims.success) return this.reject('claims-invalid');
    return { clerkUserId: claims.data.sub, role: claims.data.role ?? null };
  }

  /** Log the reason only (e.g. token-expired, token-invalid-signature), never the token. */
  private reject(reason: string): never {
    this.log.debug({ reason }, 'session token rejected');
    throw new UnauthorizedException('Invalid or expired session');
  }
}

function errorReason(error: unknown): string {
  if (error && typeof error === 'object' && 'reason' in error && typeof error.reason === 'string') {
    return error.reason;
  }
  return 'verify-failed';
}
