import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpenAICompatibleProvider,
  parseCustomModelField,
  DEFAULT_CUSTOM_BASE_URL,
  DEFAULT_CUSTOM_MODEL,
} from './openai-compatible';

const TEST_KEY = '<redacted>';

// NOTE: global fetch is fully stubbed — no real network calls in this file.
const fetchMock = vi.fn();

function okJson(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function chatCompletion(text: string) {
  return okJson({
    id: 'chatcmpl-test',
    model: 'llama3.1',
    choices: [{ message: { role: 'assistant', content: text } }],
    usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 },
  });
}

describe('OpenAICompatibleProvider', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to {baseUrl}/chat/completions with the bearer key', async () => {
    fetchMock.mockResolvedValue(chatCompletion('hi from ollama'));
    const provider = new OpenAICompatibleProvider({
      apiKey: TEST_KEY,
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: 'llama3.1',
    });

    const result = await provider.generateText({ prompt: 'Say hi' });

    expect(result.text).toBe('hi from ollama');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${TEST_KEY}`,
          'Content-Type': 'application/json',
        }),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('llama3.1');
    expect(body.messages).toEqual([{ role: 'user', content: 'Say hi' }]);
  });

  it('trims trailing slashes from the base URL', () => {
    const provider = new OpenAICompatibleProvider({
      apiKey: TEST_KEY,
      baseUrl: 'http://localhost:11434/v1///',
    });
    expect(provider.endpoint).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('defaults to the OpenAI base URL and model when not given', () => {
    const provider = new OpenAICompatibleProvider({ apiKey: TEST_KEY });
    expect(provider.endpoint).toBe(`${DEFAULT_CUSTOM_BASE_URL}/chat/completions`);
    expect(provider.currentModel).toBe(DEFAULT_CUSTOM_MODEL);
  });

  it('throws when constructed without an apiKey', () => {
    expect(() => new OpenAICompatibleProvider({ apiKey: '' })).toThrow();
  });

  it('maps 401 to invalid_key on testConnection', async () => {
    fetchMock.mockResolvedValue(okJson({ error: 'bad key' }, 401));
    const provider = new OpenAICompatibleProvider({ apiKey: TEST_KEY });

    const result = await provider.testConnection();

    expect(result.status).toBe('invalid_key');
    expect(JSON.stringify(result)).not.toContain(TEST_KEY);
  });

  it('maps network failure to unavailable on testConnection', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const provider = new OpenAICompatibleProvider({
      apiKey: TEST_KEY,
      baseUrl: 'http://localhost:11434/v1',
    });

    const result = await provider.testConnection();

    expect(result.status).toBe('unavailable');
    expect(result.message).toContain('http://localhost:11434/v1');
  });
});

describe('parseCustomModelField', () => {
  it('parses "<baseUrl> | <model>"', () => {
    expect(
      parseCustomModelField('http://localhost:11434/v1 | llama3.1')
    ).toEqual({ baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' });
  });

  it('treats a bare URL as baseUrl only', () => {
    expect(parseCustomModelField('http://localhost:11434/v1')).toEqual({
      baseUrl: 'http://localhost:11434/v1',
    });
  });

  it('treats a bare name as model only', () => {
    expect(parseCustomModelField('llama3.1')).toEqual({ model: 'llama3.1' });
  });

  it('returns {} for empty input', () => {
    expect(parseCustomModelField('')).toEqual({});
    expect(parseCustomModelField(null)).toEqual({});
    expect(parseCustomModelField(undefined)).toEqual({});
  });
});
