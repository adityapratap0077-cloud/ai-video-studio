/**
 * Stub providers for capability types with no live implementation yet
 * (video, image). They advertise "not_configured" and throw
 * ProviderNotConfiguredError if a generation call is attempted.
 *
 * NOTE on video: as of 2026-10-07 there is no honest one-call REST
 * implementation available.
 * - Kling's official API (api.klingai.com) requires JWT auth signed with an
 *   access key + secret key pair, plus async task polling — not a simple
 *   Bearer REST call.
 * - Runway's API (api.dev.runwayml.com, header X-Runway-Version) is
 *   Bearer-based but every generation is an async task (create task, poll
 *   GET /v1/tasks/{id} until SUCCEEDED, then download an ephemeral URL),
 *   billed per second. Wiring that safely needs a job queue, not a single
 *   request handler.
 * Until a billing-safe async job pipeline exists, video stays an honest
 * stub: the Settings UI shows "Video provider not configured" and every
 * other stage (script, storyboard, prompts) keeps working.
 */
import { ProviderNotConfiguredError } from './types';
import type {
  ImageProvider,
  ProviderTestResult,
  SearchProvider,
  SpeechOptions,
  SearchResultItem,
  TTSProvider,
  VideoGenOptions,
  VideoGenResult,
  VideoProvider,
} from './types';

function notConfiguredResult(name: string): ProviderTestResult {
  return {
    status: 'not_configured',
    message: `${name} provider not configured.`,
  };
}

export class StubVideoProvider implements VideoProvider {
  readonly id = 'video';
  readonly name = 'Video';
  readonly type = 'video' as const;

  async generateVideo(_opts: VideoGenOptions): Promise<VideoGenResult> {
    throw new ProviderNotConfiguredError(this.name);
  }

  async testConnection(): Promise<ProviderTestResult> {
    return notConfiguredResult(this.name);
  }
}

export class StubImageProvider implements ImageProvider {
  readonly id = 'image';
  readonly name = 'Image';
  readonly type = 'image' as const;

  async generateImage(..._args: unknown[]): Promise<never> {
    throw new ProviderNotConfiguredError(this.name);
  }

  async testConnection(): Promise<ProviderTestResult> {
    return notConfiguredResult(this.name);
  }
}

/**
 * Honest TTS stub. Used only when no TTS key is configured — the real
 * implementation is OpenAITTSProvider (./openai-tts.ts), selected by
 * getTTSProvider() in the registry.
 */
export class StubTTSProvider implements TTSProvider {
  readonly id = 'tts';
  readonly name = 'TTS';
  readonly type = 'tts' as const;

  async generateSpeech(_opts: SpeechOptions): Promise<{ audioPath: string }> {
    throw new ProviderNotConfiguredError(this.name);
  }

  async testConnection(): Promise<ProviderTestResult> {
    return notConfiguredResult(this.name);
  }
}

/**
 * Honest search stub. Used only when no search key is configured — the real
 * implementation is TavilyProvider (./tavily.ts), selected by
 * getSearchProvider() in the registry.
 */
export class StubSearchProvider implements SearchProvider {
  readonly id = 'search';
  readonly name = 'Search';
  readonly type = 'search' as const;

  async search(
    _query: string,
    _maxResults?: number
  ): Promise<SearchResultItem[]> {
    throw new ProviderNotConfiguredError(this.name);
  }

  async testConnection(): Promise<ProviderTestResult> {
    return notConfiguredResult(this.name);
  }
}
