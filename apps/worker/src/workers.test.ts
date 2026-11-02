import type { Job } from 'bullmq';
import { pino } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrawlOutcome, type WorkerDeps } from './jobs/deps.js';
import { reportFailure } from './workers.js';

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), tags: [] as Record<string, string>[] }));
vi.mock('@sentry/node', () => ({
  captureException: sentry.captureException,
  withScope: (fn: (scope: { setTags: (t: Record<string, string>) => void }) => void) =>
    fn({ setTags: (t) => sentry.tags.push(t) }),
}));

const deps = { log: pino({ level: 'silent' }) } as unknown as WorkerDeps;
const job = (attemptsMade: number) =>
  ({ id: 'j1', data: { storeId: 's1' }, attemptsMade, opts: { attempts: 3 } }) as unknown as Job;

describe('reportFailure', () => {
  beforeEach(() => {
    sentry.captureException.mockClear();
    sentry.tags.length = 0;
  });

  it('waits for the final attempt of an unexpected error', () => {
    reportFailure(deps, 'fetch', job(1), new Error('boom'));
    expect(sentry.captureException).not.toHaveBeenCalled();
    reportFailure(deps, 'fetch', job(3), new Error('boom'));
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(sentry.tags).toEqual([{ queue: 'fetch', jobId: 'j1', storeId: 's1' }]);
  });

  it('never reports blocked/robots outcomes, always reports broken parsers', () => {
    reportFailure(deps, 'discover', job(1), new CrawlOutcome('blocked', false));
    expect(sentry.captureException).not.toHaveBeenCalled();
    reportFailure(deps, 'fetch', job(1), new CrawlOutcome('no products array', true));
    expect(sentry.captureException).toHaveBeenCalledOnce();
  });
});
