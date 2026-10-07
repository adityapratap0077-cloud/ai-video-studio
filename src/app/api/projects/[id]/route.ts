import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorJson, serializeProject } from '../../_lib';

export const runtime = 'nodejs';

const UpdateProjectBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    idea: z.string().max(5000).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    stage: z.string().max(50).optional(),
    isDemo: z.boolean().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: 'No fields to update.',
  });

/** GET /api/projects/[id] */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const project = await db.project.findUnique({ where: { id } });
    if (!project) {
      return errorJson('Project not found.', 'PROJECT_NOT_FOUND', 404);
    }
    return NextResponse.json({ project: serializeProject(project) });
  } catch {
    return errorJson('Failed to load project.', 'PROJECT_GET_FAILED');
  }
}

/** PATCH /api/projects/[id] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorJson('Invalid JSON body.', 'INVALID_JSON', 400);
  }
  const parsed = UpdateProjectBody.safeParse(raw);
  if (!parsed.success) {
    return errorJson('Invalid request body.', 'INVALID_BODY', 400);
  }

  try {
    const existing = await db.project.findUnique({ where: { id } });
    if (!existing) {
      return errorJson('Project not found.', 'PROJECT_NOT_FOUND', 404);
    }

    const d = parsed.data;
    const project = await db.project.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.idea !== undefined ? { idea: d.idea } : {}),
        ...(d.settings !== undefined
          ? { settings: JSON.stringify(d.settings) }
          : {}),
        ...(d.stage !== undefined ? { stage: d.stage } : {}),
        ...(d.isDemo !== undefined ? { isDemo: d.isDemo } : {}),
        ...(d.data !== undefined ? { data: JSON.stringify(d.data) } : {}),
      },
    });
    return NextResponse.json({ project: serializeProject(project) });
  } catch {
    return errorJson('Failed to update project.', 'PROJECT_UPDATE_FAILED');
  }
}

/** DELETE /api/projects/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const existing = await db.project.findUnique({ where: { id } });
    if (!existing) {
      return errorJson('Project not found.', 'PROJECT_NOT_FOUND', 404);
    }
    await db.project.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return errorJson('Failed to delete project.', 'PROJECT_DELETE_FAILED');
  }
}
