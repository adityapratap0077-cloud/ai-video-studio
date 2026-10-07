/**
 * Production package export: a self-contained ZIP with everything needed
 * to reproduce or hand off a project — no API keys, ever.
 *
 * Contents:
 *   project.json        safe project snapshot (settings + scrubbed data)
 *   script.txt          full voiceover script text
 *   storyboard.json     scenes
 *   prompts/            one .txt per shot prompt
 *   assets/             copies of every library asset on disk
 *   captions/           captions.vtt + captions.srt (when present)
 *   metadata.json       build info + provider *references* (ids/types/models
 *                       only — keys and key hints are stripped)
 *
 * The builder takes plain inputs (no DB access) so it is unit-testable;
 * route handlers collect the project row + masked provider list and pass
 * them in.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { vttToSrt } from '@/lib/video/subtitles';

export const APP_VERSION = 'ai-video-studio/0.1.0';

export interface PackageProjectMeta {
  id: string;
  name: string;
  idea: string;
  stage: string;
  settings: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderRef {
  providerId: string;
  type: string;
  model: string;
  hasKey: boolean;
}

export interface BuildPackageInput {
  projectId: string;
  project: PackageProjectMeta;
  /** Project.data JSON (plain object). */
  data: Record<string, unknown>;
  /** Absolute path to <ASSET_DIR>/<projectId>. */
  assetDir: string;
  /** Masked provider refs — must already be key-free. */
  providerRefs: ProviderRef[];
}

export interface BuildPackageResult {
  /** Absolute path of the written ZIP. */
  zipAbsPath: string;
  /** Path relative to ASSET_DIR, for export history. */
  zipRelPath: string;
  /** ZIP entry names, for tests and UI. */
  entries: string[];
  missingAssets: string[];
}

/* ------------------------------------------------------------------ */
/* Secret scrubbing                                                    */
/* ------------------------------------------------------------------ */

/** Normalized field names that must never appear in an export. */
const SECRET_FIELD_NAMES = new Set([
  'apikey',
  'apisecret',
  'secret',
  'clientsecret',
  'clientid',
  'password',
  'passwd',
  'token',
  'accesstoken',
  'refreshtoken',
  'credential',
  'credentials',
  'encryptedkey',
  'privatekey',
  'keyhint',
  'authorization',
]);

function normalizeFieldName(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function isSecretField(key: string): boolean {
  return SECRET_FIELD_NAMES.has(normalizeFieldName(key));
}

/**
 * Deep-clone `value`, dropping any object key that looks like a secret
 * field. Arrays and plain objects are walked; everything else is copied
 * as-is. Never throws — on circular refs the offending branch is dropped.
 */
export function stripSecretFields<T>(value: T, seen = new WeakSet()): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripSecretFields(v, seen)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    if (seen.has(value as object)) return undefined as unknown as T;
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretField(k)) continue;
      const cleaned = stripSecretFields(v, seen);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out as unknown as T;
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

interface LooseAsset {
  id: string;
  type: string;
  sceneId?: string;
  path: string;
  prompt?: string;
  provider?: string;
  createdAt: string;
}

interface LooseShot {
  id: string;
  sceneId: string;
  description: string;
  videoPrompt: string;
  negativePrompt?: string;
  camera: string;
  lens?: string;
  lighting: string;
  environment: string;
  subject: string;
  motion: string;
  durationSec: number;
  aspectRatio: string;
}

function shotFileText(shot: LooseShot): string {
  const lines = [
    `SHOT ${shot.id}  (scene ${shot.sceneId})`,
    `duration: ${shot.durationSec}s   aspect: ${shot.aspectRatio}`,
    `camera: ${shot.camera}${shot.lens ? ` / ${shot.lens}` : ''}`,
    `lighting: ${shot.lighting}`,
    `environment: ${shot.environment}`,
    `subject: ${shot.subject}`,
    `motion: ${shot.motion}`,
    '',
    'DESCRIPTION',
    shot.description,
    '',
    'VIDEO PROMPT',
    shot.videoPrompt,
  ];
  if (shot.negativePrompt) {
    lines.push('', 'NEGATIVE PROMPT', shot.negativePrompt);
  }
  return lines.join('\n') + '\n';
}

