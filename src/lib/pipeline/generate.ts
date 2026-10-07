/**
 * Pure generation helpers for the pipeline: JSON extraction from model
 * output and the retry loop that validates against a Zod schema.
 *
 * Kept free of DB/network imports so it is unit-testable with an injected
 * `generate` function — no real API calls in tests.
 */
import { z } from 'zod';
import type { TextGenOptions, TextGenResult } from '@/lib/providers/types';
import { buildFixJsonPrompt } from './prompts';

export type GenerateFn = (o: TextGenOptions) => Promise<TextGenResult>;

/** Exact message the UI shows when no AI provider key is configured. */
export const NOT_CONFIGURED_MESSAGE =
  'AI provider not configured — add your OpenRouter key in Providers.';

export interface ExtractOk {
  ok: true;
  value: unknown;
}
export interface ExtractFail {
  ok: false;
  error: string;
}
export type ExtractResult = ExtractOk | ExtractFail;

/**
 * Pull the first JSON object out of model text. Handles ```json fenced
 * blocks and stray prose around the object. Never throws.
 */
export function extractJsonObject(text: string): ExtractResult {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, error: 'No JSON object found in the model response.' };
  }
  const slice = candidate.slice(start, end + 1);
  try {
    return { ok: true, value: JSON.parse(slice) };
  } catch (err) {
    return {
      ok: false,
      error: `Model response was not valid JSON: ${err instanceof Error ? err.message : 'parse error'}`,
    };
  }
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `- ${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('\n');
}

export interface RunGenerationArgs<T> {
  generate: GenerateFn;
  /** Display name of the stage, used in retry prompts and errors. */
  stageLabel: string;
  systemPrompt: string;
  userPrompt: string;
  jsonShape: string;
  schema: z.ZodType<T>;
  /** Max retries after the first attempt (from project cost limits). */
  maxRetries: number;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerationSuccess<T> {
  ok: true;
  data: T;
  /** Total provider calls made (attempts). */
  attempts: number;
  /** Model string reported by the provider. */
  model: string;
}

export interface GenerationFailure {
  ok: false;
  error: {
    /** Short human-readable summary. */
    message: string;
    /** Last validation/parse problem, for the error card. */
    reason: string;
    attempts: number;
  };
}

export type GenerationResult<T> = GenerationSuccess<T> | GenerationFailure;

/**
 * Call the provider, extract JSON, validate with Zod. On parse/validation
 * failure, retry with a "fix JSON" follow-up prompt, up to `maxRetries`
 * times. Provider/network errors propagate to the caller (mapped to a
 * PipelineActionError in actions.ts).
 */
export async function runGeneration<T>(args: RunGenerationArgs<T>): Promise<GenerationResult<T>> {
  const { generate, stageLabel, systemPrompt, jsonShape, schema, maxRetries } = args;
  const baseUserPrompt = `${args.userPrompt}\n\nExpected JSON shape:\n${jsonShape}`;

  let lastText = '';
  let lastReason = 'unknown error';
  const totalAttempts = Math.max(1, maxRetries + 1);

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const prompt =
      attempt === 0
        ? baseUserPrompt
        : buildFixJsonPrompt(stageLabel, lastText, lastReason);

    const res = await generate({
      prompt,
      systemPrompt,
      temperature: args.temperature ?? 0.4,
      maxTokens: args.maxTokens,
    });
    lastText = res.text;

    const extracted = extractJsonObject(res.text);
    if (!extracted.ok) {
      lastReason = extracted.error;
      continue;
    }
    const parsed = schema.safeParse(extracted.value);
    if (parsed.success) {
      return {
        ok: true,
        data: parsed.data,
        attempts: attempt + 1,
        model: res.model || 'unknown',
      };
    }
    lastReason = formatIssues(parsed.error);
  }

  return {
    ok: false,
    error: {
      message: `The model did not return valid ${stageLabel} JSON after ${totalAttempts} attempt${totalAttempts === 1 ? '' : 's'}.`,
      reason: lastReason,
      attempts: totalAttempts,
    },
  };
}
