/**
 * OpenAI text-to-speech provider (implements TTSProvider).
 *
 * Dead-simple REST call: POST {baseUrl}/audio/speech with a Bearer key,
 * JSON body { model, input, voice }, response body is the audio bytes
 * (mp3 by default). The audio is written to a server-local file and the
 * absolute path is returned — never a data URL, so nothing leaks into
 * logs or exports.
 *
 * The base URL is configurable, so this also works against any
 * OpenAI-compatible TTS endpoint. Default voice "alloy"; available voices
 * on OpenAI: alloy, echo, fable, onyx, nova, shimmer.
 *
 * testConnection() does NOT synthesize audio: it calls GET {baseUrl}/models
 * with the key, which validates the credential without spending a cent.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  ProviderTestResult,
  SpeechOptions,
  SpeechResult,
  TTSProvider,
} from './types';

export const OPENAI_TTS_PROVIDER_ID = 'openai-tts';
export const DEFAULT_TTS_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_TTS_MODEL = 'tts-1';
export const DEFAULT_TTS_VOICE = 'alloy';

const REQUEST_TIMEOUT_MS = 120_000;

function audioOutputDir(): string {
  const dir =
    process.env.AUDIO_OUTPUT_DIR || path.join(process.cwd(), 'data', 'audio');
  return path.resolve(dir);
}

type FailureCode =
  | 'invalid_key'
  | 'rate_limited'
  | 'provider_error'
  | 'timeout'
  | 'network';

class TTSRequestError extends Error {
  readonly code: FailureCode;

  constructor(code: FailureCode, message: string) {
    super(message);
    this.name = 'TTSRequestError';
    this.code = code;
  }
}

export interface OpenAITTSOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  defaultVoice?: string;
  /** Server-local directory for generated audio. Defaults to ./data/audio. */
  outputDir?: string;
}

export class OpenAITTSProvider implements TTSProvider {
  readonly id = OPENAI_TTS_PROVIDER_ID;
  readonly name = 'OpenAI TTS';
  readonly type = 'tts' as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly voice: string;
  private readonly outputDir: string;

  constructor(opts: OpenAITTSOptions) {
    if (!opts.apiKey) {
      throw new Error('OpenAITTSProvider requires an apiKey.');
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || DEFAULT_TTS_BASE_URL).replace(/\/+$/, '');
    this.model = opts.defaultModel || DEFAULT_TTS_MODEL;
    this.voice = opts.defaultVoice || DEFAULT_TTS_VOICE;
    this.outputDir = opts.outputDir
      ? path.resolve(opts.outputDir)
      : audioOutputDir();
  }

  private async request(
    urlPath: string,
    init: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${this.baseUrl}${urlPath}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.headers || {}),
        },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new TTSRequestError('timeout', 'Request timed out');
      }
      throw new TTSRequestError(
        'network',
        'Network error: unable to reach the TTS endpoint'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private static toRequestError(status: number): TTSRequestError {
    switch (status) {
      case 401:
        return new TTSRequestError('invalid_key', 'Invalid API key');
      case 429:
        return new TTSRequestError('rate_limited', 'Rate limited');
      default:
        return new TTSRequestError(
          'provider_error',
          `Provider error (status ${status})`
        );
    }
  }

  async generateSpeech(o: SpeechOptions): Promise<SpeechResult> {
    if (!o.text || !o.text.trim()) {
      throw new Error('generateSpeech requires non-empty text.');
    }

    const res = await this.request('/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: o.model || this.model,
        input: o.text,
        voice: o.voice || this.voice,
      }),
    });

    if (!res.ok) {
      throw OpenAITTSProvider.toRequestError(res.status);
    }

    const audioBytes = Buffer.from(await res.arrayBuffer());
    if (audioBytes.length === 0) {
      throw new TTSRequestError('provider_error', 'Empty audio response');
    }

    await fs.mkdir(this.outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rand = Math.random().toString(36).slice(2, 10);
    const audioPath = path.join(this.outputDir, `tts-${stamp}-${rand}.mp3`);
    await fs.writeFile(audioPath, audioBytes);

    return { audioPath };
  }

  async testConnection(): Promise<ProviderTestResult> {
    const started = Date.now();
    const latencyMs = () => Date.now() - started;
    try {
      // GET /models validates the key without synthesizing (and billing) audio.
      const res = await this.request('/models', { method: 'GET' });
      if (!res.ok) {
        throw OpenAITTSProvider.toRequestError(res.status);
      }
      return {
        status: 'connected',
        message: 'Connected to the TTS endpoint.',
        latencyMs: latencyMs(),
      };
    } catch (err) {
      const ms = latencyMs();
      if (err instanceof TTSRequestError) {
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
              message: `Unable to reach ${this.baseUrl}.`,
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
