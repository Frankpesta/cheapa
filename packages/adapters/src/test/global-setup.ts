/**
 * One Redis for the whole adapters test run (rate limiter tests). Reused across local
 * runs for speed; remove it with `pnpm test:down`. CI gets a fresh one, stopped at the end.
 */
import { Redis } from 'ioredis';
import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    redisUrl: string;
  }
}

const reuse = process.env.CI !== 'true';
if (reuse) process.env.TESTCONTAINERS_REUSE_ENABLE ??= 'true';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const definition = new GenericContainer('redis:7.4.8-alpine')
    .withLabels({ 'cheapa.test': 'adapters' })
    .withCommand(['redis-server', '--maxmemory-policy', 'noeviction', '--save', '', '--appendonly', 'no'])
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'));
  const container = await (reuse ? definition.withReuse() : definition).start();
  const redisUrl = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;

  const redis = new Redis(redisUrl);
  await redis.flushall();
  redis.disconnect();

  project.provide('redisUrl', redisUrl);
  return async () => {
    if (!reuse) await container.stop();
  };
}
