import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the key-lookup seam — no real provider keys are touched.
vi.mock('@/lib/providers/config', () => ({
  getProviderApiKey: vi.fn(),
}));

import {
  getAIProvider,
  getTTSProvider,
  getSearchProvider,
  getVideoProvider,
  getProviderStatusList,
  ensureDefaultProviders,
} from './registry';
import { ProviderNotConfiguredError } from './types';
import { OpenRouterProvider } from './openrouter';
import { OpenAICompatibleProvider } from './openai-compatible';
import { OpenAITTSProvider } from './openai-tts';
import { TavilyProvider } from './tavily';
import { StubVideoProvider, StubTTSProvider, StubSearchProvider } from './stubs';
import { getProviderApiKey } from '@/lib/providers/config';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

const mockedGetProviderApiKey = vi.mocked(getProviderApiKey);

const CUSTOM_KEY = 'custom-llm-test-key';
const OPENROUTER_KEY = 'openrouter-test-key';

beforeEach(async () => {
  mockedGetProviderApiKey.mockReset();
  mockedGetProviderApiKey.mockImplementation(async (id: string) => {
    if (id === 'custom-llm') return CUSTOM_KEY;
    if (id === 'openrouter') return OPENROUTER_KEY;
    return null;
  });
  await ensureDefaultProviders();
  // Reset the custom-llm row between tests.
  await db.providerConfig.update({
    where: { providerId: 'custom-llm' },
    data: { model: '', baseUrl: '', isActive: true },
  });
});

describe('getAIProvider custom-llm preference', () => {
  it('prefers custom-llm when it has a key and is active', async () => {
    await db.providerConfig.update({
      where: { providerId: 'custom-llm' },
      data: { model: 'http://localhost:11434/v1 | llama3.1' },
    });

    const provider = await getAIProvider();

    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.id).toBe('custom-llm');
    expect((provider as OpenAICompatibleProvider).endpoint).toBe(
      'http://localhost:11434/v1/chat/completions'
    );
    expect((provider as OpenAICompatibleProvider).currentModel).toBe('llama3.1');
  });

  it('uses CUSTOM_LLM_BASE_URL env over the model-field convention', async () => {
    process.env.CUSTOM_LLM_BASE_URL = 'http://env-host:11434/v1';
    try {
      const provider = await getAIProvider();
      expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
      expect((provider as OpenAICompatibleProvider).endpoint).toBe(
        'http://env-host:11434/v1/chat/completions'
      );
    } finally {
      delete process.env.CUSTOM_LLM_BASE_URL;
    }
  });

  it('falls back to OpenRouter when custom-llm is inactive', async () => {
    await db.providerConfig.update({
      where: { providerId: 'custom-llm' },
      data: { isActive: false },
    });

    const provider = await getAIProvider();

    expect(provider).toBeInstanceOf(OpenRouterProvider);
    expect(provider.id).toBe('openrouter');
  });

  it('falls back to OpenRouter when custom-llm has no key', async () => {
    mockedGetProviderApiKey.mockImplementation(async (id: string) =>
      id === 'openrouter' ? OPENROUTER_KEY : null
    );

    const provider = await getAIProvider();

    expect(provider).toBeInstanceOf(OpenRouterProvider);
  });

  it('returns an unconfigured provider when neither LLM has a key', async () => {
    mockedGetProviderApiKey.mockResolvedValue(null);

    const provider = await getAIProvider();

    await expect(provider.generateText({ prompt: 'hi' })).rejects.toBeInstanceOf(
      ProviderNotConfiguredError
    );
  });
});

describe('capability resolvers', () => {
  it('getTTSProvider returns the honest stub without a key', async () => {
    const provider = await getTTSProvider();
    expect(provider).toBeInstanceOf(StubTTSProvider);
    await expect(provider.testConnection()).resolves.toMatchObject({
      status: 'not_configured',
    });
  });

  it('getTTSProvider returns OpenAITTSProvider with a key', async () => {
    mockedGetProviderApiKey.mockImplementation(async (id: string) =>
      id === 'tts' ? 'tts-test-key' : null
    );
    const provider = await getTTSProvider();
    expect(provider).toBeInstanceOf(OpenAITTSProvider);
  });

  it('getSearchProvider returns the honest stub without a key', async () => {
    const provider = await getSearchProvider();
    expect(provider).toBeInstanceOf(StubSearchProvider);
    await expect(provider.testConnection()).resolves.toMatchObject({
      status: 'not_configured',
    });
  });

  it('getSearchProvider returns TavilyProvider with a key', async () => {
    mockedGetProviderApiKey.mockImplementation(async (id: string) =>
      id === 'search' ? 'tavily-test-key' : null
    );
    const provider = await getSearchProvider();
    expect(provider).toBeInstanceOf(TavilyProvider);
  });

  it('getVideoProvider is always the honest stub', async () => {
    const provider = await getVideoProvider();
    expect(provider).toBeInstanceOf(StubVideoProvider);
    await expect(provider.testConnection()).resolves.toMatchObject({
      status: 'not_configured',
      message: 'Video provider not configured.',
    });
    await expect(
      provider.generateVideo({
        prompt: 'a cat',
        durationSec: 5,
        aspectRatio: '9:16',
      })
    ).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });
});

describe('getProviderStatusList key masking', () => {
  it('never exposes encryptedKey or raw key material', async () => {
    const plaintext = 'super-secret-plaintext-key-12345';
    await db.providerConfig.update({
      where: { providerId: 'openrouter' },
      data: { encryptedKey: encrypt(plaintext), keyHint: '2345' },
    });

    const list = await getProviderStatusList();

    const dumped = JSON.stringify(list);
    expect(dumped).not.toContain('encryptedKey');
    expect(dumped).not.toContain(plaintext);
    expect(dumped).not.toContain(CUSTOM_KEY);
    expect(dumped).not.toContain(OPENROUTER_KEY);

    const openrouter = list.find((p) => p.providerId === 'openrouter');
    expect(openrouter).toBeDefined();
    expect(openrouter!.hasKey).toBe(true);
    expect(openrouter!.keyHint).toBe('2345');

    // Clean up so other suites see a pristine row.
    await db.providerConfig.update({
      where: { providerId: 'openrouter' },
      data: { encryptedKey: '', keyHint: '' },
    });
  });
});
