/**
 * DELETE /api/projects/[id]/assets/[assetId]
 * Removes the DB record and deletes the file (best effort).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorJson } from '@/app/api/_lib';
import { assertSafeProjectId, removeAssetRecord } from '@/lib/assets/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
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

  try {
    const removed = await removeAssetRecord(id, assetId);
    if (!removed) {
      return errorJson('Asset not found.', 'ASSET_NOT_FOUND', 404);
    }
    return NextResponse.json({ ok: true, id: removed.id });
  } catch {
    return errorJson('Failed to delete asset.', 'ASSET_DELETE_FAILED');
  }
}
