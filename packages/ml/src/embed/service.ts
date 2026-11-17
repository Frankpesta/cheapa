/**
 * One object per process that turns listing images and titles into stored vectors
 * (05 §5.1). Concurrent callers are batched (16 at a time) so the CPU runs full batches.
 */
import type { RawImage } from '@huggingface/transformers';
import { Batcher } from './batcher.js';
import {
  createImageEmbedder,
  createTextEmbedder,
  type EmbedOptions,
  type ImageEmbedder,
  type TextEmbedder,
} from './embedders.js';
import { decodeImage } from './image.js';
import { modelVersion, type ImageModelId, type TextModelId } from './models.js';

export interface ListingVectors {
  imageVec: number[];
  textVec: number[] | null;
  phash: bigint;
}

export interface EmbedService {
  /** For `listing_embeddings.model_version`. */
  readonly modelVersion: string;
  readonly imageDims: number;
  readonly textDims: number;
  /** Decodes in memory, embeds image + title, hashes. Throws ImageDecodeError on bad bytes. */
  embedListing(imageBytes: Uint8Array, title: string | null): Promise<ListingVectors>;
  embedTitle(title: string): Promise<number[]>;
  warmUp(): Promise<void>;
}

export interface EmbedServiceOptions extends EmbedOptions {
  imageModel: ImageModelId;
  textModel: TextModelId;
  maxBatch?: number;
  maxWaitMs?: number;
}

export function createEmbedService(options: EmbedServiceOptions): EmbedService {
  return embedServiceFrom(
    createImageEmbedder(options.imageModel, options),
    createTextEmbedder(options.textModel, options),
    options,
  );
}

/** Seam for tests: any embedders, same batching and decoding. */
export function embedServiceFrom(
  image: ImageEmbedder,
  text: TextEmbedder,
  options: { maxBatch?: number; maxWaitMs?: number } = {},
): EmbedService {
  const images = new Batcher<RawImage, Float32Array>({
    process: (items) => image.embedImages(items),
    ...options,
  });
  const titles = new Batcher<string, Float32Array>({ process: (items) => text.embed(items), ...options });

  return {
    modelVersion: modelVersion(image.spec.id, text.spec.id),
    imageDims: image.spec.dims,
    textDims: text.spec.dims,
    async embedListing(imageBytes, title) {
      const decoded = await decodeImage(imageBytes);
      const clean = title?.trim();
      const [imageVec, textVec] = await Promise.all([
        images.run(decoded.image),
        clean ? titles.run(clean) : Promise.resolve(null),
      ]);
      return {
        imageVec: Array.from(imageVec),
        textVec: textVec ? Array.from(textVec) : null,
        phash: decoded.phash,
      };
    },
    async embedTitle(title) {
      return Array.from(await titles.run(title));
    },
    async warmUp() {
      await Promise.all([image.warmUp(), text.warmUp()]);
    },
  };
}