export async function buildProductionPackage(
  input: BuildPackageInput,
): Promise<BuildPackageResult> {
  const { projectId, project, data, assetDir, providerRefs } = input;
  const zip = new AdmZip();

  const scrubbedData = stripSecretFields(data);

  // 1. project.json — safe snapshot.
  const projectJson = JSON.stringify(
    {
      id: project.id,
      name: project.name,
      idea: project.idea,
      stage: project.stage,
      settings: stripSecretFields(project.settings),
      data: scrubbedData,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      exportedBy: APP_VERSION,
    },
    null,
    2,
  );
  zip.addFile('project.json', Buffer.from(projectJson, 'utf8'));

  // 2. script.txt
  const script = (data.script ?? {}) as { fullText?: string; hook?: string };
  const scriptText =
    typeof script.fullText === 'string' && script.fullText.trim().length > 0
      ? script.fullText
      : 'No script generated yet for this project.\n';
  zip.addFile('script.txt', Buffer.from(scriptText, 'utf8'));

  // 3. storyboard.json
  const storyboard = (data.storyboard ?? { scenes: [] }) as {
    scenes?: Array<{ id: string }>;
  };
  zip.addFile('storyboard.json', Buffer.from(JSON.stringify(storyboard, null, 2), 'utf8'));

  // 4. prompts/ — one file per shot.
  const shots = ((data.shots ?? {}) as { shots?: LooseShot[] }).shots ?? [];
  for (const shot of shots) {
    const safeId = String(shot.id).replace(/[^A-Za-z0-9_-]/g, '_');
    zip.addFile(`prompts/shot-${safeId}.txt`, Buffer.from(shotFileText(shot), 'utf8'));
  }

  // 5. assets/ — copies of files that exist on disk.
  const assets = (Array.isArray(data.assets) ? data.assets : []) as LooseAsset[];
  const missingAssets: string[] = [];
  for (const asset of assets) {
    const abs = path.resolve(assetDir, asset.path);
    // Containment: asset paths must stay inside the project dir.
    if (abs !== assetDir && !abs.startsWith(assetDir + path.sep)) {
      missingAssets.push(asset.path);
      continue;
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      missingAssets.push(asset.path);
      continue;
    }
    const safeBase = path.basename(asset.path).replace(/[^A-Za-z0-9._-]/g, '_');
    zip.addLocalFile(abs, 'assets', `${asset.id}_${safeBase}`);
  }

  // 6. captions/
  const timeline = (data.timeline ?? {}) as { captionsVtt?: string };
  if (typeof timeline.captionsVtt === 'string' && timeline.captionsVtt.trim()) {
    zip.addFile('captions/captions.vtt', Buffer.from(timeline.captionsVtt, 'utf8'));
    zip.addFile(
      'captions/captions.srt',
      Buffer.from(vttToSrt(timeline.captionsVtt), 'utf8'),
    );
  }

  // 7. metadata.json — whitelisted fields only, provider *references* only.
  const metadata = {
    app: APP_VERSION,
    exportedAt: new Date().toISOString(),
    projectId,
    projectName: project.name,
    stage: project.stage,
    aspectRatio:
      ((project.settings ?? {}) as { aspectRatio?: string }).aspectRatio ?? 'unknown',
    totalDurationSec:
      (timeline as { totalDurationSec?: number }).totalDurationSec ?? null,
    sceneCount: storyboard.scenes?.length ?? 0,
    shotCount: shots.length,
    assetCount: assets.length,
    missingAssets,
    providerRefs: providerRefs.map((p) => ({
      providerId: p.providerId,
      type: p.type,
      model: p.model,
      hasKey: p.hasKey,
    })),
    note: 'No API keys are stored in this package. Reconnect providers in the studio to regenerate.',
  };
  zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'));

  // Write the ZIP.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipName = `package-${stamp}.zip`;
  const exportsAbsDir = path.join(assetDir, 'exports');
  fs.mkdirSync(exportsAbsDir, { recursive: true });
  const zipAbsPath = path.join(exportsAbsDir, zipName);
  zip.writeZip(zipAbsPath);

  return {
    zipAbsPath,
    zipRelPath: `${projectId}/exports/${zipName}`,
    entries: zip.getEntries().map((e) => e.entryName),
    missingAssets,
  };
}
