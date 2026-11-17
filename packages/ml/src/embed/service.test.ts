import type { RawImage } from '@huggingface/transformers';
import { describe, expect, it } from 'vitest';
import { jpeg } from '../test/images.js';
import { cosine, normalise, type ImageEmbedder, type TextEmbedder } from './embedders.js';
import { IMAGE_MODELS, TEXT_MODELS } from './models.js';
import { embedServiceFrom } from './service.js';

/** Fake models: the image vector is the image size, the text vector the string length. */
function fakes(calls: { images: number[]; texts: number[] }) {
  const image: ImageEmbedder = {
    spec: { ...IMAGE_MODELS['clip-vit-b32'], dims: 3 },
    embedImages: (imgs: RawImage[]) => {
      calls.images.push(imgs.length);
      return Promise.resolve(imgs.map((i) => normalise(Float32Array.from([i.width, i.height, 1]))));
    },
    embedTexts: () => Promise.resolve([]),
    warmUp: () => Promise.resolve(),
  };
  const text: TextEmbedder = {
    spec: { ...TEXT_MODELS['minilm-l6'], dims: 2 },
    embed: (t: string[]) => {
      calls.texts.push(t.length);
      return Promise.resolve(t.map((s) => normalise(Float32Array.from([s.length, 1]))));
    },
    warmUp: () => Promise.resolve(),
  };
  return { image, text };
}

describe('embedServiceFrom', () => {
  it('embeds image and title, hashes, and batches concurrent listings', async () => {
    const calls = { images: [] as number[], texts: [] as number[] };
    const { image, text } = fakes(calls);
    const svc = embedServiceFrom(image, text, { maxBatch: 16, maxWaitMs: 10 });
    const bytes = await jpeg('dress');
    const out = await Promise.all([
      svc.embedListing(bytes, 'Black satin slip dress'),
      svc.embedListing(bytes, '  '),
      svc.embedListing(bytes, null),
    ]);
    expect(calls.images).toEqual([3]);
    expect(calls.texts).toEqual([1]);
    expect(out[0]?.imageVec).toHaveLength(3);
    expect(out[0]?.textVec).toHaveLength(2);
    expect(out[1]?.textVec).toBeNull();
    expect(out[0]?.phash).toBe(out[2]?.phash);
    expect(svc.modelVersion).toBe('clip-vit-b32@q8+minilm-l6@q8');
  });
});

describe('vector helpers', () => {
  it('normalises to unit length; cosine of a vector with itself is 1', () => {
    const v = normalise(Float32Array.from([3, 4]));
    expect(v[0]).toBeCloseTo(0.6, 6);
    expect(v[1]).toBeCloseTo(0.8, 6);
    expect(cosine(v, v)).toBeCloseTo(1, 6);
  });
});
