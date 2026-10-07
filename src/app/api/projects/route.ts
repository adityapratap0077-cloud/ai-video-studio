import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorJson, serializeProject } from '../_lib';

export const runtime = 'nodejs';

const ProjectsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/projects — list projects, newest first. */
export async function GET(req: NextRequest) {
  const parsed = ProjectsQuery.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return errorJson('Invalid query parameters.', 'INVALID_QUERY', 400);
  }

  try {
    const projects = await db.project.findMany({
      orderBy: { updatedAt: 'desc' },
      take: parsed.data.limit,
    });
    return NextResponse.json({ projects: projects.map(serializeProject) });
  } catch {
    return errorJson('Failed to load projects.', 'PROJECTS_LIST_FAILED');
  }
}

const CreateProjectBody = z.object({
  name: z.string().min(1).max(200),
  idea: z.string().max(5000).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

/** POST /api/projects — create a project. */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorJson('Invalid JSON body.', 'INVALID_JSON', 400);
  }
  const parsed = CreateProjectBody.safeParse(raw);
  if (!parsed.success) {
    return errorJson(
      'Invalid request body: name is required.',
      'INVALID_BODY',
      400
    );
  }

  try {
    const project = await db.project.create({
      data: {
        name: parsed.data.name,
        idea: parsed.data.idea ?? '',
        settings: JSON.stringify(parsed.data.settings ?? {}),
      },
    });
    return NextResponse.json(
      { project: serializeProject(project) },
      { status: 201 }
    );
  } catch {
    return errorJson('Failed to create project.', 'PROJECT_CREATE_FAILED');
  }
}
