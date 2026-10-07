/**
 * Asset storage: disk layout + Project.data.assets bookkeeping.
 *
 * Layout: <ASSET_DIR>/<projectId>/<file>            (uploaded/generated media)
 *         <ASSET_DIR>/<projectId>/exports/<file>    (finished renders, zips)
 *
 * Asset.path is always relative to the project's asset directory (e.g.
 * "a1b2c3_hero.png"), never absolute, so projects stay portable.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import type { Asset } from '@/lib/pipeline/schemas';

export type AssetType = 'image' | 'video' | 'audio' | 'caption';

/** Root directory for all project assets. Override with ASSET_DIR env. */
export function assetRoot(): string {
  return path.resolve(process.cwd(), process.env.ASSET_DIR ?? './data/assets');
}

/** Cuid-style ids only — blocks path traversal via the project id. */
export function assertSafeProjectId(projectId: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) {
    throw new Error(`Unsafe project id: ${JSON.stringify(projectId)}`);
  }
}

/** <ASSET_DIR>/<projectId>/ — created on demand. */
export function projectAssetDir(projectId: string): string {
  assertSafeProjectId(projectId);
  const dir = path.join(assetRoot(), projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** <ASSET_DIR>/<projectId>/exports/ — created on demand. */
export function exportsDir(projectId: string): string {
  const dir = path.join(projectAssetDir(projectId), 'exports');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolve a relative Asset.path to an absolute path, guaranteeing the
 * result stays inside the project's asset directory (throws on escape).
 */
export function resolveAssetPath(projectId: string, relPath: string): string {
  assertSafeProjectId(projectId);
  if (typeof relPath !== 'string' || relPath.length === 0 || relPath.length > 500) {
    throw new Error('Invalid asset path.');
  }
  const base = path.join(assetRoot(), projectId);
  const resolved = path.resolve(base, relPath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('Asset path escapes the project directory.');
  }
  return resolved;
}

/** Filename used for a stored asset: <uuid>_<sanitized-name>. */
export function storedFileName(originalName: string): string {
  const base = path.basename(originalName);
  const sanitized = base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'file';
  return `${randomUUID()}_${sanitized}`;
}

const EXT_TO_TYPE: Record<string, AssetType> = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.bmp': 'image',
  '.svg': 'image',
  '.mp4': 'video',
  '.mov': 'video',
  '.webm': 'video',
  '.mkv': 'video',
  '.m4v': 'video',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.m4a': 'audio',
  '.ogg': 'audio',
  '.flac': 'audio',
  '.aac': 'audio',
  '.vtt': 'caption',
  '.srt': 'caption',
};

/** Allowed upload extensions (blocklist-free allowlist). */
export const ALLOWED_EXTENSIONS = new Set(Object.keys(EXT_TO_TYPE));

export function detectAssetType(fileName: string): AssetType | null {
  return EXT_TO_TYPE[path.extname(fileName).toLowerCase()] ?? null;
}

/** Max single upload: 150 MB. */
export const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* Project.data JSON helpers                                           */
/* ------------------------------------------------------------------ */

export async function readProjectData(projectId: string): Promise<Record<string, unknown>> {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Project "${projectId}" not found.`);
  try {
    const parsed: unknown = JSON.parse(project.data);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function writeProjectData(
  projectId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await db.project.update({
    where: { id: projectId },
    data: { data: JSON.stringify(data) },
  });
}

/** Append an asset record to Project.data.assets. */
export async function addAssetRecord(projectId: string, asset: Asset): Promise<Asset> {
  const data = await readProjectData(projectId);
  const assets = Array.isArray(data.assets) ? (data.assets as Asset[]) : [];
  assets.push(asset);
  data.assets = assets;
  await writeProjectData(projectId, data);
  return asset;
}

/**
 * Remove an asset record and delete its file (best effort on the file).
 * Returns the removed record, or null when the id was unknown.
 */
export async function removeAssetRecord(
  projectId: string,
  assetId: string,
): Promise<Asset | null> {
  const data = await readProjectData(projectId);
  const assets = Array.isArray(data.assets) ? (data.assets as Asset[]) : [];
  const idx = assets.findIndex((a) => a.id === assetId);
  if (idx === -1) return null;
  const [removed] = assets.splice(idx, 1);
  data.assets = assets;
  await writeProjectData(projectId, data);

  try {
    const abs = resolveAssetPath(projectId, removed.path);
    await fs.promises.unlink(abs);
  } catch {
    // File already gone or path invalid — the DB record is the source of truth.
  }
  return removed;
}

/** List assets from Project.data.assets, optionally filtered. */
export async function listAssetRecords(
  projectId: string,
  filter: { type?: string; sceneId?: string } = {},
): Promise<Asset[]> {
  const data = await readProjectData(projectId);
  const assets = Array.isArray(data.assets) ? (data.assets as Asset[]) : [];
  return assets.filter(
    (a) =>
      (!filter.type || a.type === filter.type) &&
      (!filter.sceneId || a.sceneId === filter.sceneId),
  );
}

