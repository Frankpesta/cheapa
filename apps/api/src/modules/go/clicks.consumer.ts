import { clicks, type UsersConnection } from '@cheapa/db/users';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { API_ENV, type ApiEnv } from '../../config/env.js';
import { USERS_DB } from '../../infra/database.module.js';
import { CLICKS_QUEUE_NAME, ClickJob, QUEUE_PREFIX } from './click-job.js';

const FOREIGN_KEY_VIOLATION = '23503';

/** Inserts one clicks row per job, idempotent on the click id (08 §8.4). api-jobs only. */
export async function insertClick(db: UsersConnection['db'], job: ClickJob): Promise<void> {
  const row = {
    id: job.id,
    userId: job.userId,
    deviceId: job.deviceId,
    listingId: job.listingId,
    productId: job.productId,
    storeId: job.storeId,
    affiliateNetwork: job.affiliateNetwork,
    searchRequestId: job.searchRequestId,
    createdAt: new Date(job.at),
  };
  try {
    await db.insert(clicks).values(row).onConflictDoNothing();
  } catch (error) {
    // The user or device was deleted before the job ran: keep the click, anonymised (8.10).
    if ((error as { cause?: { code?: string } }).cause?.code !== FOREIGN_KEY_VIOLATION) throw error;
    await db
      .insert(clicks)
      .values({ ...row, userId: null, deviceId: null })
      .onConflictDoNothing();
  }
}

@Injectable()
export class ClicksConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(ClicksConsumer.name);
  private worker: Worker<ClickJob> | null = null;
  private connection: Redis | null = null;

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(USERS_DB) private readonly users: UsersConnection,
  ) {}

  onApplicationBootstrap(): void {
    this.connection = new Redis(this.env.REDIS_QUEUE_URL, { maxRetriesPerRequest: null });
    this.connection.on('error', () => undefined);
    this.worker = new Worker<ClickJob>(
      CLICKS_QUEUE_NAME,
      (job: Job<ClickJob>) => insertClick(this.users.db, ClickJob.parse(job.data)),
      { connection: this.connection, prefix: QUEUE_PREFIX, concurrency: 4 },
    );
    this.worker.on('failed', (job, error) => {
      const final = !!job && job.attemptsMade >= (job.opts.attempts ?? 1);
      this.log.warn(
        { jobId: job?.id, attempt: job?.attemptsMade, final, err: error.message },
        'click insert failed',
      );
      if (final) Sentry.captureException(error, { tags: { queue: CLICKS_QUEUE_NAME } });
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    this.connection?.disconnect();
  }
}
