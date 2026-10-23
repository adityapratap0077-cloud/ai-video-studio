import { cookies } from "next/headers";
import { Suspense } from "react";
import { mockListProjects } from "@/lib/mock";
import type {
  Project,
  ProjectSettings,
  ProjectStage,
} from "@/lib/types";
import { ProjectsClient, SkeletonCards } from "./ProjectsClient";

export const dynamic = "force-dynamic";

type ProjectsSearchParams = Promise<{
  demo?: string | string[];
}>;

function parseSettings(value: string): ProjectSettings | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as ProjectSettings;
    }
  } catch {
    // Bad settings JSON falls back to no settings, matching the API serializer.
  }
  return undefined;
}

async function loadInitialProjects(
  demo: boolean,
): Promise<{ projects: Project[]; mock: boolean }> {
  try {
    // Loaded lazily so a database/import failure can still fall back to the
    // same local sample data the client-side API helper uses.
    const { db } = await import("@/lib/db");
    const rows = await db.project.findMany({
      orderBy: { updatedAt: "desc" },
    });

    return {
      projects: rows.map((row) => ({
        id: row.id,
        name: row.name,
        idea: row.idea,
        stage: row.stage as ProjectStage,
        isDemo: row.isDemo,
        updatedAt: row.updatedAt.toISOString(),
        settings: parseSettings(row.settings),
      })),
      mock: false,
    };
  } catch {
    return { projects: mockListProjects(demo), mock: true };
  }
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: ProjectsSearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const demoParam = Array.isArray(params.demo) ? params.demo[0] : params.demo;
  const cookieStore = await cookies();
  const demo =
    demoParam === "1" || cookieStore.get("avs_demo")?.value === "1";
  const { projects, mock } = await loadInitialProjects(demo);

  return (
    <Suspense fallback={<SkeletonCards />}>
      <ProjectsClient initialProjects={projects} initialMock={mock} />
    </Suspense>
  );
}
