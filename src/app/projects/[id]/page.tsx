"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { DemoBanner } from "@/components/DemoBanner";
import { StageStepper } from "@/components/StageStepper";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { PipelineErrorCard } from "@/components/pipeline/PipelineErrorCard";
import { deleteProject, getProject } from "@/lib/api";
import { useDemoMode } from "@/lib/demo";
import {
  getPipelineState,
  type PipelineActionError,
  type PipelineSnapshot,
} from "@/lib/pipeline/actions";
import { stageLabel, type Project } from "@/lib/types";

const PHASE3_PLACEHOLDERS: { title: string; copy: string }[] = [
  {
    title: "Assets",
    copy: "Generated images, clips, voiceovers and music — the raw material library.",
  },
  {
    title: "Timeline",
    copy: "The multi-track edit: assemble clips, captions and audio into a cut.",
  },
  {
    title: "Export",
    copy: "Render queue with format presets per platform, then download or publish.",
  },
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProjectDetail() {
  const params = useParams();
  const router = useRouter();
  const { demo } = useDemoMode();
  const rawId = params.id;
  const id = Array.isArray(rawId) ? rawId[0] : (rawId ?? "");

  const [project, setProject] = useState<Project | null>(null);
  const [mock, setMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [pipelineError, setPipelineError] =
    useState<PipelineActionError | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const res = await getProject(id);
      setProject(res.data);
      setMock(res.mock);
      if (!res.mock) {
        setPipelineLoading(true);
        try {
          const ps = await getPipelineState(id);
          if (ps.ok) {
            setSnapshot(ps.data.snapshot);
            setPipelineError(null);
          } else {
            setPipelineError(ps.error);
          }
        } catch {
          setPipelineError({
            code: "GENERATION_FAILED",
            message: "Could not load the pipeline state.",
            provider: "—",
            model: null,
            reason: "The server action did not respond.",
            suggestedAction: "Reload the page and try again.",
          });
        } finally {
          setPipelineLoading(false);
        }
      }
    } catch {
      setError("Project not found. It may have been deleted.");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect
    void load();
  }, [load]);

  const onDelete = useCallback(async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteProject(id);
      router.push("/projects");
    } catch {
      setDeleting(false);
      setConfirmingDelete(false);
      setError("Delete failed. The API is not reachable right now.");
    }
  }, [id, router]);

  if (error) {
    return (
      <div className="rounded-md border border-rec/40 bg-rec/[0.07] px-5 py-8 text-center">
        <p className="text-base font-medium text-text">{error}</p>
        <Link
          href="/projects"
          className="mt-4 inline-block rounded-md border border-line bg-raise px-4 py-2 text-sm text-text hover:border-dim"
        >
          Back to projects
        </Link>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="animate-pulse space-y-4" aria-hidden="true">
        <div className="h-8 w-64 rounded bg-panel" />
        <div className="h-20 rounded bg-panel" />
        <div className="h-64 rounded bg-panel" />
      </div>
    );
  }

  const settings = project.settings;
  const settingRows: [string, string][] = settings
    ? [
        ["Platform", settings.platform],
        ["Duration", settings.duration],
        ["Aspect ratio", settings.aspectRatio],
        ["Language", settings.language],
        ["Tone", settings.tone],
        ["Audience", settings.audience],
        ["Visual style", settings.visualStyle],
      ]
    : [];

  return (
    <div>
      <Link
        href="/projects"
        className="font-mono text-[12px] text-faint hover:text-dim"
      >
        ← Projects
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-text">
            {project.name}
          </h1>
          <p className="mt-1 font-mono text-[12px] text-faint">
            stage {stageLabel(project.stage)} · updated{" "}
            {formatDateTime(project.updatedAt)}
          </p>
        </div>
        {mock && (
          <p
            className="rounded border border-line bg-panel px-3 py-2 font-mono text-[11px] text-faint"
            role="note"
          >
            sample data — the projects API is not connected yet
          </p>
        )}
      </div>

      {(project.isDemo || demo) && (
        <div className="mt-5">
          <DemoBanner detail="This is a sample project so you can see the pipeline layout. Create your own from the Create page." />
        </div>
      )}

      <div className="mt-8">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-faint">
          Pipeline
        </h2>
        <div className="mt-3 rounded-md border border-line bg-panel px-4 pb-4 pt-5">
          <StageStepper current={project.stage} />
        </div>
      </div>

      <div className="mt-6">
        {mock ? (
          <div>
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-faint">
              Coming down the pipeline
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {PHASE3_PLACEHOLDERS.map((phase) => (
                <div
                  key={phase.title}
                  className="rounded-md border border-line/70 bg-panel/60 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-dim">{phase.title}</p>
                    <span className="font-mono text-[10px] uppercase tracking-wide text-faint">
                      Phase 3
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-faint">
                    {phase.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : pipelineLoading && !snapshot ? (
          <div className="animate-pulse space-y-4" aria-hidden="true">
            <div className="h-40 rounded bg-panel" />
            <div className="h-40 rounded bg-panel" />
          </div>
        ) : pipelineError && !snapshot ? (
          <PipelineErrorCard error={pipelineError} />
        ) : (
          snapshot && (
            <div className="space-y-6">
              <PipelineBoard
                projectId={project.id}
                idea={project.idea}
                initialSnapshot={snapshot}
              />
              <section className="rounded-md border border-line bg-panel p-5">
                <h2 className="font-mono text-[11px] uppercase tracking-widest text-faint">
                  Settings
                </h2>
                {settingRows.length > 0 ? (
                  <dl className="mt-3 grid gap-x-8 sm:grid-cols-2">
                    {settingRows.map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-baseline justify-between gap-4 border-b border-line/60 py-1.5"
                      >
                        <dt className="font-mono text-[12px] text-faint">{k}</dt>
                        <dd className="text-right text-sm text-text">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-dim">
                    No settings recorded for this project yet.
                  </p>
                )}
              </section>
            </div>
          )
        )}
      </div>

      <div className="mt-10 rounded-md border border-line bg-panel p-5">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-faint">
          Danger zone
        </h2>
        {!confirmingDelete ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="mt-3 rounded-md border border-rec/50 px-3 py-1.5 text-sm text-rec hover:bg-rec/10"
          >
            Delete project
          </button>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-dim">
              Delete “{project.name}” permanently?
            </p>
            <button
              type="button"
              onClick={() => void onDelete()}
              disabled={deleting}
              className="rounded-md bg-rec px-3 py-1.5 text-sm font-medium text-white hover:bg-[#c93a40] disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-md border border-line px-3 py-1.5 text-sm text-text hover:border-dim"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-4" aria-hidden="true">
          <div className="h-8 w-64 rounded bg-panel" />
          <div className="h-20 rounded bg-panel" />
        </div>
      }
    >
      <ProjectDetail />
    </Suspense>
  );
}
