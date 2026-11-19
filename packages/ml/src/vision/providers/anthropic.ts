/**
 * Anthropic adapter (DECISIONS 2026-11-12: Claude Haiku only). The only file that
 * imports the Anthropic SDK.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ZodError } from 'zod';
import { VISION_SYSTEM_PROMPT, visionUserText } from '../prompt.js';
import {
  VisionInvalidOutputError,
  VisionRefusedError,
  type DescribeOptions,
  type ImageInput,
  type VisionProvider,
  type VisionResponse,
} from '../types.js';
import { fromWire, WireVisionResult } from '../wire.js';

export interface AnthropicModelSpec {
  model: string;
  /** USD per million tokens. */
  inputPerM: number;
  outputPerM: number;
}

export const ANTHROPIC_VISION_MODELS = {
  'anthropic:haiku': { model: 'claude-haiku-5-5', inputPerM: 0.1, outputPerM: 0.5 },
} as const satisfies Record<string, AnthropicModelSpec>;
export type AnthropicVisionId = keyof typeof ANTHROPIC_VISION_MODELS;

export interface AnthropicVisionOptions {
  apiKey?: string;
  timeoutMs?: number;
  effort?: 'low' | 'medium' | 'high';
  /** Test seam. */
  client?: Pick<Anthropic, 'messages'>;
}

const MAX_TOKENS = 4096;
const OUTPUT_FORMAT = zodOutputFormat(WireVisionResult);

export function createAnthropicVision(
  id: AnthropicVisionId,
  options: AnthropicVisionOptions = {},
): VisionProvider {
  const spec = ANTHROPIC_VISION_MODELS[id];
  const client =
    options.client ??
    new Anthropic({ apiKey: options.apiKey, timeout: options.timeoutMs ?? 20_000, maxRetries: 1 });
  const effort = options.effort ?? 'low';

  async function attempt(img: ImageInput, opts: DescribeOptions) {
    const started = performance.now();
    const response = await client.messages.parse(
      {
        model: spec.model,
        max_tokens: MAX_TOKENS,
        output_config: { effort, format: OUTPUT_FORMAT },
        system: VISION_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: img.mediaType,
                  data: Buffer.from(img.bytes).toString('base64'),
                },
              },
              { type: 'text', text: visionUserText(opts.hintText) },
            ],
          },
        ],
      },
      { signal: opts.signal },
    );
    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd:
        (response.usage.input_tokens * spec.inputPerM + response.usage.output_tokens * spec.outputPerM) / 1e6,
      latencyMs: performance.now() - started,
    };
    if (response.stop_reason === 'refusal') throw new VisionRefusedError(id);
    return { parsed: response.parsed_output, stopReason: response.stop_reason, usage };
  }

  return {
    id,
    async describeProduct(img, opts = {}): Promise<VisionResponse> {
      let costUsd = 0;
      let latencyMs = 0;
      let lastProblem = 'no output';
      // Structured output makes invalid JSON rare; retry once anyway (05 §5.2).
      for (let i = 0; i < 2; i++) {
        let out;
        try {
          out = await attempt(img, opts);
        } catch (error) {
          if (error instanceof Anthropic.APIError || error instanceof VisionRefusedError) throw error;
          if (opts.signal?.aborted) throw error;
          lastProblem = error instanceof Error ? error.message : 'parse failed';
          continue;
        }
        costUsd += out.usage.costUsd;
        latencyMs += out.usage.latencyMs;
        if (!out.parsed) {
          lastProblem = `no parsed output (stop_reason ${out.stopReason})`;
          continue;
        }
        try {
          const result = fromWire(out.parsed);
          return { result, usage: { ...out.usage, costUsd, latencyMs } };
        } catch (error) {
          if (!(error instanceof ZodError)) throw error;
          lastProblem = 'output failed validation';
        }
      }
      throw new VisionInvalidOutputError(id, lastProblem);
    },
  };
}
