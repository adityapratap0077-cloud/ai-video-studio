/**
 * /api/projects/[id]/timeline
 *   GET  — { timeline, scenes } (timeline may be null until saved)
 *   PUT  — save timeline (validated against the shared TimelineSchema)
 *   POST — assemble: runs the FFmpeg pipeline, records export history
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorJson, serializeProject } from '@/app/api/_lib';
import { TimelineSchema } from '@/lib/pipeline/schemas';
import { readProjectData, writeProjectData, assertSafeProjectId } from '@/lib/assets/store';
import { recordExport } from '@/lib/exports/history';
import { assembleProject, type AspectRatio } from '@/lib/video/ffmpeg';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Assembly can take a while (concat + mix + captions + resize). */
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

async function getProjectOr404(id: string) {
  try {
    assertSafeProjectId(id);
  } catch {
    return null;
  }
  return db.project.findUnique({ where: { id } });
}

/** GET /api/projects/[id]/timeline */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const project = await getProjectOr404(id);
  if (!project) return errorJson('Project not found.', 'PROJECT_NOT_FOUND', 404);
  const data = await readProjectData(id);
  return NextResponse.json({
    timeline: data.timeline ?? null,
    scenes: (data.storyboard as { scenes?: unknown[] } | undefined)?.scenes ?? [],
  });
}

/** PUT /api/projects/[id]/timeline — save the edit. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const project = await getProjectOr404(id);
  if (!project) return errorJson('Project not found.', 'PROJECT_NOT_FOUND', 404);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorJson('Invalid JSON body.', 'INVALID_JSON', 400);
  }
  const parsed = TimelineSchema.safeParse(raw);
  if (!parsed.success) {
    return errorJson(
      `Invalid timeline: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}`,
      'INVALID_TIMELINE',
      400,
    );
  }

  const data = await readProjectData(id);
  data.timeline = parsed.data;
  await writeProjectData(id, data);
  return NextResponse.json({ timeline: parsed.data });
}

/** POST /api/projects/[id]/timeline — run the FFmpeg assembly. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const project = await getProjectOr404(id);
  if (!project) return errorJson('Project not found.', 'PROJECT_NOT_FOUND', 404);

  let aspectRatio: AspectRatio | undefined;
  try {
    const body = (await req.json()) as { aspectRatio?: unknown };
    if (
      body?.aspectRatio === '9:16' ||
      body?.aspectRatio === '16:9' ||
      body?.aspectRatio === '1:1'
    ) {
      aspectRatio = body.aspectRatio;
    }
  } catch {
    // No body — defaults apply.
  }

  try {
    const result = await assembleProject(id, { aspectRatio });
    const record = await recordExport(id, {
      type: 'mp4',
      path: result.path,
      label: `Final MP4 (${aspectRatio ?? '16:9'})`,
    });
    return NextResponse.json({
      export: record,
      durationSec: result.durationSec,
      project: serializeProject(
        (await db.project.findUnique({ where: { id } })) ?? project,
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Assembly failed.';
    return errorJson(message, 'ASSEMBLE_FAILED', 500);
  }
}
