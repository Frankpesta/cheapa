/**
 * What the API calls: active provider, then the fallback on failure, under the daily
 * spend cap. Never throws for vendor trouble; returns `skipped` so search falls back
 * to embeddings only (05 §5.2).
 */
import type { SpendLedger } from './spend.js';
import type { DescribeOptions, ImageInput, VisionProvider, VisionResult, VisionUsage } from './types.js';

export type VisionOutcome =
  | { status: 'ok'; providerId: string; result: VisionResult; usage: VisionUsage }
  | { status: 'skipped'; reason: 'cap_reached' | 'refused' | 'failed' };

export interface VisionLog {
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface VisionServiceOptions {
  primary: VisionProvider;
  fallback?: VisionProvider;
  ledger: SpendLedger;
  dailyCapUsd: number;
  log?: VisionLog;
}

export interface VisionService {
  describe(img: ImageInput, opts?: DescribeOptions): Promise<VisionOutcome>;
}

export function createVisionService(options: VisionServiceOptions): VisionService {
  const { primary, fallback, ledger, dailyCapUsd, log } = options;
  const chain = fallback && fallback.id !== primary.id ? [primary, fallback] : [primary];

  return {
    async describe(img, opts) {
      const spent = await ledger.spentToday();
      if (spent >= dailyCapUsd) {
        log?.warn({ spentUsd: spent, capUsd: dailyCapUsd }, 'vision daily cap reached; embeddings only');
        return { status: 'skipped', reason: 'cap_reached' };
      }
      let refused = false;
      for (const provider of chain) {
        try {
          const { result, usage } = await provider.describeProduct(img, opts);
          await ledger.add(usage.costUsd);
          return { status: 'ok', providerId: provider.id, result, usage };
        } catch (error) {
          if (opts?.signal?.aborted) throw error;
          refused ||= error instanceof Error && error.name === 'VisionRefusedError';
          log?.warn(
            { providerId: provider.id, err: error instanceof Error ? error.name : 'unknown' },
            'vision provider failed',
          );
        }
      }
      return { status: 'skipped', reason: refused ? 'refused' : 'failed' };
    },
  };
}
