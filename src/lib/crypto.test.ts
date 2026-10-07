import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto';

describe('crypto', () => {
  it('round-trips encrypt/decrypt', () => {
    const plaintext = 'sk-or-test-secret-value-123';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('round-trips unicode and empty-ish input', () => {
    expect(decrypt(encrypt('héllo wörld 🌊'))).toBe('héllo wörld 🌊');
  });

  it('produces unique ciphertexts for the same plaintext (random IV)', () => {
    expect(encrypt('same-input')).not.toBe(encrypt('same-input'));
  });

  it('fails to decrypt with the wrong key', () => {
    const encrypted = encrypt('top-secret');
    const realKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'ff'.repeat(32);
    try {
      expect(() => decrypt(encrypted)).toThrow();
    } finally {
      process.env.ENCRYPTION_KEY = realKey;
    }
  });

  it('fails to decrypt tampered ciphertext', () => {
    const encrypted = encrypt('top-secret');
    const [iv, cipher, tag] = encrypted.split(':') as [string, string, string];
    // Flip a byte in the ciphertext body — GCM auth must reject it.
    const tamperedCipher = (cipher.startsWith('00') ? 'ff' : '00') + cipher.slice(2);
    expect(() => decrypt(`${iv}:${tamperedCipher}:${tag}`)).toThrow();
  });

  it('fails to decrypt a tampered auth tag', () => {
    const encrypted = encrypt('top-secret');
    const [iv, cipher, tag] = encrypted.split(':') as [string, string, string];
    const tamperedTag = (tag.startsWith('00') ? 'ff' : '00') + tag.slice(2);
    expect(() => decrypt(`${iv}:${cipher}:${tamperedTag}`)).toThrow();
  });

  it('uses the iv:cipher:tag format', () => {
    const encrypted = encrypt('format-check');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    const [iv, cipher, tag] = parts as [string, string, string];
    expect(iv).toHaveLength(24); // 12-byte IV as hex
    expect(tag).toHaveLength(32); // 16-byte GCM tag as hex
    expect(cipher.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(part).toMatch(/^[0-9a-f]+$/);
    }
  });

  it('rejects malformed payloads', () => {
    expect(() => decrypt('not-a-valid-payload')).toThrow();
    expect(() => decrypt('a:b')).toThrow();
    expect(() => decrypt('')).toThrow();
  });
});
