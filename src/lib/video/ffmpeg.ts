/**
 * FFmpeg video assembly pipeline (Phase 3).
 *
 * Every ffmpeg invocation goes through runProcess (execFile, argument
 * array — no shell), with a 120s timeout per call. Pure argument-builder
 * functions are exported separately so tests can assert on the exact
 * argv without spawning a process.
 *
 * Pipeline stages (orchestrated by assembleProject):
 *   concat -> audio mix -> caption burn-in -> resize/pad -> final MP4
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runProcess } from './exec';
import {
  escapeConcatPath,
  escapeDrawtext,
  escapeFilterPath,
  toDurationSec,
  vttToSrt,
} from './subtitles';
import { exportsDir, projectAssetDir, resolveAssetPath } from '@/lib/assets/store';
import { db } from '@/lib/db';

export const FFMPEG_BIN = '/usr/bin/ffmpeg';
export const FFMPEG_TIMEOUT_MS = 120_000;

/** Font available on this box for drawtext / subtitles. */
const DRAWTEXT_FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

export type AspectRatio = '9:16' | '16:9' | '1:1';

export const ASPECT_DIMS: Record<AspectRatio, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '1:1': { w: 1080, h: 1080 },
};

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

export type SegmentKind = 'video' | 'image' | 'placeholder';

/** One timeline clip to place on the video track. */
export interface ClipInput {
  /** Absolute path to the media file. Omit for a generated placeholder. */
  path?: string;
  durationSec: number;
  /** Burned into placeholder clips when no media exists. */
  label: string;
}

export function detectSegmentKind(filePath: string | undefined): SegmentKind {
  if (!filePath) return 'placeholder';
  const ext = path.extname(filePath).toLowerCase();
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (IMAGE_EXTS.has(ext)) return 'image';
  return 'placeholder';
}

function fmtDuration(sec: number): string {
  return toDurationSec(sec).toFixed(3);
}

/* ------------------------------------------------------------------ */
/* Argument builders (pure — safe to unit test)                        */
/* ------------------------------------------------------------------ */

/** Solid-color clip with the scene label burned in (fallback per clip). */
export function buildPlaceholderArgs(
  label: string,
  durationSec: number,
  w: number,
  h: number,
  outPath: string,
): string[] {
  const dur = fmtDuration(durationSec);
  return [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=0x131317:s=${w}x${h}:d=${dur}:r=30`,
    '-vf',
    `drawtext=fontfile=${escapeFilterPath(DRAWTEXT_FONT)}:text='${escapeDrawtext(label)}':fontsize=64:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2,format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-t',
    dur,
    outPath,
  ];
}

/**
 * Conform one media file to a fixed-size segment: scale+pad to WxH,
 * 30fps, yuv420p, x264, no audio (audio is mixed in a later stage).
 */
export function buildSegmentArgs(
  inputPath: string,
  kind: Exclude<SegmentKind, 'placeholder'>,
  durationSec: number,
  w: number,
  h: number,
  outPath: string,
): string[] {
  const dur = fmtDuration(durationSec);
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p`;
  const args: string[] = ['-y'];
  if (kind === 'image') {
    args.push('-loop', '1', '-framerate', '30');
  }
  args.push(
    '-i',
    inputPath,
    '-vf',
    vf,
    '-t',
    dur,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-an',
    outPath,
  );
  return args;
}

/** Concat demuxer: joins pre-conformed same-codec segments losslessly. */
export function buildConcatArgs(listPath: string, outPath: string): string[] {
  return ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath];
}

/**
 * Mix voiceover + music onto the video track.
 * Both present: music is ducked under the voiceover with sidechaincompress.
 * One present: it is laid under the video. None: video is copied untouched.
 */
export function buildMixAudioArgs(
  videoPath: string,
  voiceoverPath: string | undefined,
  musicPath: string | undefined,
  totalDurationSec: number,
  outPath: string,
): string[] {
  if (!voiceoverPath && !musicPath) {
    return ['-y', '-i', videoPath, '-c', 'copy', outPath];
  }

  if (voiceoverPath && !musicPath) {
    return [
      '-y',
      '-i',
      videoPath,
      '-i',
      voiceoverPath,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      outPath,
    ];
  }

  if (musicPath && !voiceoverPath) {
    return [
      '-y',
      '-i',
      videoPath,
      '-i',
      musicPath,
      '-filter_complex',
      '[1:a]volume=0.35[a]',
      '-map',
      '0:v:0',
      '-map',
      '[a]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      outPath,
    ];
  }

  // Both: duck the music under the voiceover.
  const dur = fmtDuration(totalDurationSec);
  return [
    '-y',
    '-i',
    videoPath,
    '-i',
    voiceoverPath as string,
    '-i',
    musicPath as string,
    '-filter_complex',
    `[2:a]volume=0.25,apad=whole_dur=${dur}[mu];` +
      `[1:a]apad=whole_dur=${dur}[vo];` +
      `[mu][vo]sidechaincompress=threshold=0.04:ratio=12:attack=15:release=500[duck];` +
      `[vo][duck]amix=inputs=2:duration=first:normalize=0[a]`,
    '-map',
    '0:v:0',
    '-map',
    '[a]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    outPath,
  ];
}

/** Burn captions in with the subtitles filter (needs an SRT file). */
export function buildBurnCaptionsArgs(
  videoPath: string,
  srtPath: string,
  outPath: string,
): string[] {
  const sub =
    `subtitles=filename='${escapeFilterPath(srtPath)}'` +
    `:force_style='FontName=DejaVu Sans,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=64'`;
  return [
    '-y',
    '-i',
    videoPath,
    '-vf',
    sub,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-c:a',
    'copy',
    outPath,
  ];
}

/** Scale + pad to the exact target aspect (no stretching). */
export function buildResizePadArgs(
  inputPath: string,
  w: number,
  h: number,
  outPath: string,
): string[] {
  return [
    '-y',
    '-i',
    inputPath,
    '-vf',
    `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-c:a',
    'copy',
    outPath,
  ];
}

