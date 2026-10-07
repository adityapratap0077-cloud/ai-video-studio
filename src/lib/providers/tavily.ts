/**
 * Tavily web-search provider (implements SearchProvider).
 *
 * Simple REST call: POST https://api.tavily.com/search with
 * `Authorization: Bearer <key>` and JSON body
 * { query, search_depth: "basic", max_results }. The response's
 * `results[].content` becomes the snippet.
 *
 * Keys are free-tier friendly (tavily.com) and start with `tvly-`.
 * API keys are never included in thrown error messages or logs.
 */
import type {
  ProviderTestResult,
  SearchProvider,
  SearchResultItem,
} from './types';

export const TAVILY_PROVIDER_ID = 'tavily';
const API_BASE = 'https://api.tavily.com';
const REQUEST_TIMEOUT_MS = 30_000;

type FailureCode =
  | 'invalid_key'
  | 'rate_limited'
  | 'provider_error'
  | 'timeout'
  | 'network';

class TavilyRequestError extends Error {
  readonly code: FailureCode;

  constructor(code: FailureCode, message: string) {
    super(message);
    this.name = 'TavilyRequestError';
    this.code = code;
  }
}

export interface TavilyOptions {
  apiKey: string;
}

export class TavilyProvider implements SearchProvider {
  readonly id = TAVILY_PROVIDER_ID;
  readonly name = 'Tavily';
  readonly type = 'search' as const;

  private readonly apiKey: string;

  constructor(opts: TavilyOptions) {
    if (!opts.apiKey) {
      throw new Error('TavilyProvider requires an apiKey.');
    }
    this.apiKey = opts.apiKey;
  }

  private async postSearch(
    body: Record<string, unknown>
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${API_BASE}/search`, {
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
        throw new TavilyRequestError('timeout', 'Request timed out');
      }
      throw new TavilyRequestError(
        'network',
        'Network error: unable to reach Tavily'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private static toRequestError(status: number): TavilyRequestError {
    switch (status) {
      case 401:
        return new TavilyRequestError('invalid_key', 'Invalid API key');
      case 429:
      case 432:
      case 433:
        return new TavilyRequestError('rate_limited', 'Rate or plan limited');
      default:
        return new TavilyRequestError(
          'provider_error',
          `Provider error (status ${status})`
        );
    }
  }

  async search(
    query: string,
    maxResults = 5
  ): Promise<SearchResultItem[]> {
    if (!query || !query.trim()) {
      throw new Error('search requires a non-empty query.');
    }
    const clamped = Math.min(Math.max(Math.floor(maxResults), 1), 20);

    const res = await this.postSearch({
      query,
      search_depth: 'basic',
      max_results: clamped,
    });

    if (!res.ok) {
      throw TavilyProvider.toRequestError(res.status);
    }

    const data = (await res.json()) as {
      results?: Array<{
        title?: unknown;
        url?: unknown;
        content?: unknown;
      }>;
    };

    const results = Array.isArray(data.results) ? data.results : [];
    return results.map((r) => ({
      title: typeof r.title === 'string' ? r.title : '',
      url: typeof r.url === 'string' ? r.url : '',
      snippet: typeof r.content === 'string' ? r.content : '',
    }));
  }

  async testConnection(): Promise<ProviderTestResult> {
    const started = Date.now();
    const latencyMs = () => Date.now() - started;
    try {
      await this.search('test', 1);
      return {
        status: 'connected',
        message: 'Connected to Tavily.',
        latencyMs: latencyMs(),
      };
    } catch (err) {
      const ms = latencyMs();
      if (err instanceof TavilyRequestError) {
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
              message: 'Rate or plan limited.',
              latencyMs: ms,
            };
          case 'timeout':
          case 'network':
            return {
              status: 'unavailable',
              message: 'Unable to reach Tavily.',
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
