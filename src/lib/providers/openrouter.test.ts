import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterProvider } from './openrouter';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TEST_KEY = 'sk-or-test-fixture-key';

// NOTE: global fetch is fully stubbed — no real network calls in this file.
const fetchMock = vi.fn();

function okJson(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function chatCompletion(text: string) {
  return okJson({
    id: 'gen-test-1',
    model: 'openrouter/auto',
    choices: [{ message: { role: 'assistant', content: text } }],
    usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
  });
}

describe('OpenRouterProvider', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('successful chat completion returns text + usage', async () => {
    fetchMock.mockResolvedValue(chatCompletion('Hello from the test double'));
    const provider = new OpenRouterProvider({ apiKey: TEST_KEY });

    const result = await provider.generateText({ prompt: 'Say hello' });

    expect(result.text).toBe('Hello from the test double');
    expect(result.model).toBe('openrouter/auto');
    expect(result.usage).toEqual({
      promptTokens: 12,
      completionTokens: 5,
      totalTokens: 17,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${TEST_KEY}`,
          'Content-Type': 'application/json',
          'X-Title': 'AI Video Studio',
        }),
      })
    );
  });

  it('sends system prompt and model overrides when provided', async () => {
    fetchMock.mockResolvedValue(chatCompletion('ok'));
    const provider = new OpenRouterProvider({ apiKey: TEST_KEY, defaultModel: 'x/test' });

    await provider.generateText({
      prompt: 'Hi',
      systemPrompt: 'You are a test double.',
      model: 'x/override',
      maxTokens: 10,
      temperature: 0.5,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('x/override');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a test double.' },
      { role: 'user', content: 'Hi' },
    ]);
    expect(body.max_tokens).toBe(10);
    expect(body.temperature).toBe(0.5);
  });

  it('401 → Invalid API key error', async () => {
    fetchMock.mockResolvedValue(okJson({ error: { message: 'Unauthorized' } }, 401));
    const provider = new OpenRouterProvider({ apiKey: 'sk-or-wrong' });

    await expect(provider.generateText({ prompt: 'Hi' })).rejects.toThrow(
      /Invalid API key/
    );
  });

  it('429 → rate-limit error', async () => {
    fetchMock.mockResolvedValue(okJson({ error: { message: 'Slow down' } }, 429));
    const provider = new OpenRouterProvider({ apiKey: TEST_KEY });

    await expect(provider.generateText({ prompt: 'Hi' })).rejects.toThrow(
      /[Rr]ate limit/
    );
  });

  it('aborted request → timeout error', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });
    fetchMock.mockRejectedValue(abortError);
    const provider = new OpenRouterProvider({ apiKey: TEST_KEY });

    await expect(provider.generateText({ prompt: 'Hi' })).rejects.toThrow(
      /timed out/
    );
  });

  it('other HTTP errors map to a generic provider error', async () => {
    fetchMock.mockResolvedValue(okJson({ error: 'boom' }, 500));
    const provider = new OpenRouterProvider({ apiKey: TEST_KEY });

    await expect(provider.generateText({ prompt: 'Hi' })).rejects.toThrow(
      /Provider error/
    );
  });

  it('constructor requires an apiKey', () => {
    expect(() => new OpenRouterProvider({ apiKey: '' })).toThrow();
  });

  describe('testConnection', () => {
    it('maps a healthy response to connected', async () => {
      fetchMock.mockResolvedValue(chatCompletion('ok'));
      const provider = new OpenRouterProvider({ apiKey: TEST_KEY });

      const result = await provider.testConnection();

      expect(result.status).toBe('connected');
      expect(typeof result.latencyMs).toBe('number');
      expect(result.message).toMatch(/connected/i);
    });

    it('maps 401 to an invalid_key result', async () => {
      fetchMock.mockResolvedValue(okJson({ error: { message: 'Unauthorized' } }, 401));
      const provider = new OpenRouterProvider({ apiKey: 'sk-or-wrong' });

      const result = await provider.testConnection();

      expect(result.status).toBe('invalid_key');
      expect(result.message).toMatch(/Invalid API key/);
    });

    it('maps 429 to a rate_limited result', async () => {
      fetchMock.mockResolvedValue(okJson({ error: { message: 'Slow down' } }, 429));
      const provider = new OpenRouterProvider({ apiKey: TEST_KEY });

      const result = await provider.testConnection();

      expect(result.status).toBe('rate_limited');
      expect(result.message).toMatch(/[Rr]ate limit/);
    });
  });
});
