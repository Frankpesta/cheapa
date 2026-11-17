/**
 * Image-model benchmark for fashion and beauty (05 §5.1, 13 §13.6).
 *
 *   pnpm bench:embed [--models clip-vit-b32,marqo-fashionclip] [--per-category 45] [--rebuild]
 *
 * Builds (or reuses) a manifest of public Jiji ads with 2+ photos, fetches the photos
 * politely into memory, then per model: recall@k of "photo 1 finds another photo of the
 * same ad", zero-shot category accuracy, and CPU latency. Writes
 * scripts/out/embed-bench-YYYYMMDD.md. Image bytes are never written to disk.
 */
import { PoliteHttp, RedisDomainLimiter, RobotsCache, ROBOTS_AGENT } from '@cheapa/adapters';
import { loadEnv } from '@cheapa/core';
import {
  createImageEmbedder,
  decodeImage,
  IMAGE_MODEL_IDS,
  IMAGE_MODELS,
  MAX_IMAGE_BYTES,
  type ImageModelId,
} from '@cheapa/ml';
import { Redis } from 'ioredis';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { BENCH_CATEGORIES, buildManifest, Manifest } from '../bench/dataset.js';
import { percentile, recallAtK, zeroShotAccuracy, type Item } from '../bench/metrics.js';

const OUT = new URL('../../../../scripts/out/', import.meta.url);
const MANIFEST = new URL('embed-bench-manifest.json', OUT);
const BATCH = 16;
const LATENCY_SAMPLES = 40;

const { values: args } = parseArgs({
  options: {
    models: { type: 'string', default: IMAGE_MODEL_IDS.join(',') },
    'per-category': { type: 'string', default: '45' },
    'max-images': { type: 'string', default: '3' },
    rebuild: { type: 'boolean', default: false },
  },
});
const env = loadEnv(
  z.object({ REDIS_QUEUE_URL: z.url(), ML_MODEL_CACHE_DIR: z.string().optional() }),
  process.env,
);
const models = z.array(z.enum(IMAGE_MODEL_IDS)).parse(args.models.split(','));
const log = (msg: string) => process.stdout.write(`${msg}\n`);

const redis = new Redis(env.REDIS_QUEUE_URL);
const http = new PoliteHttp({
  limiter: new RedisDomainLimiter(redis),
  robots: new RobotsCache(ROBOTS_AGENT),
  maxRps: 1,
});

interface Photo {
  ad: string;
  category: string;
  /** Position in the ad's gallery; 0 is the query. */
  n: number;
  bytes: Uint8Array;
}

try {
  mkdirSync(OUT, { recursive: true });
  const manifest = await loadManifest();
  const photos = await fetchPhotos(manifest);
  const results = [];
  for (const id of models) results.push(await runModel(id, photos));
  const file = new URL(`embed-bench-${stamp()}.md`, OUT);
  writeFileSync(file, report(manifest, photos, results));
  log(`report -> scripts/out/${file.pathname.split('/').at(-1)}`);
} finally {
  redis.disconnect();
}

async function loadManifest(): Promise<Manifest> {
  if (existsSync(MANIFEST) && !args.rebuild) {
    return Manifest.parse(JSON.parse(readFileSync(MANIFEST, 'utf8')));
  }
  log('building manifest from Jiji (1 req/s)...');
  const manifest = await buildManifest({
    http,
    perCategory: Number(args['per-category']),
    maxImages: Number(args['max-images']),
    log,
  });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  return manifest;
}

async function fetchPhotos(manifest: Manifest): Promise<Photo[]> {
  const jobs = manifest.ads.flatMap((ad) => ad.images.map((url, n) => ({ ad, url, n })));
  log(`fetching ${jobs.length} photos into memory...`);
  const photos: Photo[] = [];
  let failed = 0;
  await pool(jobs, 4, async ({ ad, url, n }) => {
    try {
      const res = await http.getBytes(url, { maxBytes: MAX_IMAGE_BYTES });
      await decodeImage(res.bytes); // skip undecodable files up front
      photos.push({ ad: ad.id, category: ad.category, n, bytes: res.bytes });
    } catch {
      failed += 1;
    }
  });
  // Keep ads that still have a query photo and at least one other photo.
  const byAd = Map.groupBy(photos, (p) => p.ad);
  const kept = photos.filter((p) => {
    const mine = byAd.get(p.ad) ?? [];
    return mine.some((x) => x.n === 0) && mine.length >= 2;
  });
  log(`${kept.length} photos usable (${failed} failed)`);
  return kept;
}

interface ModelResult {
  id: ImageModelId;
  dims: number;
  loadMs: number;
  recall: Record<1 | 5 | 10, number>;
  recallByCategory: Record<string, number>;
  zeroShot: number;
  p50: number;
  p95: number;
  perSecond: number;
  queries: number;
  indexSize: number;
}

