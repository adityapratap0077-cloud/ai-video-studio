/**
 * OpenRouter chat-completions provider (implements AIProvider).
 *
 * OpenAI-compatible API at https://openrouter.ai/api/v1.
 * All network I/O goes through the global fetch. API keys are never
 * included in thrown error messages or logs.
 */
import type {
  AIProvider,
  ProviderTestResult,
  TextGenOptions,
  TextGenResult,
} from './types';

const API_BASE = 'https://openrouter.ai/api/v1';
const REQUEST_TIMEOUT_MS = 60_000;

function defaultModel(): string {
  return process.env.OPENROUTER_MODEL || 'openrouter/free';
}

function appUrl(): string {
  return process.env.APP_URL || 'http://localhost:3000';
}

type FailureCode =
  | 'invalid_key'
  | 'forbidden'
  | 'rate_limited'
  | 'provider_error'
  | 'timeout'
  | 'network';

/** Internal normalized error; the code is never shown alongside the key. */
class OpenRouterRequestError extends Error {
  readonly code: FailureCode;

  constructor(code: FailureCode, message: string) {
    super(message);
    this.name = 'OpenRouterRequestError';
    this.code = code;
  }
}

export class OpenRouterProvider implements AIProvider {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter';
  readonly type = 'ai' as const;

  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: { apiKey: string; defaultModel?: string }) {
    if (!opts.apiKey) {
      throw new Error('OpenRouterProvider requires an apiKey.');
    }
    this.apiKey = opts.apiKey;
    this.model = opts.defaultModel || defaultModel();
  }

  private async request(path: string, body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': appUrl(),
          'X-Title': 'AI Video Studio',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new OpenRouterRequestError('timeout', 'Request timed out');
      }
      throw new OpenRouterRequestError(
        'network',
        'Network error: unable to reach OpenRouter'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private static toRequestError(status: number): OpenRouterRequestError {
    switch (status) {
      case 401:
        return new OpenRouterRequestError('invalid_key', 'Invalid API key');
      case 403:
        return new OpenRouterRequestError('forbidden', 'Forbidden');
      case 429:
        return new OpenRouterRequestError('rate_limited', 'Rate limited');
      case 500:
      case 502:
      case 503:
      case 504:
        return new OpenRouterRequestError('provider_error', 'Provider error');
      default:
        return new OpenRouterRequestError(
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

    const res = await this.request('/chat/completions', {
      model: o.model || this.model,
      messages,
      max_tokens: o.maxTokens,
      temperature: o.temperature,
    });

    if (!res.ok) {
      throw OpenRouterProvider.toRequestError(res.status);
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
      // Minimal completion: verifies the key is accepted by the provider.
      await this.generateText({
        prompt: 'Reply with exactly: ok',
        maxTokens: 1,
        temperature: 0,
      });
      return {
        status: 'connected',
        message: 'Connected to OpenRouter.',
        latencyMs: latencyMs(),
      };
    } catch (err) {
      const ms = latencyMs();
      if (err instanceof OpenRouterRequestError) {
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
              message: 'Unable to reach OpenRouter.',
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
