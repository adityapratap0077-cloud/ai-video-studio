/**
 * Vitest global setup.
 * Provides safe test-only defaults so the suite never needs real secrets
 * or a real database. NEVER put real API keys here.
 */
if (!process.env.ENCRYPTION_KEY) {
  // Fixed 32-byte (64 hex char) test fixture key — NOT a real secret.
  process.env.ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./test.db';
}
