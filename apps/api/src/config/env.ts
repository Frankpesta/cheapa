import {
  baseEnv,
  catalogDbEnv,
  envBoolean,
  envInt,
  envList,
  envPort,
  loadEnv,
  redisEnv,
  usersDbEnv,
} from '@cheapa/core';
import { z } from 'zod';

export const apiEnvSchema = baseEnv
  .extend(catalogDbEnv.shape)
  .extend(usersDbEnv.shape)
  .extend(redisEnv.shape)
  .extend({
    API_PORT: envPort.default(8080),
    API_HOST: z.string().default('0.0.0.0'),
    /** Comma-separated web origins allowed by CORS. */
    CORS_ORIGINS: envList.default(['http://localhost:3000']),
    /** Set true behind Caddy so request.ip is the client, not the proxy. */
    TRUST_PROXY: envBoolean.default(false),
    /** Anonymous image searches per device per hour (01-foundation.md 1.5). */
    RATE_LIMIT_IMAGE_PER_DEVICE_HOUR: envInt.pipe(z.number().positive()).default(20),
    /** Backstop per IP per hour; high because Nigerian carriers share IPs (CGNAT). */
    RATE_LIMIT_IMAGE_PER_IP_HOUR: envInt.pipe(z.number().positive()).default(300),
    APP_VERSION: z.string().default('dev'),
    // Clerk (08-user-side.md 8.3). Optional outside production so the API runs before keys exist.
    CLERK_SECRET_KEY: z.string().startsWith('sk_').optional(),
    /** PEM public key for networkless JWT verification; literal "\n" sequences become newlines. */
    CLERK_JWT_KEY: z
      .string()
      .transform((v) => v.replace(/\\n/g, '\n').trim())
      .pipe(z.string().startsWith('-----BEGIN PUBLIC KEY-----'))
      .optional(),
    /** Allowed "azp" claims (web origins). Empty = don't check (native apps send none). */
    CLERK_AUTHORIZED_PARTIES: envList.default([]),
    CLERK_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['CLERK_SECRET_KEY', 'CLERK_JWT_KEY'] as const) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' });
    }
  });

export type ApiEnv = z.output<typeof apiEnvSchema>;

export const API_ENV = Symbol('API_ENV');

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return loadEnv(apiEnvSchema, source);
}
