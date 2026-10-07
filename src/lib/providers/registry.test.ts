import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB layer seam — no real provider keys are touched.
vi.mock('@/lib/providers/config', () => ({
  getProviderApiKey: vi.fn(),
}));

import { getAIProvider } from './registry';
import { ProviderNotConfiguredError } from './types';
import { OpenRouterProvider } from './openrouter';
import { getProviderApiKey } from '@/lib/providers/config';

const mockedGetProviderApiKey = vi.mocked(getProviderApiKey);

describe('getAIProvider', () => {
  beforeEach(() => {
    mockedGetProviderApiKey.mockReset();
  });

  it('returns an unconfigured AIProvider when no key is configured', async () => {
    mockedGetProviderApiKey.mockResolvedValue(null);

    const provider = await getAIProvider();

    expect(provider.id).toBe('openrouter');
    expect(provider.type).toBe('ai');
    await expect(
      provider.generateText({ prompt: 'hello' })
    ).rejects.toBeInstanceOf(ProviderNotConfiguredError);
    await expect(provider.testConnection()).resolves.toMatchObject({
      status: 'not_configured',
    });
    expect(mockedGetProviderApiKey).toHaveBeenCalledWith('openrouter');
  });

  it('the unconfigured provider error names OpenRouter', async () => {
    mockedGetProviderApiKey.mockResolvedValue(null);

    const provider = await getAIProvider();
    const err = await provider.generateText({ prompt: 'x' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ProviderNotConfiguredError);
    expect((err as Error).message).toMatch(/OpenRouter provider not configured/);
  });

  it('returns a working OpenRouterProvider when a key is configured', async () => {
    // Only openrouter has a key here: custom-llm must not shadow it.
    mockedGetProviderApiKey.mockImplementation(async (id: string) =>
      id === 'openrouter' ? 'openrouter-test-key' : null
    );

    const provider = await getAIProvider();

    expect(provider).toBeInstanceOf(OpenRouterProvider);
    expect(provider.name).toBe('OpenRouter');
    expect(provider.id).toBe('openrouter');
    expect(provider.type).toBe('ai');
    expect(typeof provider.generateText).toBe('function');
    expect(typeof provider.testConnection).toBe('function');
  });
});
