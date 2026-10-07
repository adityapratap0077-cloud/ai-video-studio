/**
 * GET /api/projects/[id]/exports/download
 *
 *   ?kind=script       full voiceover script as .txt (works with no TTS)
 *   ?kind=storyboard   storyboard JSON
 *   ?kind=vtt          captions as WebVTT
 *   ?kind=srt          captions as SRT
 *   ?kind=file&id=<>   a file from export history (MP4, package ZIP)
 *
 * History files are resolved with a containment check under ASSET_DIR —
 * the `id` must match a stored export record; raw paths are never trusted.
 */
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorJson } from '@/app/api/_lib';
import { assetRoot, assertSafeProjectId, readProjectData } from '@/lib/assets/store';
import { listExports } from '@/lib/exports/history';
import { vttToSrt } from '@/lib/video/subtitles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  kind: z.enum(['script', 'storyboard', 'vtt', 'srt', 'file']),
  id: z.string().max(100).optional(),
});

function downloadFile(name: string, content: string, mime: string): NextResponse {
  return new NextResponse(content, {
    headers: {
      'Content-Type': `${mime}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}"`,
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return errorJson('Invalid query parameters.', 'INVALID_QUERY', 400);
  }
  try {
    assertSafeProjectId(id);
  } catch {
    return errorJson('Invalid project id.', 'INVALID_PROJECT_ID', 400);
  }

  const project = await db.project.findUnique({ where: { id } });
  if (!project) return errorJson('Project not found.', 'PROJECT_NOT_FOUND', 404);

  const { kind } = parsed.data;
  const data = await readProjectData(id);
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';

  if (kind === 'script') {
    const script = (data.script ?? {}) as { fullText?: string };
    const text =
      typeof script.fullText === 'string' && script.fullText.trim()
        ? script.fullText
        : 'No script generated yet for this project.\n';
    return downloadFile(`${slug}-script.txt`, text, 'text/plain');
  }

  if (kind === 'storyboard') {
    const storyboard = data.storyboard ?? { scenes: [] };
    return downloadFile(`${slug}-storyboard.json`, JSON.stringify(storyboard, null, 2), 'application/json');
  }

  if (kind === 'vtt' || kind === 'srt') {
    const vtt = ((data.timeline ?? {}) as { captionsVtt?: string }).captionsVtt;
    if (!vtt || !vtt.trim()) {
      return errorJson('No captions on the timeline yet.', 'NO_CAPTIONS', 404);
    }
    const content = kind === 'srt' ? vttToSrt(vtt) : vtt;
    return downloadFile(`${slug}-captions.${kind}`, content, 'text/plain');
  }

  // kind === 'file': serve a file referenced by an export-history record.
  const exportId = parsed.data.id;
  if (!exportId) {
    return errorJson('Missing export id.', 'MISSING_EXPORT_ID', 400);
  }
  const records = await listExports(id);
  const record = records.find((r) => r.id === exportId);
  if (!record) {
    return errorJson('Export not found.', 'EXPORT_NOT_FOUND', 404);
  }
  const root = assetRoot();
  const abs = path.resolve(root, record.path);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    return errorJson('Export path is invalid.', 'EXPORT_PATH_INVALID', 400);
  }
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(abs);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    return errorJson('Export file is missing on disk.', 'EXPORT_FILE_MISSING', 404);
  }

  const isZip = record.type === 'package';
  const fileName = isZip ? `${slug}-package.zip` : `${slug}-final.mp4`;
  const stream = fs.createReadStream(abs);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': isZip ? 'application/zip' : 'video/mp4',
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
