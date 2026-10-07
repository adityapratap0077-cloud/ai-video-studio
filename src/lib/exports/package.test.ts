import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  APP_VERSION,
  buildProductionPackage,
  stripSecretFields,
} from './package';

describe('stripSecretFields', () => {
  it('drops secret-looking keys but keeps innocent ones', () => {
    const input = {
      apiKey: 'sk-live-should-not-appear',
      encryptedKey: 'deadbeef',
      keyHint: '••••1234',
      keyFacts: ['must stay'],
      usage: { promptTokens: 42, completionTokens: 7 },
      nested: { deep: { clientSecret: 'nope', label: 'yes' } },
      tags: [{ token: 'nope' }, { name: 'keep' }],
    };
    const out = stripSecretFields(input) as Record<string, unknown>;

    expect(out).not.toHaveProperty('apiKey');
    expect(out).not.toHaveProperty('encryptedKey');
    expect(out).not.toHaveProperty('keyHint');
    expect(out).toHaveProperty('keyFacts', ['must stay']);
    expect(out).toHaveProperty('usage', { promptTokens: 42, completionTokens: 7 });
    expect((out.nested as Record<string, unknown>).deep).toEqual({ label: 'yes' });
    expect(out.tags).toEqual([{}, { name: 'keep' }]); // secret-only objects become {}
  });

  it('returns primitives untouched', () => {
    expect(stripSecretFields('token')).toBe('token');
    expect(stripSecretFields(5)).toBe(5);
    expect(stripSecretFields(null)).toBe(null);
  });
});

describe('buildProductionPackage', () => {
  it('writes the full manifest with no keys anywhere', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'avs-pkg-'));
    const assetDir = path.join(root, 'proj1');
    await fs.promises.mkdir(assetDir, { recursive: true });

    // One real asset file on disk; one referenced-but-missing file.
    await fs.promises.writeFile(path.join(assetDir, 'real.png'), Buffer.from([137, 80, 78, 71]));
    const missingPath = 'gone.mp4';

    const data = {
      script: { fullText: 'Hello. This is the narration.' },
      storyboard: { scenes: [{ id: 's1', index: 0 }], totalDurationSec: 5 },
      shots: {
        shots: [
          {
            id: 'shot-1',
            sceneId: 's1',
            description: 'A neon city.',
            videoPrompt: 'neon city flyover',
            camera: 'aerial',
            lighting: 'neon',
            environment: 'city',
            subject: 'skyline',
            motion: 'slow push in',
            durationSec: 5,
            aspectRatio: '16:9',
          },
        ],
      },
      assets: [
        { id: 'a1', type: 'image', path: 'real.png', provider: 'upload', createdAt: new Date().toISOString() },
        { id: 'a2', type: 'video', path: missingPath, createdAt: new Date().toISOString() },
      ],
      timeline: {
        clips: [],
        captionsVtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello.',
        totalDurationSec: 5,
      },
      // Simulates a Phase-2 stage leaking a secret into data — must be scrubbed.
      research: { summary: 'x', apiKey: 'sk-live-must-not-ship', keyFacts: ['kept'] },
    };

    try {
      const result = await buildProductionPackage({
        projectId: 'proj1',
        project: {
          id: 'proj1',
          name: 'Test Project',
          idea: 'An idea',
          stage: 'timeline',
          settings: { aspectRatio: '16:9', apiKey: 'sk-also-scrubbed' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        data: data as unknown as Record<string, unknown>,
        assetDir,
        providerRefs: [
          { providerId: 'openrouter', type: 'ai', model: 'openrouter/free', hasKey: true },
        ],
      });

      expect(result.zipRelPath).toMatch(/^proj1\/exports\/package-.*\.zip$/);
      expect(fs.existsSync(result.zipAbsPath)).toBe(true);
      expect(result.missingAssets).toContain(missingPath);

      const names = result.entries;
      expect(names).toContain('project.json');
      expect(names).toContain('script.txt');
      expect(names).toContain('storyboard.json');
      expect(names).toContain('prompts/shot-shot-1.txt');
      expect(names).toContain('captions/captions.vtt');
      expect(names).toContain('captions/captions.srt');
      expect(names).toContain('metadata.json');
      expect(names.some((n) => n.startsWith('assets/a1_'))).toBe(true);

      // Read the ZIP back and assert NO secrets anywhere.
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(result.zipAbsPath);
      const secretPattern = /sk-live|sk-also|apiKey|encryptedKey|secret/i;
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        const text = entry.getData().toString('utf8');
        // Binary asset files are not text — only scan the text artifacts.
        if (entry.entryName.startsWith('assets/')) continue;
        expect(
          text,
          `secret leaked in ${entry.entryName}`,
        ).not.toMatch(secretPattern);
      }

      // Innocent fields survive the scrub.
      const projectJson = JSON.parse(
        zip.readAsText('project.json'),
      ) as { data: { research: { keyFacts: string[] } } };
      expect(projectJson.data.research.keyFacts).toEqual(['kept']);

      // metadata.json: provider *references* only.
      const metadata = JSON.parse(zip.readAsText('metadata.json')) as {
        app: string;
        providerRefs: Array<Record<string, unknown>>;
      };
      expect(metadata.app).toBe(APP_VERSION);
      expect(metadata.providerRefs).toEqual([
        { providerId: 'openrouter', type: 'ai', model: 'openrouter/free', hasKey: true },
      ]);
      expect(Object.keys(metadata.providerRefs[0]).sort()).toEqual(
        ['hasKey', 'model', 'providerId', 'type'],
      );
      expect(JSON.stringify(metadata)).not.toMatch(
        /"apiKey"|"encryptedKey"|"secret"|sk-/i,
      );

      // SRT was derived from the VTT.
      const srt = zip.readAsText('captions/captions.srt');
      expect(srt).toContain('00:00:00,000 --> 00:00:02,000');
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });
});
