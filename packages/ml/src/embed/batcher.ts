/**
 * Collects single calls into batches (05 §5.1: embed 16 at a time). Concurrent BullMQ
 * jobs each call `run(item)`; the batcher waits up to `maxWaitMs` for more items, then
 * hands the whole batch to `process` in one model call.
 */

export interface BatcherOptions<I, O> {
  /** Must return one output per input, in order. */
  process(this: void, items: I[]): Promise<O[]>;
  maxBatch?: number;
  maxWaitMs?: number;
}

interface Pending<I, O> {
  item: I;
  resolve(value: O): void;
  reject(err: unknown): void;
}

export class Batcher<I, O> {
  private readonly process: (items: I[]) => Promise<O[]>;
  private readonly maxBatch: number;
  private readonly maxWaitMs: number;
  private queue: Pending<I, O>[] = [];
  private timer: NodeJS.Timeout | undefined;
  /** Batches run one at a time: the model already uses every core. */
  private chain: Promise<void> = Promise.resolve();

  constructor(options: BatcherOptions<I, O>) {
    this.process = options.process;
    this.maxBatch = options.maxBatch ?? 16;
    this.maxWaitMs = options.maxWaitMs ?? 25;
  }

  run(item: I): Promise<O> {
    return new Promise<O>((resolve, reject) => {
      this.queue.push({ item, resolve, reject });
      if (this.queue.length >= this.maxBatch) this.flush();
      else this.timer ??= setTimeout(() => this.flush(), this.maxWaitMs);
    });
  }

  private flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.maxBatch);
      this.chain = this.chain.then(() => this.runBatch(batch));
    }
  }

  private async runBatch(batch: Pending<I, O>[]): Promise<void> {
    try {
      const out = await this.process(batch.map((p) => p.item));
      if (out.length !== batch.length) {
        throw new Error(`batch returned ${out.length} results for ${batch.length} items`);
      }
      batch.forEach((p, i) => p.resolve(out[i] as O));
    } catch (err) {
      for (const p of batch) p.reject(err);
    }
  }
}
