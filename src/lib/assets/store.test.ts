import { describe, expect, it } from 'vitest';
import {
  assertSafeProjectId,
  detectAssetType,
  resolveAssetPath,
  storedFileName,
} from './store';

describe('assertSafeProjectId', () => {
  it('accepts cuid-style ids', () => {
    expect(() => assertSafeProjectId('cm3x9k2abc123')).not.toThrow();
  });

  it('rejects traversal and junk', () => {
    expect(() => assertSafeProjectId('../etc')).toThrow();
    expect(() => assertSafeProjectId('a/b')).toThrow();
    expect(() => assertSafeProjectId('')).toThrow();
    expect(() => assertSafeProjectId('x'.repeat(65))).toThrow();
  });
});

describe('resolveAssetPath', () => {
  it('resolves inside the project directory', () => {
    const resolved = resolveAssetPath('proj1', 'a1_hero.png');
    expect(resolved.endsWith('/proj1/a1_hero.png')).toBe(true);
  });

  it('blocks directory escape', () => {
    expect(() => resolveAssetPath('proj1', '../../etc/passwd')).toThrow(
      /escapes/,
    );
    expect(() => resolveAssetPath('proj1', '/etc/passwd')).toThrow(/escapes/);
  });
});

describe('storedFileName', () => {
  it('prefixes a uuid and sanitizes the original name', () => {
    const name = storedFileName('../../evil; rm -rf.mp4');
    expect(name).toMatch(/^[0-9a-f-]{36}_/);
    expect(name).not.toContain('/');
    expect(name).not.toContain(';');
    expect(name).not.toContain(' ');
    expect(name.endsWith('.mp4')).toBe(true);
  });
});

describe('detectAssetType', () => {
  it('maps extensions to types', () => {
    expect(detectAssetType('a.PNG')).toBe('image');
    expect(detectAssetType('b.mp4')).toBe('video');
    expect(detectAssetType('c.wav')).toBe('audio');
    expect(detectAssetType('d.vtt')).toBe('caption');
    expect(detectAssetType('e.txt')).toBe(null);
  });
});
