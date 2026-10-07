/**
 * Real-ffmpeg smoke test. ONLY runs with FFMPEG_TEST=1:
 *
 *   FFMPEG_TEST=1 pnpm vitest run src/lib/video/ffmpeg.integration.test.ts
 *
 * Verifies the actual binary at /usr/bin/ffmpeg can build the placeholder
 * -> concat -> resize chain end to end. Slow-ish (~seconds); keep it tiny.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const enabled = process.env.FFMPEG_TEST === '1';
const describeIf = enabled ? describe : describe.skip;

describeIf('ffmpeg integration (real binary)', () => {
  it('placeholder -> concat -> resizePad produces a playable MP4', async () => {
    const { concatClips, resizePad } = await import('./ffmpeg');

    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'avs-int-'));
    try {
      const concatOut = path.join(tmp, 'concat.mp4');
      await concatClips(
        [
          { label: 'Scene 1: intro', durationSec: 1 },
          { label: 'Scene 2: the "twist"', durationSec: 1 },
        ],
        concatOut,
        { tmpDir: tmp, w: 640, h: 360, timeoutMs: 60_000 },
      );
      const concatStat = await fs.promises.stat(concatOut);
      expect(concatStat.size).toBeGreaterThan(10_000);

      const finalOut = path.join(tmp, 'final.mp4');
      await resizePad(concatOut, 1080, 1920, finalOut, { timeoutMs: 60_000 });
      const finalStat = await fs.promises.stat(finalOut);
      expect(finalStat.size).toBeGreaterThan(10_000);

      // Sanity: it is really an MP4 (ftyp box near the start).
      const head = Buffer.alloc(12);
      const fd = await fs.promises.open(finalOut, 'r');
      await fd.read(head, 0, 12, 0);
      await fd.close();
      expect(head.subarray(4, 8).toString('ascii')).toBe('ftyp');
    } finally {
      await fs.promises.rm(tmp, { recursive: true, force: true });
    }
  }, 120_000);
});
