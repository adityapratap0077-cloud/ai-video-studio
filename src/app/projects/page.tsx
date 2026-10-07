"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { DemoBanner, DemoPill } from "@/components/DemoBanner";
import { listProjects } from "@/lib/api";
import { useDemoMode } from "@/lib/demo";
import { stageLabel, type Project } from "@/lib/types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function SkeletonCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-md border border-line bg-panel"
        />
      ))}
    </div>
  );
}

function ProjectsInner() {
  const { demo } = useDemoMode();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [mock, setMock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setProjects(null);
    try {
      const res = await listProjects(demo);
      setProjects(res.data);
      setMock(res.mock);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects.");
    }
  }, [demo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
            Library
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text">
            Projects
          </h1>
          {projects && (
            <p className="mt-1 font-mono text-[12px] text-faint">
              {projects.length} {projects.length === 1 ? "project" : "projects"}
              {demo ? " · demo filter on" : ""}
            </p>
          )}
        </div>
        <Link
          href="/create"
          className="inline-flex items-center gap-2 rounded-md bg-rec px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#c93a40]"
        >
          <span aria-hidden="true" className="text-base leading-none">
            +
          </span>
          New Project
        </Link>
      </div>

      {demo && (
        <div className="mt-5">
          <DemoBanner detail="Demo mode is on — sample projects are included below. Your own projects appear here too." />
        </div>
      )}

      {mock && projects && projects.length > 0 && (
        <p
          className="mt-4 rounded border border-line bg-panel px-3 py-2 font-mono text-[11px] text-faint"
          role="note"
        >
          sample data — the projects API is not connected yet
        </p>
      )}

      <div className="mt-6">
        {error && (
          <div className="rounded-md border border-rec/40 bg-rec/[0.07] px-4 py-5">
            <p className="text-sm font-medium text-text">
              Could not load projects
            </p>
            <p className="mt-1 text-sm text-dim">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 rounded-md border border-line bg-raise px-3 py-1.5 text-sm text-text hover:border-dim"
            >
              Retry
            </button>
          </div>
        )}

        {!error && projects === null && <SkeletonCards />}

        {!error && projects !== null && projects.length === 0 && (
          <div className="rounded-md border border-line bg-panel px-6 py-14 text-center">
            <p className="text-lg font-medium text-text">No projects yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-dim">
              {demo
                ? "Demo mode is on but no sample projects came back. Create one to see the pipeline in action."
                : "Start with an idea — the studio walks it through research, script, storyboard and all the way to export."}
            </p>
            <Link
              href="/create"
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-rec px-4 py-2.5 text-sm font-medium text-white hover:bg-[#c93a40]"
            >
              Create your first project
            </Link>
          </div>
        )}

        {!error && projects !== null && projects.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="group flex h-full flex-col rounded-md border border-line bg-panel p-5 transition-colors hover:border-dim/60 hover:bg-raise/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-[17px] font-semibold tracking-tight text-text group-hover:text-white">
                      {project.name}
                    </h2>
                    {project.isDemo && <DemoPill />}
                  </div>
                  <p className="clamp-2 mt-2 text-sm leading-relaxed text-dim">
                    {project.idea}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-5">
                    <span className="rounded border border-line bg-ink px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-dim">
                      {stageLabel(project.stage)}
                    </span>
                    <span className="font-mono text-[11px] text-faint">
                      {formatDate(project.updatedAt)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<SkeletonCards />}>
      <ProjectsInner />
    </Suspense>
  );
}