async function runModel(id: ImageModelId, photos: Photo[]): Promise<ModelResult> {
  log(`== ${id}`);
  const embedder = createImageEmbedder(
    id,
    env.ML_MODEL_CACHE_DIR ? { cacheDir: env.ML_MODEL_CACHE_DIR } : {},
  );
  let t = performance.now();
  await embedder.warmUp();
  const loadMs = performance.now() - t;

  const images = await Promise.all(photos.map(async (p) => (await decodeImage(p.bytes)).image));
  t = performance.now();
  const vecs: Float32Array[] = [];
  for (let i = 0; i < images.length; i += BATCH) {
    vecs.push(...(await embedder.embedImages(images.slice(i, i + BATCH))));
  }
  const perSecond = images.length / ((performance.now() - t) / 1000);

  const latencies: number[] = [];
  for (const img of images.slice(0, LATENCY_SAMPLES)) {
    const s = performance.now();
    await embedder.embedImages([img]);
    latencies.push(performance.now() - s);
  }

  const items = photos.map((p, i) => ({ ...p, vec: vecs[i] ?? new Float32Array() }));
  const asItem = (p: (typeof items)[number]): Item => ({ group: p.ad, vec: p.vec });
  const queries = items.filter((p) => p.n === 0);
  const index = items.filter((p) => p.n > 0).map(asItem);
  const recallByCategory: Record<string, number> = {};
  for (const cat of Object.keys(BENCH_CATEGORIES)) {
    recallByCategory[cat] = recallAtK(queries.filter((q) => q.category === cat).map(asItem), index, 5);
  }

  const labels = Object.entries(BENCH_CATEGORIES);
  const labelVecs = await embedder.embedTexts(labels.map(([, prompt]) => `a photo of ${prompt}`));
  const zeroShot = zeroShotAccuracy(
    queries.map((q) => ({ label: q.category, vec: q.vec })),
    labels.map(([label], i) => ({ label, vec: labelVecs[i] ?? new Float32Array() })),
  );

  const result: ModelResult = {
    id,
    dims: IMAGE_MODELS[id].dims,
    loadMs,
    recall: {
      1: recallAtK(queries.map(asItem), index, 1),
      5: recallAtK(queries.map(asItem), index, 5),
      10: recallAtK(queries.map(asItem), index, 10),
    },
    recallByCategory,
    zeroShot,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    perSecond,
    queries: queries.length,
    indexSize: index.length,
  };
  log(JSON.stringify({ ...result, recallByCategory: undefined }));
  return result;
}

function report(manifest: Manifest, photos: Photo[], results: ModelResult[]): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const ms = (x: number) => `${Math.round(x)} ms`;
  const cats = Object.keys(BENCH_CATEGORIES);
  const lines = [
    `# Image embedding benchmark (${new Date().toISOString().slice(0, 10)})`,
    '',
    `Set: ${manifest.ads.length} public Jiji ads with 2+ photos across ${cats.length} fashion and beauty categories ` +
      `(manifest built ${manifest.builtAt.slice(0, 10)}), ${photos.length} photos embedded.`,
    `Task: photo 1 of an ad is the query; the index holds every other photo of every ad. ` +
      `A hit = another photo of the same ad in the top k (05 §5.1 acceptance: recall@5 ≥ 80%).`,
    `Zero-shot: photo 1 classified into the ${cats.length} categories with "a photo of …" prompts.`,
    `Latency: one image at a time, q8 ONNX on this machine's CPU (${LATENCY_SAMPLES} samples, after warm-up).`,
    '',
    '| Model | Dims | Recall@1 | Recall@5 | Recall@10 | Zero-shot | p50 | p95 | Images/s (batch 16) | Load |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.dims} | ${pct(r.recall[1])} | ${pct(r.recall[5])} | ${pct(r.recall[10])} | ${pct(r.zeroShot)} | ` +
        `${ms(r.p50)} | ${ms(r.p95)} | ${r.perSecond.toFixed(1)} | ${(r.loadMs / 1000).toFixed(1)} s |`,
    ),
    '',
    '## Recall@5 by category',
    '',
    `| Model | ${cats.join(' | ')} |`,
    `| --- | ${cats.map(() => '---').join(' | ')} |`,
    ...results.map((r) => `| ${r.id} | ${cats.map((c) => pct(r.recallByCategory[c] ?? 0)).join(' | ')} |`),
    '',
    `Queries: ${results[0]?.queries ?? 0}, index: ${results[0]?.indexSize ?? 0} photos.`,
    '',
  ];
  return lines.join('\n');
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const item = items[next++] as T;
        await run(item);
      }
    }),
  );
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}
