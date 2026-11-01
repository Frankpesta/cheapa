import { z } from 'zod';

/**
 * Zod env loader used by every app. Each app composes the fragments it needs and
 * passes its own source (process.env), so this module has no Node dependency.
 *
 *   const env = loadEnv(baseEnv.extend(catalogDbEnv.shape).extend(redisEnv.shape), process.env);
 */

export class EnvError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

type EnvSource = Record<string, string | undefined>;

export function loadEnv<T extends z.ZodType>(schema: T, source: EnvSource): z.output<T> {
  // Treat empty strings as unset so `FOO=` in .env falls back to defaults / fails required.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Field helpers (env values are always strings)
// ---------------------------------------------------------------------------

export const envBoolean = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

export const envInt = z.coerce.number().int();
export const envPort = z.coerce.number().int().min(1).max(65_535);
export const envList = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const postgresUrl = z.url({ protocol: /^postgres(?:ql)?$/ });
const redisUrl = z.url({ protocol: /^rediss?$/ });

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

export const baseEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

/** cheapa_catalog. Every service that touches the catalog. */
export const catalogDbEnv = z.object({ CATALOG_DATABASE_URL: postgresUrl });

/** cheapa_users. apps/api only (CLAUDE.md rule 2). */
export const usersDbEnv = z.object({ USERS_DATABASE_URL: postgresUrl });

/** Queue instance must never evict; cache instance may (CLAUDE.md, two Redis instances). */
export const redisEnv = z.object({ REDIS_QUEUE_URL: redisUrl, REDIS_CACHE_URL: redisUrl });
