/**
 * /api/projects/[id]/assets
 *   GET  — list assets (optional ?type= ?sceneId= filters)
 *   POST — multipart upload (file, sceneId?, prompt?); stores under
 *          <ASSET_DIR>/<projectId>/ and registers in Project.data.assets
 */
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorJson } from '@/app/api/_lib';
import {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  addAssetRecord,
  assertSafeProjectId,
  detectAssetType,
  listAssetRecords,
  projectAssetDir,
  storedFileName,
} from '@/lib/assets/store';
import type { Asset } from '@/lib/pipeline/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  type: z.enum(['image', 'video', 'audio', 'caption']).optional(),
  sceneId: z.string().max(200).optional(),
});

/** GET /api/projects/[id]/assets?type=&sceneId= */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = ListQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return errorJson('Invalid query parameters.', 'INVALID_QUERY', 400);
  }
  try {
    assertSafeProjectId(id);
    const exists = await db.project.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) return errorJson('Project not found.', 'PROJECT_NOT_FOUND', 404);
    const assets = await listAssetRecords(id, parsed.data);
    return NextResponse.json({ assets });
  } catch {
    return errorJson('Failed to list assets.', 'ASSETS_LIST_FAILED');
  }
}

/** POST /api/projects/[id]/assets — multipart/form-data upload. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    assertSafeProjectId(id);
  } catch {
    return errorJson('Invalid project id.', 'INVALID_PROJECT_ID', 400);
  }

  const project = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return errorJson('Project not found.', 'PROJECT_NOT_FOUND', 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson('Expected multipart/form-data.', 'INVALID_FORM', 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return errorJson('Missing "file" field.', 'MISSING_FILE', 400);
  }
  if (file.size === 0) {
    return errorJson('Uploaded file is empty.', 'EMPTY_FILE', 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return errorJson(
      `File too large (${Math.round(file.size / 1024 / 1024)} MB). Max 150 MB.`,
      'FILE_TOO_LARGE',
      413,
    );
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return errorJson(
      `Extension "${ext}" is not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
      'UNSUPPORTED_TYPE',
      415,
    );
  }
  const type = detectAssetType(file.name);
  if (!type) {
    return errorJson('Could not determine asset type.', 'UNKNOWN_TYPE', 415);
  }

  const sceneIdRaw = form.get('sceneId');
  const sceneId = typeof sceneIdRaw === 'string' && sceneIdRaw.trim() ? sceneIdRaw.trim().slice(0, 200) : undefined;
  const promptRaw = form.get('prompt');
  const prompt = typeof promptRaw === 'string' && promptRaw.trim() ? promptRaw.trim().slice(0, 5000) : undefined;

  try {
    const dir = projectAssetDir(id);
    const name = storedFileName(file.name);
    const absPath = path.join(dir, name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.promises.writeFile(absPath, buffer);

    const asset: Asset = {
      id: randomUUID(),
      type,
      ...(sceneId ? { sceneId } : {}),
      path: name,
      ...(prompt ? { prompt } : {}),
      provider: 'upload',
      createdAt: new Date().toISOString(),
    };
    await addAssetRecord(id, asset);
    return NextResponse.json({ asset }, { status: 201 });
  } catch {
    return errorJson('Failed to store asset.', 'ASSET_SAVE_FAILED');
  }
}