/* ------------------------------------------------------------------ */
/* Stage runners (spawn ffmpeg)                                        */
/* ------------------------------------------------------------------ */

export interface StageOptions {
  tmpDir?: string;
  timeoutMs?: number;
  w?: number;
  h?: number;
}

async function runFfmpeg(args: string[], timeoutMs?: number): Promise<void> {
  await runProcess(FFMPEG_BIN, args, { timeoutMs: timeoutMs ?? FFMPEG_TIMEOUT_MS });
}

/**
 * Build one MP4 from scene clips. Scenes with no video asset get a
 * solid-color placeholder clip with the scene label burned in, so
 * assembly always succeeds even with an empty library.
 */
export async function concatClips(
  clips: ClipInput[],
  outPath: string,
  opts: StageOptions = {},
): Promise<string> {
  if (clips.length === 0) {
    throw new Error('concatClips: no clips to assemble.');
  }
  const w = opts.w ?? 1920;
  const h = opts.h ?? 1080;
  const timeoutMs = opts.timeoutMs ?? FFMPEG_TIMEOUT_MS;
  const tmpDir = await fs.promises.mkdtemp(
    path.join(opts.tmpDir ?? os.tmpdir(), 'avs-concat-'),
  );

  try {
    const segmentPaths: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const segPath = path.join(tmpDir, `seg-${String(i).padStart(3, '0')}.mp4`);
      const kind = detectSegmentKind(clip.path);
      if (kind === 'placeholder') {
        await runFfmpeg(
          buildPlaceholderArgs(clip.label, clip.durationSec, w, h, segPath),
          timeoutMs,
        );
      } else {
        // path is defined when kind is video|image
        await runFfmpeg(
          buildSegmentArgs(clip.path as string, kind, clip.durationSec, w, h, segPath),
          timeoutMs,
        );
      }
      segmentPaths.push(segPath);
    }

    const listPath = path.join(tmpDir, 'concat.txt');
    await fs.promises.writeFile(
      listPath,
      segmentPaths.map((p) => `file '${escapeConcatPath(p)}'`).join('\n') + '\n',
      'utf8',
    );
    await runFfmpeg(buildConcatArgs(listPath, outPath), timeoutMs);
    return outPath;
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

/** Lay voiceover and/or music under the video; duck music when both. */
export async function mixAudio(
  videoPath: string,
  voiceoverPath: string | undefined,
  musicPath: string | undefined,
  outPath: string,
  totalDurationSec: number,
  opts: StageOptions = {},
): Promise<string> {
  await runFfmpeg(
    buildMixAudioArgs(videoPath, voiceoverPath, musicPath, totalDurationSec, outPath),
    opts.timeoutMs,
  );
  return outPath;
}

/** Convert VTT to SRT, then burn captions into the video. */
export async function burnCaptions(
  videoPath: string,
  vttContent: string,
  outPath: string,
  opts: StageOptions = {},
): Promise<string> {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(opts.tmpDir ?? os.tmpdir(), 'avs-caps-'),
  );
  try {
    const srtPath = path.join(tmpDir, 'captions.srt');
    await fs.promises.writeFile(srtPath, vttToSrt(vttContent), 'utf8');
    await runFfmpeg(buildBurnCaptionsArgs(videoPath, srtPath, outPath), opts.timeoutMs);
    return outPath;
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

/** Scale + pad to the target aspect ratio. */
export async function resizePad(
  inputPath: string,
  w: number,
  h: number,
  outPath: string,
  opts: StageOptions = {},
): Promise<string> {
  await runFfmpeg(buildResizePadArgs(inputPath, w, h, outPath), opts.timeoutMs);
  return outPath;
}

/* ------------------------------------------------------------------ */
/* Orchestrator                                                        */
/* ------------------------------------------------------------------ */

export interface AssembleOptions extends StageOptions {
  aspectRatio?: AspectRatio;
}

/** Result of a full assembly. `path` is relative to ASSET_DIR. */
export interface AssembleResult {
  /** Relative path under ASSET_DIR, e.g. "<projectId>/exports/final-<ts>.mp4". */
  path: string;
  durationSec: number;
}

interface LooseData {
  storyboard?: { scenes?: Array<{ id: string; index: number; startSec: number; endSec: number; narration?: string }> };
  timeline?: {
    clips?: Array<{ id: string; sceneId: string; startSec: number; endSec: number; assetPath?: string; label: string }>;
    voiceoverPath?: string;
    musicPath?: string;
    captionsVtt?: string;
    totalDurationSec?: number;
  };
}

/** Validate a project id before it touches the filesystem. */
function assertSafeProjectId(projectId: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) {
    throw new Error('assembleProject: invalid project id.');
  }
}

/**
 * Full assembly: concat -> audio mix -> captions -> resize -> final MP4
 * in <ASSET_DIR>/<projectId>/exports/. Reads scenes/timeline from
 * Project.data, resolves asset paths with containment checks.
 */
export async function assembleProject(
  projectId: string,
  opts: AssembleOptions = {},
): Promise<AssembleResult> {
  assertSafeProjectId(projectId);

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new Error(`assembleProject: project "${projectId}" not found.`);
  }

  let data: LooseData = {};
  try {
    data = JSON.parse(project.data) as LooseData;
  } catch {
    throw new Error('assembleProject: project data is not valid JSON.');
  }

  const scenes = data.storyboard?.scenes ?? [];
  const timeline = data.timeline;
  const timelineClipsEarly = timeline?.clips ?? [];

  if (scenes.length === 0 && timelineClipsEarly.length === 0) {
    throw new Error(
      'assembleProject: nothing to assemble — no storyboard scenes or timeline clips.',
    );
  }

  const aspect: AspectRatio = opts.aspectRatio ?? '16:9';
  const { w, h } = ASPECT_DIMS[aspect];
  const timeoutMs = opts.timeoutMs ?? FFMPEG_TIMEOUT_MS;

  // Prefer timeline clips (they carry asset assignments); fall back to scenes.
  const timelineClips = timelineClipsEarly;
  const clips: ClipInput[] =
    timelineClips.length > 0
      ? timelineClips.map((c) => ({
          path: c.assetPath
            ? resolveAssetPath(projectId, c.assetPath)
            : undefined,
          durationSec: Math.max(0.5, c.endSec - c.startSec),
          label: c.label || `Scene ${c.sceneId}`,
        }))
      : scenes.map((s, i) => ({
          path: undefined,
          durationSec: Math.max(0.5, s.endSec - s.startSec),
          label: `Scene ${i + 1}`,
        }));

  const totalDurationSec = clips.reduce((sum, c) => sum + c.durationSec, 0);

  const voiceoverPath = timeline?.voiceoverPath
    ? resolveAssetPath(projectId, timeline.voiceoverPath)
    : undefined;
  const musicPath = timeline?.musicPath
    ? resolveAssetPath(projectId, timeline.musicPath)
    : undefined;

  const outDir = exportsDir(projectId); // ensures the directory exists
  void outDir;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const relPath = `${projectId}/exports/final-${stamp}.mp4`;
  const finalPath = path.join(projectAssetDir(projectId), 'exports', `final-${stamp}.mp4`);

  const workDir = await fs.promises.mkdtemp(
    path.join(opts.tmpDir ?? os.tmpdir(), 'avs-assemble-'),
  );

  try {
    const stage = (name: string) => path.join(workDir, `${name}.mp4`);

    // 1. Concat scene clips (placeholders where no media is assigned).
    await concatClips(clips, stage('concat'), { tmpDir: workDir, timeoutMs, w, h });

    // 2. Mix voiceover / music.
    let current = stage('concat');
    if (voiceoverPath || musicPath) {
      await mixAudio(current, voiceoverPath, musicPath, stage('mixed'), totalDurationSec, {
        timeoutMs,
      });
      current = stage('mixed');
    }

    // 3. Burn captions.
    if (timeline?.captionsVtt && timeline.captionsVtt.trim().length > 0) {
      await burnCaptions(current, timeline.captionsVtt, stage('captioned'), { timeoutMs });
      current = stage('captioned');
    }

    // 4. Resize/pad to target aspect -> final.
    await resizePad(current, w, h, finalPath, { timeoutMs });

    return { path: relPath, durationSec: totalDurationSec };
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
}

// Re-exported for convenience by route handlers.
