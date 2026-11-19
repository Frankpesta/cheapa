/**
 * Picks providers by id (env VISION_PROVIDER / VISION_FALLBACK). Adding a vendor means
 * one file in providers/ and one entry here.
 */
import { envInt } from '@cheapa/core';
import { z } from 'zod';
import {
  ANTHROPIC_VISION_MODELS,
  createAnthropicVision,
  type AnthropicVisionId,
} from './providers/anthropic.js';
import type { VisionProvider } from './types.js';

export const VISION_PROVIDER_IDS = Object.keys(ANTHROPIC_VISION_MODELS) as [AnthropicVisionId];
export type VisionProviderId = AnthropicVisionId;

/** Env fragment for apps that call vision (apps/api, the benchmark). */
export const visionEnv = z.object({
  VISION_PROVIDER: z.enum(VISION_PROVIDER_IDS).default('anthropic:haiku'),
  VISION_FALLBACK: z.enum(VISION_PROVIDER_IDS).optional(),
  VISION_DAILY_CAP_USD: z.coerce.number().nonnegative().default(5),
  VISION_TIMEOUT_MS: envInt.min(1000).default(20_000),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});
export type VisionEnv = z.infer<typeof visionEnv>;

export interface ProviderSecrets {
  anthropicApiKey?: string;
  timeoutMs?: number;
}

export function createVisionProvider(id: VisionProviderId, secrets: ProviderSecrets): VisionProvider {
  switch (id) {
    case 'anthropic:haiku':
      if (!secrets.anthropicApiKey) throw new Error(`${id} needs ANTHROPIC_API_KEY`);
      return createAnthropicVision(id, { apiKey: secrets.anthropicApiKey, timeoutMs: secrets.timeoutMs });
  }
}
