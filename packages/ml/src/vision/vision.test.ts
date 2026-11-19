import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { prepareVisionImage, VisionImageError } from './image.js';
import { createAnthropicVision } from './providers/anthropic.js';
import { createVisionService } from './service.js';
import { lagosDay, memorySpendLedger, redisSpendLedger } from './spend.js';
import {
  VisionInvalidOutputError,
  VisionRefusedError,
  type ImageInput,
  type VisionProvider,
  type VisionResult,
} from './types.js';
import { fromWire, type WireVisionResult } from './wire.js';

const wire = (over: Partial<WireVisionResult> = {}): WireVisionResult => ({
  isProduct: true,
  category: 'maxi dress',
  brand: ' ',
  model: null,
  modelNumber: null,
  variant: [
    { key: 'colour', value: 'emerald green' },
    { key: 'material', value: 'satin' },
    { key: '', value: 'dropped' },
  ],
  visibleText: ['18.5k', ' DM to order ', ''],
  priceNaira: 18_500,
  searchQuery: ' emerald green satin maxi dress ',
  confidence: 1.3,
  items: [{ kind: 'dress', description: 'satin maxi', bbox: { x: 0.2, y: 0.1, w: 0.9, h: 0.8 } }],
  ...over,
});

const img: ImageInput = { bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/jpeg' };

describe('fromWire', () => {
  it('converts to VisionResult: naira to kobo, variant record, clamps and trims', () => {
    const r = fromWire(wire());
    expect(r.priceSeen).toBe(1_850_000);
    expect(r.brand).toBeNull();
    expect(r.variant).toEqual({ colour: 'emerald green', material: 'satin' });
    expect(r.visibleText).toEqual(['18.5k', 'DM to order']);
    expect(r.searchQuery).toBe('emerald green satin maxi dress');
    expect(r.confidence).toBe(1);
    expect(r.items[0]!.bbox.w).toBeCloseTo(0.8);
  });

  it('drops zero or negative prices', () => {
    expect(fromWire(wire({ priceNaira: 0 })).priceSeen).toBeNull();
    expect(fromWire(wire({ priceNaira: -5 })).priceSeen).toBeNull();
  });
});

function fakeClient(responses: unknown[]) {
  const parse = vi.fn(() => {
    const next = responses.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  return { client: { messages: { parse } } as never, parse };
}

const ok = (parsed: WireVisionResult | null, stop = 'end_turn') => ({
  parsed_output: parsed,
  stop_reason: stop,
  usage: { input_tokens: 1000, output_tokens: 200 },
});

describe('anthropic provider', () => {
  it('returns the result with cost from the price table', async () => {
    const { client, parse } = fakeClient([ok(wire())]);
    const provider = createAnthropicVision('anthropic:haiku', { client });
    const { result, usage } = await provider.describeProduct(img, { hintText: 'price 18.5k' });
    expect(result.category).toBe('maxi dress');
    expect(usage.costUsd).toBeCloseTo((1000 * 0.1 + 200 * 0.5) / 1e6);
    const params = (parse.mock.calls[0] as unknown[])[0] as { model: string; messages: unknown[] };
    expect(params.model).toBe('claude-haiku-5-5');
    expect(JSON.stringify(params.messages)).toContain('price 18.5k');
  });

  it('retries once on missing output and sums the cost', async () => {
    const { client, parse } = fakeClient([ok(null, 'max_tokens'), ok(wire())]);
    const provider = createAnthropicVision('anthropic:haiku', { client });
    const { usage } = await provider.describeProduct(img);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(usage.costUsd).toBeCloseTo(2 * 0.0002);
  });

  it('gives up after the retry', async () => {
    const { client } = fakeClient([ok(null), new SyntaxError('bad json')]);
    const provider = createAnthropicVision('anthropic:haiku', { client });
    await expect(provider.describeProduct(img)).rejects.toBeInstanceOf(VisionInvalidOutputError);
  });

  it('does not retry a refusal', async () => {
    const { client, parse } = fakeClient([ok(null, 'refusal'), ok(wire())]);
    const provider = createAnthropicVision('anthropic:haiku', { client });
    await expect(provider.describeProduct(img)).rejects.toBeInstanceOf(VisionRefusedError);
    expect(parse).toHaveBeenCalledTimes(1);
  });
});

const result: VisionResult = fromWire(wire());
const provider = (id: string, impl: VisionProvider['describeProduct']): VisionProvider => ({
  id,
  describeProduct: impl,
});
const usage = { inputTokens: 1, outputTokens: 1, costUsd: 0.01, latencyMs: 5 };

describe('vision service', () => {
  it('records spend and returns the primary result', async () => {
    const ledger = memorySpendLedger();
    const service = createVisionService({
      primary: provider('a', () => Promise.resolve({ result, usage })),
      ledger,
      dailyCapUsd: 1,
    });
    expect(await service.describe(img)).toMatchObject({ status: 'ok', providerId: 'a' });
    expect(await ledger.spentToday()).toBeCloseTo(0.01);
  });

  it('falls back when the primary fails', async () => {
    const service = createVisionService({
      primary: provider('a', () => Promise.reject(new Error('down'))),
      fallback: provider('b', () => Promise.resolve({ result, usage })),
      ledger: memorySpendLedger(),
      dailyCapUsd: 1,
    });
    expect(await service.describe(img)).toMatchObject({ status: 'ok', providerId: 'b' });
  });

  it('skips vision once the daily cap is spent', async () => {
    const ledger = memorySpendLedger();
    await ledger.add(1);
    const describeProduct = vi.fn();
    const warn = vi.fn();
    const service = createVisionService({
      primary: provider('a', describeProduct),
      ledger,
      dailyCapUsd: 1,
      log: { warn },
    });
    expect(await service.describe(img)).toEqual({ status: 'skipped', reason: 'cap_reached' });
    expect(describeProduct).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('reports refusals without throwing', async () => {
    const service = createVisionService({
      primary: provider('a', () => Promise.reject(new VisionRefusedError('a'))),
      ledger: memorySpendLedger(),
      dailyCapUsd: 1,
    });
    expect(await service.describe(img)).toEqual({ status: 'skipped', reason: 'refused' });
  });
});

describe('spend ledger', () => {
  it('uses the Lagos calendar day', () => {
    expect(lagosDay(new Date('2026-11-19T23:30:00Z'))).toBe('2026-11-20');
    expect(lagosDay(new Date('2026-11-19T22:59:00Z'))).toBe('2026-11-19');
  });

  it('redis ledger increments a dated key with an expiry', async () => {
    const store = new Map<string, number>();
    const redis = {
      get: (k: string) => Promise.resolve(store.has(k) ? String(store.get(k)) : null),
      incrbyfloat: (k: string, n: number) =>
        Promise.resolve(String(store.set(k, (store.get(k) ?? 0) + n).get(k))),
      expire: vi.fn(() => Promise.resolve(1)),
    };
    const ledger = redisSpendLedger(redis);
    const now = new Date('2026-11-19T10:00:00Z');
    await ledger.add(0.25, now);
    await ledger.add(0.5, now);
    expect(await ledger.spentToday(now)).toBeCloseTo(0.75);
    expect(store.has('vision:spend:2026-11-19')).toBe(true);
    expect(redis.expire).toHaveBeenCalledTimes(2);
  });
});

describe('prepareVisionImage', () => {
  it('downsizes to a JPEG within the max edge', async () => {
    const png = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#0E1A13' } })
      .png()
      .toBuffer();
    const out = await prepareVisionImage(new Uint8Array(png));
    const meta = await sharp(out.bytes).metadata();
    expect(out.mediaType).toBe('image/jpeg');
    expect(meta.width).toBe(1568);
  });

  it('rejects bytes that are not an image', async () => {
    await expect(prepareVisionImage(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(VisionImageError);
  });
});
