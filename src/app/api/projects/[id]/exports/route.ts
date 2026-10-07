/**
 * /api/projects/[id]/exports
 *   GET  — export history from Project.data.exports
 *   POST — { type: "package" } builds the production ZIP, records history
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorJson, safeParseJsonObject, serializeProject } from '@/app/api/_lib';
import { assertSafeProjectId, projectAssetDir, readProjectData } from '@/lib/assets/store';
import { listExports, recordExport } from '@/lib/exports/history';
import { buildProductionPackage } from '@/lib/exports/package';
import { getProviderStatusList } from '@/lib/providers/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const PostBody = z.object({
  type: z.enum(['package']),
});

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/exports */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    assertSafeProjectId(id);
  } catch {
    return errorJson('Invalid project id.', 'INVALID_PROJECT_ID', 400);
  }
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return errorJson('Project not found.', 'PROJECT_NOT_FOUND', 404);

  const exports = await listExports(id);
  const data = await readProjectData(id);
  return NextResponse.json({
    exports,
    available: {
      script: Boolean(
        (data.script as { fullText?: string } | undefined)?.fullText,
      ),
      storyboard: Boolean(
        (data.storyboard as { scenes?: unknown[] } | undefined)?.scenes?.length,
      ),
      captions: Boolean(
        (data.timeline as { captionsVtt?: string } | undefined)?.captionsVtt?.trim(),
      ),
    },
  });
}

/** POST /api/projects/[id]/exports — build the production package ZIP. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    assertSafeProjectId(id);
  } catch {
    return errorJson('Invalid project id.', 'INVALID_PROJECT_ID', 400);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorJson('Invalid JSON body.', 'INVALID_JSON', 400);
  }
  const parsed = PostBody.safeParse(raw);
  if (!parsed.success) {
    return errorJson('Invalid request body.', 'INVALID_BODY', 400);
  }

  const project = await db.project.findUnique({ where: { id } });
  if (!project) return errorJson('Project not found.', 'PROJECT_NOT_FOUND', 404);

  try {
    const serialized = serializeProject(project);
    const data = safeParseJsonObject(project.data);

    // Masked provider refs — keys never leave the server.
    const providerRows = await getProviderStatusList();
    const providerRefs = providerRows.map((p) => ({
      providerId: p.providerId,
      type: p.type,
      model: p.model,
      hasKey: p.hasKey,
    }));

    const built = await buildProductionPackage({
      projectId: id,
      project: {
        id: serialized.id,
        name: serialized.name,
        idea: serialized.idea,
        stage: serialized.stage,
        settings: serialized.settings,
        createdAt: serialized.createdAt.toISOString(),
        updatedAt: serialized.updatedAt.toISOString(),
      },
      data,
      assetDir: projectAssetDir(id),
      providerRefs,
    });

    const record = await recordExport(id, {
      type: 'package',
      path: built.zipRelPath,
      label: 'Production package (ZIP)',
    });

    return NextResponse.json({
      export: record,
      entries: built.entries,
      missingAssets: built.missingAssets,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Package build failed.';
    return errorJson(message, 'PACKAGE_FAILED', 500);
  }
}
