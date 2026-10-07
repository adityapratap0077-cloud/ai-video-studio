/**
 * Provider registry — resolves providers for the app from stored config.
 *
 * - getAIProvider(): prefers the custom-llm (OpenAI-compatible) provider
 *   when it has a key and is active; otherwise returns a live
 *   OpenRouterProvider when a key exists (database row first,
 *   OPENROUTER_API_KEY env as fallback); otherwise an AIProvider whose
 *   generateText throws ProviderNotConfiguredError and whose
 *   testConnection reports "not_configured".
 * - getTTSProvider(): live OpenAITTSProvider when a TTS key exists,
 *   otherwise an honest "not_configured" stub. Voiceover scripts can
 *   always be exported as text (no key needed).
 * - getSearchProvider(): live TavilyProvider when a search key exists,
 *   otherwise an honest "not_configured" stub.
 * - getVideoProvider(): honest "not_configured" stub — no video provider
 *   is implemented yet (see stubs.ts for why).
 * - getProviderStatusList(): masked provider rows for the settings UI
 *   (never includes encryptedKey or raw keys).
 * - ensureDefaultProviders(): seeds the provider rows if missing.
 */
import { db } from '@/lib/db';
import { OpenRouterProvider } from './openrouter';
import {
  CUSTOM_LLM_PROVIDER_ID,
  DEFAULT_CUSTOM_BASE_URL,
  DEFAULT_CUSTOM_MODEL,
  OpenAICompatibleProvider,
  parseCustomModelField,
} from './openai-compatible';
import { OpenAITTSProvider } from './openai-tts';
import { TavilyProvider } from './tavily';
import {
  StubSearchProvider,
  StubTTSProvider,
  StubVideoProvider,
} from './stubs';
import { getProviderApiKey } from './config';
import type {
  AIProvider,
  ProviderStatus,
  ProviderTestResult,
  SearchProvider,
  TTSProvider,
  VideoProvider,
} from './types';
import { ProviderNotConfiguredError } from './types';

export const OPENROUTER_PROVIDER_ID = 'openrouter';

/** Capability type per provider id. */
export const PROVIDER_TYPES: Record<string, string> = {
  openrouter: 'ai',
  'custom-llm': 'ai',
  video: 'video',
  image: 'image',
  tts: 'tts',
  search: 'search',
};

const DEFAULT_MODEL = 'openrouter/free';

/** AIProvider returned when no key is configured anywhere. */
function unconfiguredAIProvider(): AIProvider {
  return {
    id: OPENROUTER_PROVIDER_ID,
    name: 'OpenRouter',
    type: 'ai',
    async generateText() {
      throw new ProviderNotConfiguredError('OpenRouter');
    },
    async testConnection(): Promise<ProviderTestResult> {
      return {
        status: 'not_configured',
        message: 'OpenRouter provider not configured.',
      };
    },
  };
}

export async function getAIProvider(): Promise<AIProvider> {
  try {
    await ensureDefaultProviders();
  } catch {
    // Seeding failure must not block provider resolution.
  }

  // The custom OpenAI-compatible LLM wins when it is configured and active.
  const custom = await getCustomLLMProvider().catch(() => null);
  if (custom) return custom;

  const apiKey = await getProviderApiKey(OPENROUTER_PROVIDER_ID);
  if (!apiKey) {
    return unconfiguredAIProvider();
  }

  let model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  try {
    const row = await db.providerConfig.findUnique({
      where: { providerId: OPENROUTER_PROVIDER_ID },
      select: { model: true },
    });
    if (row?.model) model = row.model;
  } catch {
    // Keep the env/default model when the DB is unavailable.
  }

  return new OpenRouterProvider({ apiKey, defaultModel: model });
}

/**
 * Resolves the custom-llm provider, or null when it is not usable.
 * Usable = has a key (Settings UI or CUSTOM_LLM_API_KEY env) and is active.
 */
