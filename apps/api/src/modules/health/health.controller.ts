import type { HealthResponse } from '@cheapa/core';
import type { CatalogConnection } from '@cheapa/db/catalog';
import type { UsersConnection } from '@cheapa/db/users';
import { Controller, Get, HttpCode, Inject, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { API_ENV, type ApiEnv } from '../../config/env.js';
import { Public } from '../auth/auth.decorators.js';
import { CATALOG_DB, USERS_DB } from '../../infra/database.module.js';
import { REDIS_CACHE, REDIS_QUEUE } from '../../infra/redis.module.js';

const TIMEOUT_MS = 2_000;

async function probe(run: () => Promise<unknown>): Promise<HealthResponse['checks']['catalogDb']> {
  const started = performance.now();
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
      ),
    ]);
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    // Message only: never connection strings or stack traces.
    const message = error instanceof Error ? error.message.split('\n')[0] : 'unknown error';
    return { ok: false, latencyMs: Math.round(performance.now() - started), error: message };
  }
}

@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(CATALOG_DB) private readonly catalog: CatalogConnection,
    @Inject(USERS_DB) private readonly users: UsersConnection,
    @Inject(REDIS_QUEUE) private readonly redisQueue: Redis,
    @Inject(REDIS_CACHE) private readonly redisCache: Redis,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /** 200 when every dependency answers, 503 otherwise (uptime monitors watch this). */
  @Get()
  @HttpCode(200)
  async check(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthResponse> {
    const [catalogDb, usersDb, redisQueue, redisCache] = await Promise.all([
      probe(() => this.catalog.pool.query('select 1')),
      probe(() => this.users.pool.query('select 1')),
      probe(() => this.redisQueue.ping()),
      probe(() => this.redisCache.ping()),
    ]);
    const checks = { catalogDb, usersDb, redisQueue, redisCache };
    const ok = Object.values(checks).every((c) => c.ok);
    if (!ok) void reply.status(503);
    return { status: ok ? 'ok' : 'degraded', version: this.env.APP_VERSION, checks };
  }
}
