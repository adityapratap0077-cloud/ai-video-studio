/**
 * Unit tests for the FFmpeg pipeline.
 * execFile is mocked — these tests assert the exact argv we would spawn,
 * never touching a real ffmpeg. The one real-ffmpeg smoke test lives in
 * ffmpeg.integration.test.ts behind FFMPEG_TEST=1.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/video/exec', () => ({
  runProcess: vi.fn(async () => ({ stdout: '', stderr: '' })),
}));

import { runProcess } from '@/lib/video/exec';
import {
  FFMPEG_BIN,
  buildBurnCaptionsArgs,
  buildConcatArgs,
  buildMixAudioArgs,
  buildPlaceholderArgs,
  buildResizePadArgs,
  buildSegmentArgs,
  concatClips,
  detectSegmentKind,
  mixAudio,
  resizePad,
} from './ffmpeg';
import { ProjectDataSchema, TimelineSchema } from '@/lib/pipeline/schemas';

const mockedRun = vi.mocked(runProcess);

beforeEach(() => {
  mockedRun.mockClear();
});

describe('detectSegmentKind', () => {
  it('classifies by extension', () => {
    expect(detectSegmentKind('/a/clip.mp4')).toBe('video');
    expect(detectSegmentKind('/a/still.PNG')).toBe('image');
    expect(detectSegmentKind(undefined)).toBe('placeholder');
    expect(detectSegmentKind('/a/notes.txt')).toBe('placeholder');
  });
});

describe('buildPlaceholderArgs', () => {
  it('builds a lavfi color source with escaped drawtext', () => {
    const args = buildPlaceholderArgs("Scene 1: it's 100%", 2.5, 1920, 1080, '/tmp/out.mp4');
    expect(args[0]).toBe('-y');
    expect(args).toContain('lavfi');
    expect(args).toContain('color=c=0x131317:s=1920x1080:d=2.500:r=30');
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toContain('drawtext=');
    // apostrophe -> U+2019, % -> percent, colon escaped
    expect(vf).toContain('it’s 100percent');
    expect(vf).toContain('Scene 1\\:');
    expect(vf).not.toContain("it's");
    expect(args[args.length - 1]).toBe('/tmp/out.mp4');
  });
});

describe('buildSegmentArgs', () => {
  it('conforms video: scale+pad, 30fps, x264, no audio, trimmed', () => {
    const args = buildSegmentArgs('/in/clip.mov', 'video', 3, 1080, 1920, '/tmp/seg.mp4');
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toContain('scale=1080:1920:force_original_aspect_ratio=decrease');
    expect(vf).toContain('pad=1080:1920');
    expect(vf).toContain('fps=30');
    expect(args).toContain('-an');
    expect(args).toContain('libx264');
    expect(args[args.indexOf('-t') + 1]).toBe('3.000');
  });

  it('loops still images into the segment', () => {
    const args = buildSegmentArgs('/in/still.png', 'image', 2, 1080, 1920, '/tmp/seg.mp4');
    expect(args).toContain('-loop');
    expect(args).toContain('1');
  });
});

describe('buildConcatArgs', () => {
  it('uses the concat demuxer with stream copy', () => {
    const args = buildConcatArgs('/tmp/list.txt', '/tmp/final.mp4');
    expect(args).toEqual([
      '-y', '-f', 'concat', '-safe', '0', '-i', '/tmp/list.txt', '-c', 'copy', '/tmp/final.mp4',
    ]);
  });
});

describe('buildMixAudioArgs', () => {
  it('copies the video untouched when no audio is given', () => {
    const args = buildMixAudioArgs('/v.mp4', undefined, undefined, 10, '/o.mp4');
    expect(args).toEqual(['-y', '-i', '/v.mp4', '-c', 'copy', '/o.mp4']);
  });

  it('lays a lone voiceover under the video', () => {
    const args = buildMixAudioArgs('/v.mp4', '/vo.mp3', undefined, 10, '/o.mp4');
    expect(args).toContain('0:v:0');
    expect(args).toContain('1:a:0');
    expect(args).toContain('aac');
    expect(args).toContain('-shortest');
  });

  it('ducks music under the voiceover with sidechaincompress', () => {
    const args = buildMixAudioArgs('/v.mp4', '/vo.mp3', '/mu.mp3', 12.5, '/o.mp4');
    const fc = args[args.indexOf('-filter_complex') + 1];
    expect(fc).toContain('sidechaincompress=');
    expect(fc).toContain('apad=whole_dur=12.500');
    expect(fc).toContain('amix=inputs=2');
    expect(args).toContain('-shortest');
  });
});

describe('buildBurnCaptionsArgs', () => {
  it('uses the subtitles filter with a forced style', () => {
    const args = buildBurnCaptionsArgs('/v.mp4', '/tmp/caps.srt', '/o.mp4');
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toContain('subtitles=');
    expect(vf).toContain('/tmp/caps.srt');
    expect(vf).toContain('force_style=');
    expect(args).toContain('copy'); // audio stream copied
  });

  it('escapes colons in the subtitle path', () => {
    const args = buildBurnCaptionsArgs('/v.mp4', '/tmp/my:dir/caps.srt', '/o.mp4');
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toContain('/tmp/my\\:dir/caps.srt');
  });
});

describe('buildResizePadArgs', () => {
  it('scales and pads without stretching', () => {
    const args = buildResizePadArgs('/v.mp4', 1080, 1920, '/o.mp4');
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toContain('scale=1080:1920:force_original_aspect_ratio=decrease');
    expect(vf).toContain('pad=1080:1920:(ow-iw)/2:(oh-ih)/2');
    expect(vf).not.toContain('stretch');
  });
});

describe('concatClips (mocked exec)', () => {
  it('spawns placeholder + segment + concat calls via execFile argv', async () => {
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'avs-test-'));
    const out = path.join(tmp, 'final.mp4');

    try {
      const result = await concatClips(
        [
          { label: 'Scene 1', durationSec: 2 },
          { path: '/assets/hero.png', label: 'Scene 2', durationSec: 3 },
        ],
        out,
        { tmpDir: tmp, w: 1920, h: 1080 },
      );
      expect(result).toBe(out);

      expect(mockedRun).toHaveBeenCalledTimes(3);
      // 1: placeholder via lavfi
      const [bin1, args1] = mockedRun.mock.calls[0];
      expect(bin1).toBe(FFMPEG_BIN);
      expect(args1).toContain('lavfi');
      expect(args1).toContain('drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text=\'Scene 1\':fontsize=64:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2,format=yuv420p');
      // 2: image segment — path passed as a single argv element (no shell)
      const [, args2] = mockedRun.mock.calls[1];
      expect(args2).toContain('/assets/hero.png');
      expect(args2).toContain('-loop');
      // 3: concat demuxer
      const [, args3] = mockedRun.mock.calls[2];
      expect(args3.slice(0, 5)).toEqual(['-y', '-f', 'concat', '-safe', '0']);
      expect(args3[args3.length - 1]).toBe(out);
    } finally {
      await fs.promises.rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects an empty clip list', async () => {
    await expect(concatClips([], '/tmp/x.mp4')).rejects.toThrow(/no clips/);
    expect(mockedRun).not.toHaveBeenCalled();
  });
});

describe('mixAudio / resizePad (mocked exec)', () => {
  it('forwards argv to the binary path without shell interpolation', async () => {
    await mixAudio('/v.mp4', undefined, undefined, '/o.mp4', 5);
    const [bin, args] = mockedRun.mock.calls[0];
    expect(bin).toBe('/usr/bin/ffmpeg');
    expect(Array.isArray(args)).toBe(true);
    expect(args.join(' ')).not.toContain(';');
  });

  it('resizePad passes the target dimensions through', async () => {
    await resizePad('/v.mp4', 1080, 1920, '/o.mp4');
    const [, args] = mockedRun.mock.calls[0];
    expect(args.join(' ')).toContain('1080:1920');
  });
});

describe('schema compatibility', () => {
  it('accepts a valid timeline', () => {
    const parsed = TimelineSchema.safeParse({
      clips: [{ id: 'c1', sceneId: 's1', startSec: 0, endSec: 3, label: 'Scene 1' }],
      totalDurationSec: 3,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an invalid timeline clip', () => {
    const parsed = TimelineSchema.safeParse({
      clips: [{ id: 'c1', sceneId: 's1', startSec: 5, endSec: 2, label: 'x' }],
      totalDurationSec: -1,
    });
    expect(parsed.success).toBe(false);
  });

  it('ProjectDataSchema stays backward-compatible with the new exports key (passthrough)', () => {
    const parsed = ProjectDataSchema.safeParse({
      assets: [
        {
          id: 'a1',
          type: 'image',
          path: 'a1_hero.png',
          createdAt: new Date().toISOString(),
        },
      ],
      exports: [
        { id: 'e1', timestamp: new Date().toISOString(), type: 'mp4', path: 'p/exports/f.mp4' },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.assets).toHaveLength(1);
      // exports is stripped by the Phase-2 schema but must not break parsing
      expect((parsed.data as Record<string, unknown>).exports).toBeUndefined();
    }
  });
});
