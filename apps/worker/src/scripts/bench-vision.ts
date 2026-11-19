/**
 * Vision provider benchmark (05 §5.2). Decides VISION_PROVIDER; re-run monthly.
 *
 *   pnpm bench:vision [--providers anthropic:haiku] [--limit 200] [--ngn-per-usd 1550]
 *
 * Reads scripts/data/screenshots/ (owner-collected, DECISIONS 2026-11-12) and its
 * labels.jsonl, runs every provider, writes scripts/out/vision-bench-YYYYMMDD.md.
 * Only the report is written; per-image model output stays in memory.
 */
import { formatNaira, loadEnv } from '@cheapa/core';
import {
  createVisionProvider,
  prepareVisionImage,
  VISION_PROMPT_VERSION,
  VISION_PROVIDER_IDS,
  visionEnv,
  type VisionProviderId,
} from '@cheapa/ml';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { percentile } from '../bench/metrics.js';
import { addScore, emptyTally, scoreResult, VisionLabel, type Tally } from '../bench/vision-score.js';

const DATA = new URL('../../../../scripts/data/screenshots/', import.meta.url);
const OUT = new URL('../../../../scripts/out/', import.meta.url);

const { values: args } = parseArgs({
  options: {
    providers: { type: 'string', default: VISION_PROVIDER_IDS.join(',') },
    limit: { type: 'string', default: '200' },
    'ngn-per-usd': { type: 'string', default: '1550' },
  },
});

const log = (msg: string) => process.stdout.write(`${msg}
`);
const warn = (msg: string) => process.stderr.write(`${msg}
`);

interface ProviderRun {
  id: string;
  overall: Tally;
  bySource: Map<string, Tally>;
  latencies: number[];
  costUsd: number;
  calls: number;
  failures: number;
}

function loadLabels(limit: number): VisionLabel[] {
  const file = new URL('labels.jsonl', DATA);
  if (!existsSync(file)) {
    throw new Error(
      'scripts/data/screenshots/labels.jsonl not found. Add screenshots and one JSON label per line ' +
        '({"file":"ig-001.jpg","source":"instagram","category":"maxi dress","brand":null,"model":null,' +
        '"variant":{"colour":"green"},"priceNaira":18500}).',
    );
  }
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => VisionLabel.parse(JSON.parse(line)))
    .slice(0, limit);
}

async function runProvider(id: VisionProviderId, labels: VisionLabel[]): Promise<ProviderRun> {
  const env = loadEnv(visionEnv, process.env);
  const provider = createVisionProvider(id, {
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    timeoutMs: env.VISION_TIMEOUT_MS,
  });
  const run: ProviderRun = {
    id,
    overall: emptyTally(),
    bySource: new Map(),
    latencies: [],
    costUsd: 0,
    calls: 0,
    failures: 0,
  };
  for (const [i, label] of labels.entries()) {
    const image = await prepareVisionImage(new Uint8Array(readFileSync(new URL(label.file, DATA))));
    try {
      const { result, usage } = await provider.describeProduct(image);
      const score = scoreResult(label, result);
      addScore(run.overall, score);
      const bucket = run.bySource.get(label.source) ?? emptyTally();
      addScore(bucket, score);
      run.bySource.set(label.source, bucket);
      run.latencies.push(usage.latencyMs);
      run.costUsd += usage.costUsd;
    } catch (error) {
      run.failures++;
      warn(`${id} ${label.file}: ${error instanceof Error ? error.name : 'error'}`);
    }
    run.calls++;
    if ((i + 1) % 20 === 0) log(`${id}: ${i + 1}/${labels.length}`);
  }
  return run;
}

const pct = (hit: number, n: number): string => (n ? `${((100 * hit) / n).toFixed(1)}%` : 'n/a');

function report(runs: ProviderRun[], labels: VisionLabel[], ngnPerUsd: number): string {
  const per1000 = (r: ProviderRun) => (r.calls ? (r.costUsd / r.calls) * 1000 : 0);
  const lines = [
    `# Vision benchmark ${new Date().toISOString().slice(0, 10)}`,
    '',
    `${labels.length} labelled images, prompt ${VISION_PROMPT_VERSION}, ₦${ngnPerUsd}/USD. ` +
      'Exact match after lower-casing and stripping punctuation; variant = every labelled key matched.',
    '',
    '| Provider | Brand | Model | Variant | All three | isProduct | Price read | p50 ms | p95 ms | Cost / 1,000 | Failures |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...runs.map((r) => {
      const t = r.overall;
      const cost = per1000(r);
      const naira = formatNaira(Math.round(cost * ngnPerUsd * 100));
      return (
        `| ${r.id} | ${pct(t.brand, t.n)} | ${pct(t.model, t.n)} | ${pct(t.variant, t.n)} | ${pct(t.allThree, t.n)} ` +
        `| ${pct(t.isProduct, t.n)} | ${pct(t.price, t.priceN)} | ${Math.round(percentile(r.latencies, 50))} ` +
        `| ${Math.round(percentile(r.latencies, 95))} | $${cost.toFixed(2)} (${naira}) | ${r.failures} |`
      );
    }),
    '',
    '## By source',
    '',
    '| Provider | Source | n | All three | Variant | Price read |',
    '| --- | --- | --- | --- | --- | --- |',
    ...runs.flatMap((r) =>
      [...r.bySource].map(
        ([source, t]) =>
          `| ${r.id} | ${source} | ${t.n} | ${pct(t.allThree, t.n)} | ${pct(t.variant, t.n)} | ${pct(t.price, t.priceN)} |`,
      ),
    ),
    '',
  ];
  return lines.join('\n');
}

async function main(): Promise<void> {
  const labels = loadLabels(Number(args.limit));
  const ids = args.providers.split(',').map((s) => s.trim()) as VisionProviderId[];
  for (const id of ids) {
    if (!VISION_PROVIDER_IDS.includes(id)) throw new Error(`unknown provider ${id}`);
  }
  const runs: ProviderRun[] = [];
  for (const id of ids) runs.push(await runProvider(id, labels));

  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const file = new URL(`vision-bench-${stamp}.md`, OUT);
  writeFileSync(file, report(runs, labels, Number(args['ngn-per-usd'])));
  log(`wrote ${file.pathname}`);
}

main().catch((error: unknown) => {
  warn(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
