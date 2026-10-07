import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TavilyProvider } from './tavily';
import { ProviderNotConfiguredError } from './types';
import { StubSearchProvider } from './stubs';

const TEST_KEY = '<redacted>';

// NOTE: global fetch is fully stubbed — no real network calls in this file.
const fetchMock = vi.fn();

function okJson(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function searchResponse() {
  return okJson({
    query: 'ollama local llm',
    results: [
      {
        title: 'Ollama',
        url: 'https://ollama.com',
        content: 'Run large language models locally.',
        score: 0.95,
      },
      {
        title: 'Docs',
        url: 'https://example.com/docs',
        content: 'Some docs.',
        score: 0.8,
      },
    ],
    response_time: 1.2,
  });
}

describe('TavilyProvider', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts query + max_results and maps content to snippet', async () => {
    fetchMock.mockResolvedValue(searchResponse());
    const provider = new TavilyProvider({ apiKey: TEST_KEY });

    const results = await provider.search('ollama local llm', 2);

    expect(results).toEqual([
      {
        title: 'Ollama',
        url: 'https://ollama.com',
        snippet: 'Run large language models locally.',
      },
      {
        title: 'Docs',
        url: 'https://example.com/docs',
        snippet: 'Some docs.',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${TEST_KEY}`,
          'Content-Type': 'application/json',
        }),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      query: 'ollama local llm',
      search_depth: 'basic',
      max_results: 2,
    });
  });

  it('clamps maxResults to the API range 1..20', async () => {
    fetchMock.mockResolvedValue(okJson({ results: [] }));
    const provider = new TavilyProvider({ apiKey: TEST_KEY });

    await provider.search('x', 99);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.max_results).toBe(20);
  });

  it('rejects empty queries without a network call', async () => {
    const provider = new TavilyProvider({ apiKey: TEST_KEY });
    await expect(provider.search('  ')).rejects.toThrow(/non-empty query/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('testConnection maps 401 to invalid_key without leaking the key', async () => {
    fetchMock.mockResolvedValue(okJson({ detail: 'bad key' }, 401));
    const provider = new TavilyProvider({ apiKey: TEST_KEY });

    const result = await provider.testConnection();

    expect(result.status).toBe('invalid_key');
    expect(JSON.stringify(result)).not.toContain(TEST_KEY);
  });

  it('testConnection maps 429 to rate_limited', async () => {
    fetchMock.mockResolvedValue(okJson({ detail: 'slow down' }, 429));
    const provider = new TavilyProvider({ apiKey: TEST_KEY });

    const result = await provider.testConnection();

    expect(result.status).toBe('rate_limited');
  });
});

describe('StubSearchProvider', () => {
  it('throws ProviderNotConfiguredError and reports not_configured', async () => {
    const stub = new StubSearchProvider();
    await expect(stub.search('hello')).rejects.toBeInstanceOf(
      ProviderNotConfiguredError
    );
    await expect(stub.testConnection()).resolves.toMatchObject({
      status: 'not_configured',
      message: 'Search provider not configured.',
    });
  });
});