async function getCustomLLMProvider(): Promise<AIProvider | null> {
  const apiKey = await getProviderApiKey(CUSTOM_LLM_PROVIDER_ID);
  if (!apiKey) return null;

  let isActive = true;
  let baseUrlColumn = '';
  let modelField = '';
  try {
    const row = await db.providerConfig.findUnique({
      where: { providerId: CUSTOM_LLM_PROVIDER_ID },
      select: { isActive: true, baseUrl: true, model: true },
    });
    if (row) {
      isActive = row.isActive;
      baseUrlColumn = row.baseUrl ?? '';
      modelField = row.model ?? '';
    }
  } catch {
    // Keep env/default resolution when the DB is unavailable.
  }
  if (!isActive) return null;

  const parsed = parseCustomModelField(modelField);
  const baseUrl =
    process.env.CUSTOM_LLM_BASE_URL ||
    baseUrlColumn ||
    parsed.baseUrl ||
    DEFAULT_CUSTOM_BASE_URL;
  const model =
    parsed.model ||
    (!parsed.baseUrl && modelField ? modelField : '') ||
    process.env.CUSTOM_LLM_MODEL ||
    DEFAULT_CUSTOM_MODEL;

  return new OpenAICompatibleProvider({ apiKey, baseUrl, defaultModel: model });
}

/**
 * TTS provider: live OpenAI-compatible TTS when a key is configured
 * (Settings UI, TTS_PROVIDER_API_KEY, or OPENAI_API_KEY), otherwise an
 * honest stub. Voiceover scripts are always exportable as text.
 */
export async function getTTSProvider(): Promise<TTSProvider> {
  const apiKey = await getProviderApiKey('tts');
  if (!apiKey) return new StubTTSProvider();
  return new OpenAITTSProvider({
    apiKey,
    baseUrl: process.env.TTS_BASE_URL || undefined,
    defaultModel: process.env.TTS_MODEL || undefined,
    defaultVoice: process.env.TTS_VOICE || undefined,
  });
}

/**
 * Search provider: live Tavily when a key is configured (Settings UI,
 * SEARCH_PROVIDER_API_KEY, or TAVILY_API_KEY), otherwise an honest stub.
 */
export async function getSearchProvider(): Promise<SearchProvider> {
  const apiKey = await getProviderApiKey('search');
  if (!apiKey) return new StubSearchProvider();
  return new TavilyProvider({ apiKey });
}

/**
 * Video provider: honest stub — no video provider is implemented yet.
 * See stubs.ts for the reasoning. The app keeps working (script,
 * storyboard, prompts) without it.
 */
export async function getVideoProvider(): Promise<VideoProvider> {
  return new StubVideoProvider();
}

export interface ProviderStatusEntry {
  id: string;
  providerId: string;
  displayName: string;
  type: string;
  model: string;
  isActive: boolean;
  lastStatus: ProviderStatus | string;
  lastTestedAt: string | null;
  lastError: string;
  keyHint: string;
  hasKey: boolean;
}

/** Masked provider rows for the settings UI — no keys, encrypted or raw. */
export async function getProviderStatusList(): Promise<ProviderStatusEntry[]> {
  await ensureDefaultProviders();
  const rows = await db.providerConfig.findMany({
    orderBy: { providerId: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    providerId: row.providerId,
    displayName: row.displayName,
    type: PROVIDER_TYPES[row.providerId] ?? 'unknown',
    model: row.model,
    isActive: row.isActive,
    lastStatus: row.lastStatus,
    lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    lastError: row.lastError,
    keyHint: row.keyHint,
    hasKey: row.encryptedKey.length > 0,
  }));
}

/** Seeds the provider rows if they are missing. Idempotent. */
export async function ensureDefaultProviders(): Promise<void> {
  const defaults: Array<{
    providerId: string;
    displayName: string;
    model: string;
  }> = [
    { providerId: 'openrouter', displayName: 'OpenRouter', model: '' },
    {
      providerId: 'custom-llm',
      displayName: 'Custom LLM (OpenAI-compatible)',
      model: '',
    },
    { providerId: 'video', displayName: 'Video', model: '' },
    { providerId: 'image', displayName: 'Image', model: '' },
    { providerId: 'tts', displayName: 'TTS', model: '' },
    { providerId: 'search', displayName: 'Search', model: '' },
  ];

  for (const d of defaults) {
    await db.providerConfig.upsert({
      where: { providerId: d.providerId },
      create: {
        providerId: d.providerId,
        displayName: d.displayName,
        model: d.model,
      },
      update: {},
    });
  }
}
