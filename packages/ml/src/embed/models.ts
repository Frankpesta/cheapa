/**
 * Embedding models that run on CPU through transformers.js (05 §5.1). Image models are
 * candidates for the fashion benchmark (13 §13.6); `pnpm bench:embed` picks the default.
 */

export type ImageModelFamily = 'clip' | 'siglip';

export interface ImageModelSpec {
  /** Short id used in env (`EMBED_IMAGE_MODEL`) and in `modelVersion`. */
  id: ImageModelId;
  /** Hugging Face repo with ONNX exports under onnx/. */
  repo: string;
  family: ImageModelFamily;
  dims: number;
  /** Text tower input length (fixed by the ONNX export). Used for zero-shot text queries. */
  textMaxLength: number;
}

export interface TextModelSpec {
  id: TextModelId;
  repo: string;
  dims: number;
}

export const IMAGE_MODELS = {
  'clip-vit-b32': {
    id: 'clip-vit-b32',
    repo: 'Xenova/clip-vit-base-patch32',
    family: 'clip',
    dims: 512,
    textMaxLength: 77,
  },
  'marqo-fashionclip': {
    id: 'marqo-fashionclip',
    repo: 'Marqo/marqo-fashionCLIP',
    family: 'clip',
    dims: 512,
    textMaxLength: 77,
  },
  'marqo-fashionsiglip': {
    id: 'marqo-fashionsiglip',
    repo: 'Marqo/marqo-fashionSigLIP',
    family: 'siglip',
    dims: 768,
    textMaxLength: 64,
  },
} as const satisfies Record<string, Omit<ImageModelSpec, 'id'> & { id: string }>;

export type ImageModelId = keyof typeof IMAGE_MODELS;
export const IMAGE_MODEL_IDS = Object.keys(IMAGE_MODELS) as ImageModelId[];

export const TEXT_MODELS = {
  'minilm-l6': { id: 'minilm-l6', repo: 'Xenova/all-MiniLM-L6-v2', dims: 384 },
} as const satisfies Record<string, Omit<TextModelSpec, 'id'> & { id: string }>;

export type TextModelId = keyof typeof TEXT_MODELS;

/** int8 weights: ~4x smaller and faster on CPU than fp32, with small recall loss. */
export const MODEL_DTYPE = 'q8';

/**
 * Stored in `listing_embeddings.model_version`. A change means vectors must be
 * re-embedded before they are compared with new ones.
 */
export function modelVersion(image: ImageModelId, text: TextModelId): string {
  return `${image}@${MODEL_DTYPE}+${text}@${MODEL_DTYPE}`;
}
