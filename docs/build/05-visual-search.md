# Phase 1 — Embeddings, Vision Layer and Search API (Nov 16 – Dec 6, 2026)

Goal: a photo or screenshot returns grouped, cheapest-first results in under 5 seconds (p50), within the lean budget.

---

## 5.1 Embeddings on CPU (`packages/ml/src/embed/`)

Lean budget means no GPU. Use `@huggingface/transformers` (transformers.js, ONNX runtime) in the worker.

| Purpose | Default model | Dims | Where it runs |
| --- | --- | --- | --- |
| Image | CLIP ViT-B/32 (ONNX, quantized) as baseline; **benchmark FashionCLIP / Marqo-FashionSigLIP first** (`13-fashion-and-beauty.md` 13.6) | 512 (update if the winner differs) | `embed` queue at ingest; API at query time |
| Text (titles) | all-MiniLM-L6-v2 (ONNX) | 384 | `embed` queue; API for text queries |

- Load models once per process; warm up on boot.
- Ingest: fetch the listing image into memory (max 2 MB, resize to 224px), embed, store vector + `phash`, discard bytes. **Never write store images to disk or object storage.**
- Batch embeds (16 at a time). Expect a few images/second on 4 vCPUs; the nightly window covers ~50–100k new or changed images. Embed only new/changed images.
- `modelVersion` column lets you re-embed later if you switch models (e.g. SigLIP) when the budget allows a GPU.

**Acceptance:** embedding 1,000 fixture images completes and nearest-neighbour search returns the same product's other listings in the top 5 for ≥ 80% of a 100-item test set.

## 5.2 VisionProvider layer (`packages/ml/src/vision/`)

```ts
export interface VisionProvider {
  id: string;                            // 'anthropic:haiku', 'google:flash', 'openai:mini'
  describeProduct(img: ImageInput, opts?: { hintText?: string }): Promise<VisionResult>;
}

export const VisionResult = z.object({
  isProduct: z.boolean(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  modelNumber: z.string().nullable(),
  variant: z.record(z.string()).default({}),     // storage, size, colour...
  visibleText: z.array(z.string()).default([]),  // OCR-ish text seen in the image
  priceSeen: z.number().nullable(),              // price printed in a screenshot, kobo
  searchQuery: z.string(),                       // best text query
  confidence: z.number().min(0).max(1),
});
```

- One adapter per vendor in `vision/providers/*.ts`, all returning `VisionResult` (validate with zod; retry once on invalid JSON).
- Active provider chosen by env `VISION_PROVIDER`, fallback provider by `VISION_FALLBACK`.
- Shared prompt in `vision/prompt.ts`: Nigerian context, fashion and beauty first (Instagram vendor posts with price overlays like "18.5k" and "DM to order", WhatsApp statuses, outfit photos, flat-lays; local electronics brands like Tecno, Infinix, itel as secondary), JSON-only output. Describe the item only; never describe or identify people.
- `VisionResult` gains `items: { kind, bbox, description }[]` for multi-item photos; the API embeds the crop of the chosen item and asks the user to pick when several items are visible (`13-fashion-and-beauty.md` 13.6).
- Hard daily spend cap (`VISION_DAILY_CAP_USD`); when hit, the API falls back to embeddings-only search and logs it.

### Benchmark script (decides the default provider)

`scripts/bench-vision.ts`:
- Input: `scripts/data/screenshots/` (collect 200 real screenshots: Instagram vendor posts, WhatsApp statuses, TikTok frames, product photos) + `labels.jsonl` (brand, model, variant).
- Runs every configured provider; records accuracy (brand, model, variant exact), latency p50/p95, cost per 1,000 calls.
- Writes `scripts/out/vision-bench-YYYYMMDD.md`. Pick the best accuracy-per-naira; re-run monthly.

**Acceptance:** benchmark report generated for at least two providers; default set in `.env.example` with the report linked in `docs/build/DECISIONS.md`.

## 5.3 Search API flow (`apps/api`)

`POST /search/image` (multipart, max 5 MB; or `{ imageUrl }` for paste-link later)

1. Validate, compute SHA-256 of normalised image bytes. **Cache hit** (`redis-cache`, 24 h) → return cached result.
2. In parallel:
   - **Visual path:** CLIP embed → pgvector top 60 listings by `imageVec` (only listings seen in last 7 days).
   - **Read path:** `VisionProvider.describeProduct` → `searchQuery` → text path: MiniLM embed + Postgres full-text (`tsvector` on title/brand/model) → top 60.
3. **Merge:** union hits, roll up to `canonicalProductId`, score = 0.5·visual + 0.5·text + attribute bonus when vision brand/model matches.
4. **Low confidence** (best score < 0.6 or fewer than 3 products): call tier-1 `liveSearch` adapters with `searchQuery` (max 1 call/store, cached 30 min), normalise on the fly, include as "live" listings.
5. **Ambiguity:** if top two products differ only by a variant (e.g. 128GB vs 256GB) and scores are within 0.05, return `needsConfirmation` with the options.
6. Response (below). Discard the image bytes. Log only hash, provider, latency, result ids.

```ts
type SearchResponse = {
  requestId: string;
  detected: { brand?: string; model?: string; variant?: Record<string,string>; confidence: number };
  needsConfirmation?: { question: string; options: { label: string; productId: string }[] };
  products: Array<{
    productId: string; slug: string; title: string; repImageUrl: string;
    cheapestNewKobo?: number; cheapestUsedKobo?: number; listingCount: number;
    matchScore: number;
    listings: Array<{
      listingId: string; storeName: string; storeTier: number; priceKobo: number; oldPriceKobo?: number;
      condition: Condition; inStock: boolean; lastSeenAt: string; url: string; // url = /go/:listingId redirect
      flags: { suspectLow?: boolean; stale?: boolean; live?: boolean; sponsored?: boolean };
    }>;
  }>;
  /** Core feature for fashion: see 13-fashion-and-beauty.md 13.5. Ordered by similarity band, then price. */
  lookalikes: Array<{
    productId: string; title: string; repImageUrl: string; cheapestKobo: number; priceKind: 'exact' | 'from' | 'range';
    storeName: string; listingCount: number; similarity: number; band: 'very_close' | 'close';
  }>;
};
```

`POST /search/text` → same response, text path only.
`GET /go/:listingId` → records a click in the users DB without blocking (queued, see `08-user-side.md` 8.4), applies affiliate tag if configured, 302 to store.

After each response the API writes a `searches` row to the users DB (`08-user-side.md` 8.5) and emits a PostHog `search_served` event (no query text, no hash); the catalog DB never stores who searched. Sentry traces (10% sample) cover the steps in 5.4 so latency regressions are visible per step.

## 5.4 Performance budget (p50 targets)

| Step | Target |
| --- | --- |
| Upload + hash | 300 ms |
| CLIP embed (CPU) | 400 ms |
| Vision LLM | 1.5–2.5 s (parallel with visual path) |
| DB queries | 200 ms |
| Merge + response | 100 ms |
| **Total** | **< 5 s**, cache hits < 300 ms |

**Acceptance:** load test (k6) at 5 concurrent searches on the lean VPS keeps p50 < 5 s; 20 viral-screenshot repeats hit the cache.
