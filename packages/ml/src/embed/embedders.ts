/**
 * transformers.js embedders (ONNX on CPU). Load once per process and call `warmUp()` on
 * boot (05 §5.1). Every vector is L2-normalised, so cosine similarity = dot product.
 */
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  env,
  pipeline,
  SiglipTextModel,
  SiglipVisionModel,
  type FeatureExtractionPipeline,
  type RawImage,
  type Tensor,
} from '@huggingface/transformers';
import {
  IMAGE_MODELS,
  MODEL_DTYPE,
  TEXT_MODELS,
  type ImageModelId,
  type ImageModelSpec,
  type TextModelId,
  type TextModelSpec,
} from './models.js';

export interface EmbedOptions {
  /** Where model files are cached (`ML_MODEL_CACHE_DIR`); a volume in production. */
  cacheDir?: string;
  /** Production sets this after the first download so boots never reach the network. */
  offline?: boolean;
}

/** Image model: image vectors, plus text vectors in the same space (zero-shot queries). */
export interface ImageEmbedder {
  readonly spec: ImageModelSpec;
  embedImages(images: RawImage[]): Promise<Float32Array[]>;
  embedTexts(texts: string[]): Promise<Float32Array[]>;
  warmUp(): Promise<void>;
}

/** Title model for the text path (MiniLM). */
export interface TextEmbedder {
  readonly spec: TextModelSpec;
  embed(texts: string[]): Promise<Float32Array[]>;
  warmUp(): Promise<void>;
}

function configure(options: EmbedOptions): void {
  if (options.cacheDir) env.cacheDir = options.cacheDir;
  if (options.offline) env.allowRemoteModels = false;
}

const once = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let promise: Promise<T> | undefined;
  return () => {
    promise ??= load().catch((err: unknown) => {
      promise = undefined;
      throw err;
    });
    return promise;
  };
};

const CLASSES = {
  clip: { vision: CLIPVisionModelWithProjection, text: CLIPTextModelWithProjection },
  siglip: { vision: SiglipVisionModel, text: SiglipTextModel },
} as const;

export function createImageEmbedder(id: ImageModelId, options: EmbedOptions = {}): ImageEmbedder {
  configure(options);
  const spec: ImageModelSpec = IMAGE_MODELS[id];
  const classes = CLASSES[spec.family];
  const vision = once(async () => {
    const [processor, model] = await Promise.all([
      AutoProcessor.from_pretrained(spec.repo),
      classes.vision.from_pretrained(spec.repo, { dtype: MODEL_DTYPE }),
    ]);
    return { processor, model };
  });
  const text = once(async () => {
    const [tokenizer, model] = await Promise.all([
      AutoTokenizer.from_pretrained(spec.repo),
      classes.text.from_pretrained(spec.repo, { dtype: MODEL_DTYPE }),
    ]);
    return { tokenizer, model };
  });

  return {
    spec,
    async embedImages(images) {
      if (images.length === 0) return [];
      const { processor, model } = await vision();
      const inputs = (await processor(images)) as Record<string, Tensor>;
      const out = (await model(inputs)) as { image_embeds: Tensor };
      return rows(out.image_embeds, spec.dims);
    },
    async embedTexts(texts) {
      if (texts.length === 0) return [];
      const { tokenizer, model } = await text();
      // Both exports have a fixed sequence length; SigLIP was trained on max_length padding.
      const inputs = tokenizer(texts, {
        padding: 'max_length',
        truncation: true,
        max_length: spec.textMaxLength,
      }) as Record<string, Tensor>;
      const out = (await model(inputs)) as { text_embeds: Tensor };
      return rows(out.text_embeds, spec.dims);
    },
    async warmUp() {
      await vision();
    },
  };
}

export function createTextEmbedder(id: TextModelId, options: EmbedOptions = {}): TextEmbedder {
  configure(options);
  const spec: TextModelSpec = TEXT_MODELS[id];
  const extractor = once((): Promise<FeatureExtractionPipeline> =>
    pipeline('feature-extraction', spec.repo, { dtype: MODEL_DTYPE }),
  );
  return {
    spec,
    async embed(texts) {
      if (texts.length === 0) return [];
      const run = await extractor();
      const out = await run(texts, { pooling: 'mean', normalize: true });
      return rows(out, spec.dims);
    },
    async warmUp() {
      await (
        await extractor()
      )(['warm up'], { pooling: 'mean', normalize: true });
    },
  };
}

/** Splits a [n, dims] tensor into L2-normalised rows. */
function rows(tensor: Tensor, dims: number): Float32Array[] {
  const [n, d] = tensor.dims as [number, number];
  if (d !== dims) throw new Error(`model returned ${d} dims, expected ${dims}`);
  const data = tensor.data as Float32Array;
  const out: Float32Array[] = [];
  for (let i = 0; i < n; i += 1) out.push(normalise(data.slice(i * d, (i + 1) * d)));
  return out;
}

export function normalise(v: Float32Array): Float32Array {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum) || 1;
  return v.map((x) => x / norm);
}

/** Cosine similarity of two normalised vectors. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}
