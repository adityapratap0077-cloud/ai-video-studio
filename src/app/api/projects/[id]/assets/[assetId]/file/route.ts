/**
 * GET /api/projects/[id]/assets/[assetId]/file
 * Streams the raw asset file (thumbnails, audio players, video previews).
 * Paths are resolved with a containment check — never serves outside the
 * project's asset directory.
 */
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'node:fs';
import { db } from '@/lib/db';
import { errorJson } from '@/app/api/_lib';
import {
  assertSafeProjectId,
  listAssetRecords,
  resolveAssetPath,
} from '@/lib/assets/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.m4v': 'video/x-m4v',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.vtt': 'text/vtt',
  '.srt': 'text/plain',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await params;
  try {
    assertSafeProjectId(id);
  } catch {
    return errorJson('Invalid project id.', 'INVALID_PROJECT_ID', 400);
  }

  const project = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return errorJson('Project not found.', 'PROJECT_NOT_FOUND', 404);

  const assets = await listAssetRecords(id);
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) return errorJson('Asset not found.', 'ASSET_NOT_FOUND', 404);

  let abs: string;
  try {
    abs = resolveAssetPath(id, asset.path);
  } catch {
    return errorJson('Asset path is invalid.', 'ASSET_PATH_INVALID', 400);
  }

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(abs);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    return errorJson('Asset file is missing on disk.', 'ASSET_FILE_MISSING', 404);
  }

  const ext = `.${asset.path.split('.').pop()?.toLowerCase() ?? ''}`;
  const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';
  const download = req.nextUrl.searchParams.get('download') === '1';

  const stream = fs.createReadStream(abs);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(stat.size),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(
        asset.path.split('/').pop() ?? 'asset',
      )}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
