import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { API_ENV, type ApiEnv } from '../../config/env.js';
import { CLICK_JOB_OPTIONS, CLICKS_QUEUE_NAME, ClickJob, QUEUE_PREFIX } from './click-job.js';

/**
 * Producer side of the `clicks` queue. `add` is not awaited by /go: the redirect never
 * waits on Redis or Postgres (08 §8.4). The job id is the click id, so a retry is a no-op.
 */
@Injectable()
export class ClicksQueue implements OnApplicationShutdown {
  private readonly log = new Logger(ClicksQueue.name);
  private readonly connection: Redis;
  private readonly queue: Queue<ClickJob>;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.connection = new Redis(env.REDIS_QUEUE_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    this.connection.on('error', () => undefined);
    this.queue = new Queue<ClickJob>(CLICKS_QUEUE_NAME, {
      connection: this.connection,
      prefix: QUEUE_PREFIX,
      defaultJobOptions: CLICK_JOB_OPTIONS,
    });
  }

  /** Resolves when Redis has the job; callers may ignore it. */
  enqueue(job: ClickJob): Promise<void> {
    return this.queue.add('click', job, { jobId: job.id }).then(
      () => undefined,
      (error: unknown) => {
        this.log.error(
          { clickId: job.id, err: error instanceof Error ? error.message : 'unknown' },
          'click not queued',
        );
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close().catch(() => undefined);
    this.connection.disconnect();
  }
}
