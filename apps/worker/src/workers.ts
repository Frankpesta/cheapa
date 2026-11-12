import * as Sentry from '@sentry/node';
import { Worker, type Job, type Processor } from 'bullmq';
import type { Redis } from 'ioredis';
import { CrawlOutcome, type WorkerDeps } from './jobs/deps.js';
import { runDiscover } from './jobs/discover.js';
import { runFetch } from './jobs/fetch.js';
import { fetchFinished } from './jobs/health.js';
import { runProcess } from './jobs/process.js';
import { runPartitions, runTick } from './jobs/tick.js';
import {
  QUEUE_PREFIX,
  QUEUES,
  type DiscoverJob,
  type FetchJob,
  type ProcessJob,
  type Queues,
} from './queues.js';
import { TICK_EVERY_MS } from './schedule.js';

export interface Concurrency {
  discover: number;
  fetch: number;
  process: number;
}

/**
 * Consumers for schedule, discover, fetch and process. `embed` and `match` land with
 * phases 05 and 04 (BACKLOG.md).
 */
export function startWorkers(
  deps: WorkerDeps,
  connection: Redis,
  concurrency: Concurrency,
  prefix = QUEUE_PREFIX,
): Worker[] {
  const make = <D>(name: string, processor: Processor<D>, n: number) => {
    const worker = new Worker<D>(name, processor, { connection, prefix, concurrency: n });
    worker.on('failed', (job, err) => reportFailure(deps, name, job, err));
    worker.on('error', (err) => deps.log.error({ err, queue: name }, 'worker error'));
    return worker;
  };
  return [
    make<unknown>(
      QUEUES.schedule,
      async (job) => {
        if (job.name === 'tick') return runTick(deps);
        if (job.name === 'partitions') return runPartitions(deps);
        throw new Error(`unknown schedule job ${job.name}`);
      },
      1,
    ),
    make<DiscoverJob>(QUEUES.discover, (job) => runDiscover(deps, job), concurrency.discover),
    make<FetchJob>(
      QUEUES.fetch,
      async (job) => {
        const result = await runFetch(deps, job);
        await fetchFinished(deps, job.data.crawlJobId, false);
        return result;
      },
      concurrency.fetch,
    ),
    make<ProcessJob>(QUEUES.process, (job) => runProcess(deps, job), concurrency.process),
  ];
}

/** Repeatable jobs. Upserts are idempotent, so every worker process may call this on boot. */
export async function upsertSchedules(queues: Queues): Promise<void> {
  await queues.schedule.upsertJobScheduler('tick', { every: TICK_EVERY_MS }, { name: 'tick' });
  await queues.schedule.upsertJobScheduler(
    'partitions',
    { pattern: '0 3 * * *', tz: 'Africa/Lagos' },
    { name: 'partitions' },
  );
}

/**
 * Logs every failure; sends only final, unexpected ones to Sentry with storeId/jobId.
 * Blocked/robots outcomes are alerts (already sent) and stay out of Sentry.
 */
export function reportFailure(deps: WorkerDeps, queue: string, job: Job | undefined, err: Error): void {
  const storeId = (job?.data as { storeId?: string } | undefined)?.storeId;
  const final = isFinalFailure(job, err);
  // A fetch that failed for good still counts toward its run's completion and error rate.
  if (final && queue === QUEUES.fetch && job) {
    const { crawlJobId } = job.data as { crawlJobId: string };
    fetchFinished(deps, crawlJobId, true).catch((e: unknown) =>
      deps.log.error(
        { err: e instanceof Error ? e.message : String(e), crawlJobId },
        'fetch accounting failed',
      ),
    );
  }
  deps.log.warn(
    { queue, jobId: job?.id, storeId, attempt: job?.attemptsMade, final, err: err.message },
    'job failed',
  );
  if (!final || (err instanceof CrawlOutcome && !err.reportToSentry)) return;
  Sentry.withScope((scope) => {
    scope.setTags({ queue, jobId: job?.id ?? 'unknown', ...(storeId ? { storeId } : {}) });
    Sentry.captureException(err);
  });
}

/** No retries left (or an expected outcome that is never retried). */
export function isFinalFailure(job: Job | undefined, err: Error): boolean {
  return err instanceof CrawlOutcome || !job || job.attemptsMade >= (job.opts.attempts ?? 1);
}
