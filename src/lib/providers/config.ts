/**
 * Canonical provider key lookup — server-side only.
 *
 * Reads the encrypted key from the ProviderConfig table and decrypts it.
 * Falls back to environment variables when no database row holds a key:
 *   openrouter -> OPENROUTER_API_KEY
 *   custom-llm  -> CUSTOM_LLM_API_KEY
 *   tts        -> TTS_PROVIDER_API_KEY (or OPENAI_API_KEY)
 *   search     -> SEARCH_PROVIDER_API_KEY (or TAVILY_API_KEY)
 *
 * The decrypted key must never leave the server: route handlers and the
 * registry use this, and nothing here is importable from client code.
 */
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';

/** Env-var fallbacks per provider id (Settings UI key takes precedence). */
const ENV_FALLBACKS: Record<string, string[]> = {
  openrouter: ['OPENROUTER_API_KEY'],
  'custom-llm': ['CUSTOM_LLM_API_KEY'],
  tts: ['TTS_PROVIDER_API_KEY', 'OPENAI_API_KEY'],
  search: ['SEARCH_PROVIDER_API_KEY', 'TAVILY_API_KEY'],
};

/** Returns the decrypted API key for a provider, or null when not configured. */
export async function getProviderApiKey(
  providerId: string
): Promise<string | null> {
  try {
    const row = await db.providerConfig.findUnique({
      where: { providerId },
    });
    if (row?.encryptedKey) {
      try {
        return decrypt(row.encryptedKey);
      } catch {
        // Corrupt/undecryptable stored key: fall through to env lookup.
      }
    }
  } catch {
    // Database unavailable: fall through to env lookup.
  }

  for (const envName of ENV_FALLBACKS[providerId] ?? []) {
    const value = process.env[envName];
    if (value) return value;
  }
  return null;
}
