/**
 * Provider interface contracts for AI Video Studio (backend lane).
 *
 * These are the exact exports the backend API routes and registry rely on.
 */

export type ProviderStatus =
  | 'connected'
  | 'not_configured'
  | 'invalid_key'
  | 'rate_limited'
  | 'unavailable'
  | 'error';

export interface ProviderTestResult {
  status: ProviderStatus;
  message: string;
  latencyMs?: number;
}

export interface TextGenOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface TextGenResult {
  text: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class ProviderNotConfiguredError extends Error {
  constructor(providerName: string) {
    super(`${providerName} provider not configured.`);
    this.name = 'ProviderNotConfiguredError';
  }
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly type: 'ai';
  generateText(o: TextGenOptions): Promise<TextGenResult>;
  testConnection(): Promise<ProviderTestResult>;
}

export interface VideoGenOptions {
  prompt: string;
  negativePrompt?: string;
  /** Clip length in seconds. Defaults to 5 when omitted. */
  durationSec?: number;
  /** Defaults to '16:9' when omitted. */
  aspectRatio?: '9:16' | '16:9' | '1:1';
  model?: string;
}

export interface VideoGenResult {
  videoUrl?: string;
  videoPath?: string;
  /** e.g. 'succeeded' | 'queued' | 'processing' | 'failed' */
  status: string;
}

export interface SpeechOptions {
  text: string;
  voice?: string;
  model?: string;
}

export interface SpeechResult {
  /** Absolute path of the written audio file on the server. */
  audioPath: string;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface VideoProvider {
  readonly id: string;
  readonly name: string;
  readonly type: 'video';
  generateVideo(opts: VideoGenOptions): Promise<VideoGenResult>;
  testConnection(): Promise<ProviderTestResult>;
}

export interface ImageProvider {
  readonly id: string;
  readonly name: string;
  readonly type: 'image';
  generateImage(...args: unknown[]): Promise<never>;
  testConnection(): Promise<ProviderTestResult>;
}

export interface TTSProvider {
  readonly id: string;
  readonly name: string;
  readonly type: 'tts';
  generateSpeech(opts: SpeechOptions): Promise<SpeechResult>;
  testConnection(): Promise<ProviderTestResult>;
}

export interface SearchProvider {
  readonly id: string;
  readonly name: string;
  readonly type: 'search';
  search(query: string, maxResults?: number): Promise<SearchResultItem[]>;
  testConnection(): Promise<ProviderTestResult>;
}
