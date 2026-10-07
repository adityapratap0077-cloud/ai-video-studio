"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import {
  fetchProjectSummaries,
  useSelectedProjectId,
  type ProjectSummary,
} from "@/lib/use-selected-project";

interface ExportRecord {
  id: string;
  timestamp: string;
  type: string;
  path: string;
  label?: string;
}

interface Available {
  script: boolean;
  storyboard: boolean;
  captions: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ExportsInner() {
  const [projectId, selectProject] = useSelectedProjectId();
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [records, setRecords] = useState<ExportRecord[]>([]);
  const [available, setAvailable] = useState<Available>({
    script: false,
    storyboard: false,
    captions: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildMsg, setBuildMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchProjectSummaries()
      .then((list) => {
        setSummaries(list);
        if (!projectId && list.length > 0) selectProject(list[0].id);
      })
      .catch(() => setSummaries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/exports`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`Exports API ${res.status}.`);
      const body = (await res.json()) as {
        exports: ExportRecord[];
        available: Available;
      };
      setRecords(body.exports ?? []);
      setAvailable(body.available);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load exports.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect
    void load();
  }, [load]);

  function downloadHref(kind: string, id?: string): string {
    const base = `/api/projects/${encodeURIComponent(projectId ?? "")}/exports/download?kind=${kind}`;
    return id ? `${base}&id=${encodeURIComponent(id)}` : base;
  }

  async function handleBuildPackage() {
    if (!projectId) return;
    setBuilding(true);
    setBuildMsg(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/exports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "package" }),
        },
      );
      const body = (await res.json()) as {
        export?: ExportRecord;
        entries?: string[];
        missingAssets?: string[];
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? `Build ${res.status}.`);
      const missing =
        body.missingAssets && body.missingAssets.length > 0
          ? ` (${body.missingAssets.length} missing asset files skipped)`
          : "";
      setBuildMsg(
        `Package built: ${body.entries?.length ?? 0} files${missing}.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Package build failed.");
    } finally {
      setBuilding(false);
    }
  }

  const latestMp4 = records.find((r) => r.type === "mp4");
  const latestPackage = records.find((r) => r.type === "package");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
            Deliver
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text">
            Exports
          </h1>
          <p className="mt-1 font-mono text-[12px] text-faint">
            {records.length} {records.length === 1 ? "export" : "exports"} on
            record
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-dim">
          <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
            Project
          </span>
          <select
            value={projectId ?? ""}
            onChange={(e) => selectProject(e.target.value || null)}
            className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-text"
          >
            <option value="">Select a project</option>
            {summaries.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!projectId && (
        <div className="mt-8 rounded-md border border-line bg-panel px-6 py-14 text-center">
          <p className="text-lg font-medium text-text">No project selected</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-dim">
            Pick a project above to see its exports.
          </p>
        </div>
      )}

      {projectId && (
        <>
          {error && (
            <p className="mt-4 rounded-md border border-rec/40 bg-rec/[0.07] px-4 py-3 text-sm text-text">
              {error}
            </p>
          )}

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
            {/* Downloads */}
            <div className="space-y-4">
              <section
                aria-label="Downloads"
                className="rounded-md border border-line bg-panel p-5"
              >
                <h2 className="text-sm font-semibold text-text">Downloads</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <DownloadCard
                    title="Final MP4"
                    desc={
                      latestMp4
                        ? `Rendered ${formatDate(latestMp4.timestamp)}`
                        : "Assemble on the Timeline first"
                    }
                    href={latestMp4 ? downloadHref("file", latestMp4.id) : undefined}
                  />
                  <DownloadCard
                    title="Captions (.srt)"
                    desc={
                      available.captions
                        ? "From the timeline caption track"
                        : "No captions on the timeline yet"
                    }
                    href={available.captions ? downloadHref("srt") : undefined}
                  />
                  <DownloadCard
                    title="Script (.txt)"
                    desc={
                      available.script
                        ? "Full voiceover narration as text"
                        : "No script on this project yet"
                    }
                    href={available.script ? downloadHref("script") : undefined}
                  />
                  <DownloadCard
                    title="Storyboard (.json)"
                    desc={
                      available.storyboard
                        ? "Scene-by-scene breakdown"
                        : "No storyboard on this project yet"
                    }
                    href={available.storyboard ? downloadHref("storyboard") : undefined}
                  />
                </div>
              </section>

              {/* Production package */}
              <section
                aria-label="Production package"
                className="rounded-md border border-line bg-panel p-5"
              >
                <h2 className="text-sm font-semibold text-text">
                  Production package
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-dim">
                  One ZIP with project.json, script.txt, storyboard.json,
                  per-shot prompts, asset copies, captions and metadata. No API
                  keys are ever included.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleBuildPackage()}
                    disabled={building}
                    className="rounded-md bg-rec px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#c93a40] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {building ? "Building…" : "Download production package (ZIP)"}
                  </button>
                  {latestPackage && (
                    <a
                      href={downloadHref("file", latestPackage.id)}
                      className="rounded-md border border-line bg-raise px-4 py-2.5 text-sm text-text transition-colors hover:border-dim"
                    >
                      Re-download latest ZIP
                    </a>
                  )}
                </div>
                {buildMsg && (
                  <p className="mt-3 font-mono text-[12px] text-ok">{buildMsg}</p>
                )}
              </section>
            </div>

            {/* History */}
            <section
              aria-label="Export history"
              className="rounded-md border border-line bg-panel p-5"
            >
              <h2 className="text-sm font-semibold text-text">
                Export history
              </h2>
              {loading ? (
                <div
                  className="mt-4 h-40 animate-pulse rounded bg-ink"
                  aria-hidden="true"
                />
              ) : records.length === 0 ? (
                <p className="mt-4 text-sm text-dim">
                  Nothing exported yet. Assemble a video on the Timeline or
                  build a package to start the log.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {records.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-md border border-line bg-ink p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-dim">
                          {r.type}
                        </span>
                        <span className="font-mono text-[10px] text-faint">
                          {formatDate(r.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-text">
                        {r.label ?? r.type}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-faint">
                        {r.path}
                      </p>
                      {(r.type === "mp4" || r.type === "package") && (
                        <a
                          href={downloadHref("file", r.id)}
                          className="mt-2 inline-block font-mono text-[12px] text-rec hover:underline"
                        >
                          Download ↓
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function DownloadCard({
  title,
  desc,
  href,
}: {
  title: string;
  desc: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="mt-1 font-mono text-[11px] text-faint">{desc}</p>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        className="block rounded-md border border-line bg-ink p-4 transition-colors hover:border-dim"
      >
        {inner}
        <span className="mt-2 inline-block font-mono text-[12px] text-rec">
          Download ↓
        </span>
      </a>
    );
  }
  return (
    <div className="rounded-md border border-line bg-ink p-4 opacity-50">
      {inner}
    </div>
  );
}

export default function ExportsPage() {
  return (
    <Suspense
      fallback={
        <div
          className="h-64 animate-pulse rounded-md border border-line bg-panel"
          aria-hidden="true"
        />
      }
    >
      <ExportsInner />
    </Suspense>
  );
}
