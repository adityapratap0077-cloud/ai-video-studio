import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OpenAITTSProvider } from './openai-tts';
import { ProviderNotConfiguredError } from './types';
import { StubTTSProvider } from './stubs';

const TEST_KEY = '<redacted>';

// NOTE: global fetch is fully stubbed — no real network calls in this file.
const fetchMock = vi.fn();

function okAudio(bytes = 16) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array(bytes).fill(1).buffer,
  };
}

function errStatus(status: number) {
  return { ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) };
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'tts-test-'));
}

describe('OpenAITTSProvider', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to /audio/speech and writes the audio bytes to a file', async () => {
    fetchMock.mockResolvedValue(okAudio());
    const outputDir = await makeTempDir();
    const provider = new OpenAITTSProvider({ apiKey: TEST_KEY, outputDir });

    const result = await provider.generateSpeech({ text: 'Hello world' });

    expect(result.audioPath.startsWith(outputDir)).toBe(true);
    expect(result.audioPath.endsWith('.mp3')).toBe(true);
    const stat = await fs.stat(result.audioPath);
    expect(stat.size).toBe(16);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/speech',
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
      model: 'tts-1',
      input: 'Hello world',
      voice: 'alloy',
    });
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it('honours voice/model overrides and a custom base URL', async () => {
    fetchMock.mockResolvedValue(okAudio());
    const outputDir = await makeTempDir();
    const provider = new OpenAITTSProvider({
      apiKey: TEST_KEY,
      baseUrl: 'https://example-tts.local/v1/',
      outputDir,
    });

    await provider.generateSpeech({ text: 'hi', voice: 'nova', model: 'tts-1-hd' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example-tts.local/v1/audio/speech',
      expect.anything()
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.voice).toBe('nova');
    expect(body.model).toBe('tts-1-hd');
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it('rejects empty text without a network call', async () => {
    const provider = new OpenAITTSProvider({
      apiKey: TEST_KEY,
      outputDir: await makeTempDir(),
    });
    await expect(provider.generateSpeech({ text: '   ' })).rejects.toThrow(
      /non-empty text/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never leaks the key in error messages', async () => {
    fetchMock.mockResolvedValue(errStatus(401));
    const provider = new OpenAITTSProvider({
      apiKey: TEST_KEY,
      outputDir: await makeTempDir(),
    });
    const err = await provider.generateSpeech({ text: 'hi' }).catch((e) => e);
    expect(String((err as Error).message)).not.toContain(TEST_KEY);
  });

  it('testConnection validates via GET /models without synthesizing', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const provider = new OpenAITTSProvider({ apiKey: TEST_KEY });

    const result = await provider.testConnection();

    expect(result.status).toBe('connected');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('testConnection maps 401 to invalid_key', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const provider = new OpenAITTSProvider({ apiKey: TEST_KEY });

    const result = await provider.testConnection();

    expect(result.status).toBe('invalid_key');
    expect(JSON.stringify(result)).not.toContain(TEST_KEY);
  });
});

describe('StubTTSProvider', () => {
  it('throws ProviderNotConfiguredError and reports not_configured', async () => {
    const stub = new StubTTSProvider();
    await expect(stub.generateSpeech({ text: 'hi' })).rejects.toBeInstanceOf(
      ProviderNotConfiguredError
    );
    await expect(stub.testConnection()).resolves.toMatchObject({
      status: 'not_configured',
      message: 'TTS provider not configured.',
    });
  });
});
