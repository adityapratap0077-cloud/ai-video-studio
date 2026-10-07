/**
 * OpenAI-compatible chat-completions provider (implements AIProvider).
 *
 * Registered as provider id `custom-llm`. This is the generic extension
 * point: any service that speaks the OpenAI /chat/completions wire format
 * works here, including:
 *   - OpenAI itself            (base URL https://api.openai.com/v1)
 *   - Ollama (local)           (base URL http://localhost:11434/v1)
 *   - LM Studio / vLLM / llama.cpp server / any OpenAI-compatible proxy
 *
 * Configuration resolution (first hit wins):
 *   base URL — CUSTOM_LLM_BASE_URL env > ProviderConfig.baseUrl column >
 *              "<baseUrl> | <model>" convention in the model field >
 *              https://api.openai.com/v1
 *   model    — model part of the "<baseUrl> | <model>" convention >
 *              ProviderConfig.model > CUSTOM_LLM_MODEL env > "llama3.1"
 *   api key  — ProviderConfig encrypted key (Settings UI) > CUSTOM_LLM_API_KEY
 *              env. (Ollama ignores the key; any non-empty value works.)
 *
 * All network I/O goes through the global fetch. API keys are never
 * included in thrown error messages or logs.
 */
import type {
  AIProvider,
  ProviderTestResult,
  TextGenOptions,
  TextGenResult,
} from './types';

export const CUSTOM_LLM_PROVIDER_ID = 'custom-llm';
export const DEFAULT_CUSTOM_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_CUSTOM_MODEL = 'llama3.1';

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Parses the model field for the "<baseUrl> | <model>" convention, e.g.
 * "http://localhost:11434/v1 | llama3.1". Returns the parts found.
 */
export function parseCustomModelField(raw: string | null | undefined): {
  baseUrl?: string;
  model?: string;
} {
  if (!raw) return {};
  const parts = raw.split('|').map((p) => p.trim());
  if (parts.length === 1) {
    return looksLikeUrl(parts[0]) ? { baseUrl: parts[0] } : { model: parts[0] };
  }
  const [first, ...rest] = parts;
  const out: { baseUrl?: string; model?: string } = {};
  if (first && looksLikeUrl(first)) out.baseUrl = first;
  const model = rest.join('|').trim();
  if (model) out.model = model;
  return out;
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

type FailureCode =
  | 'invalid_key'
  | 'forbidden'
  | 'rate_limited'
  | 'provider_error'
  | 'timeout'
  | 'network';

class CustomLLMRequestError extends Error {
  readonly code: FailureCode;

  constructor(code: FailureCode, message: string) {
    super(message);
    this.name = 'CustomLLMRequestError';
    this.code = code;
  }
}

export interface OpenAICompatibleOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id = CUSTOM_LLM_PROVIDER_ID;
  readonly name = 'Custom LLM';
  readonly type = 'ai' as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(opts: OpenAICompatibleOptions) {
    if (!opts.apiKey) {
      throw new Error('OpenAICompatibleProvider requires an apiKey.');
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = normalizeBaseUrl(
      opts.baseUrl || DEFAULT_CUSTOM_BASE_URL
    );
    this.model = opts.defaultModel || DEFAULT_CUSTOM_MODEL;
  }

  /** Exposed for diagnostics/tests — never include the key. */
  get endpoint(): string {
    return `${this.baseUrl}/chat/completions`;
  }

  get currentModel(): string {
    return this.model;
  }

  private async request(body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new CustomLLMRequestError('timeout', 'Request timed out');
      }
      throw new CustomLLMRequestError(
        'network',
        'Network error: unable to reach the custom LLM endpoint'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private static toRequestError(status: number): CustomLLMRequestError {
    switch (status) {
      case 401:
        return new CustomLLMRequestError('invalid_key', 'Invalid API key');
      case 403:
        return new CustomLLMRequestError('forbidden', 'Forbidden');
      case 429:
        return new CustomLLMRequestError('rate_limited', 'Rate limited');
      case 500:
      case 502:
      case 503:
      case 504:
        return new CustomLLMRequestError('provider_error', 'Provider error');
      default:
        return new CustomLLMRequestError(
          'provider_error',
          `Provider error (status ${status})`
        );
    }
  }

  async generateText(o: TextGenOptions): Promise<TextGenResult> {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (o.systemPrompt) {
      messages.push({ role: 'system', content: o.systemPrompt });
    }
    messages.push({ role: 'user', content: o.prompt });

    const res = await this.request({
      model: o.model || this.model,
      messages,
      max_tokens: o.maxTokens,
      temperature: o.temperature,
    });

    if (!res.ok) {
      throw OpenAICompatibleProvider.toRequestError(res.status);
    }

    const data = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : '';
    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        }
      : undefined;

    return { text, model: data.model ?? this.model, usage };
  }

  async testConnection(): Promise<ProviderTestResult> {
    const started = Date.now();
    const latencyMs = () => Date.now() - started;
    try {
      await this.generateText({
        prompt: 'Reply with exactly: ok',
        maxTokens: 1,
        temperature: 0,
      });
      return {
        status: 'connected',
        message: `Connected to custom LLM at ${this.baseUrl}.`,
        latencyMs: latencyMs(),
      };
    } catch (err) {
      const ms = latencyMs();
      if (err instanceof CustomLLMRequestError) {
        switch (err.code) {
          case 'invalid_key':
            return {
              status: 'invalid_key',
              message: 'Invalid API key.',
              latencyMs: ms,
            };
          case 'rate_limited':
            return {
              status: 'rate_limited',
              message: 'Rate limited by the provider.',
              latencyMs: ms,
            };
          case 'timeout':
          case 'network':
            return {
              status: 'unavailable',
              message: `Unable to reach ${this.baseUrl}. Is the server running?`,
              latencyMs: ms,
            };
          default:
            return { status: 'error', message: err.message, latencyMs: ms };
        }
      }
      return {
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error.',
        latencyMs: ms,
      };
    }
  }
}
