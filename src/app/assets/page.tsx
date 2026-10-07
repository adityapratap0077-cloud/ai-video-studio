"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchProjectSummaries,
  useSelectedProjectId,
  type ProjectSummary,
} from "@/lib/use-selected-project";

interface AssetItem {
  id: string;
  type: "image" | "video" | "audio" | "caption";
  sceneId?: string;
  path: string;
  prompt?: string;
  provider?: string;
  createdAt: string;
}

interface SceneItem {
  id: string;
  index: number;
  narration: string;
}

type TypeFilter = "all" | "image" | "video" | "audio" | "caption";

const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "caption", label: "Captions" },
];

const GENERATE_TYPES = [
  { id: "image", label: "Image still" },
  { id: "video", label: "Video clip" },
  { id: "audio", label: "Voiceover (TTS)" },
] as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileUrl(projectId: string, assetId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/file`;
}

function AssetsInner() {
  const [projectId, selectProject] = useSelectedProjectId();
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [scriptText, setScriptText] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sceneFilter, setSceneFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadScene, setUploadScene] = useState<string>("");
  const [uploadPrompt, setUploadPrompt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  // Generate state
  const [genType, setGenType] =
    useState<(typeof GENERATE_TYPES)[number]["id"]>("image");
  const [genScene, setGenScene] = useState<string>("");
  const [genPrompt, setGenPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

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
      const [assetsRes, projectRes] = await Promise.all([
        fetch(`/api/projects/${encodeURIComponent(projectId)}/assets`, {
          cache: "no-store",
        }),
        fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
          cache: "no-store",
        }),
      ]);
      if (!assetsRes.ok) throw new Error(`Assets API ${assetsRes.status}.`);
      if (!projectRes.ok) throw new Error(`Project API ${projectRes.status}.`);
      const assetsBody = (await assetsRes.json()) as { assets: AssetItem[] };
      const projectBody = (await projectRes.json()) as {
        project: { data: Record<string, unknown> };
      };
      setAssets(assetsBody.assets ?? []);
      const data = projectBody.project.data ?? {};
      const sb = (data.storyboard ?? {}) as { scenes?: SceneItem[] };
      setScenes(sb.scenes ?? []);
      const script = (data.script ?? {}) as { fullText?: string };
      setScriptText(script.fullText ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load assets.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      assets.filter(
        (a) =>
          (typeFilter === "all" || a.type === typeFilter) &&
          (sceneFilter === "all" || a.sceneId === sceneFilter),
      ),
    [assets, typeFilter, sceneFilter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: assets.length };
    for (const a of assets) c[a.type] = (c[a.type] ?? 0) + 1;
    return c;
  }, [assets]);

  async function handleUpload() {
    if (!projectId || !uploadFile) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      if (uploadScene) form.append("sceneId", uploadScene);
      if (uploadPrompt.trim()) form.append("prompt", uploadPrompt.trim());
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/assets`,
        { method: "POST", body: form },
      );
      const body = (await res.json()) as {
        asset?: AssetItem;
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? `Upload ${res.status}.`);
      setUploadMsg(`Saved "${body.asset?.path ?? uploadFile.name}".`);
      setUploadFile(null);
      setUploadPrompt("");
      await load();
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(asset: AssetItem) {
    if (!projectId) return;
    if (!window.confirm(`Delete "${asset.path}" from the library?`)) return;
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message: string } };
        throw new Error(body.error?.message ?? `Delete ${res.status}.`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  function handleScriptDownload() {
    if (!scriptText.trim()) return;
    const blob = new Blob([scriptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "voiceover-script.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleGenerate() {
    if (!projectId || !genPrompt.trim()) return;
    setGenerating(true);
    setGenMsg(null);
    try {
      const res = await fetch("/api/assets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          ...(genScene ? { sceneId: genScene } : {}),
          type: genType,
          prompt: genPrompt.trim(),
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        asset?: AssetItem;
        error?: { message: string; code: string };
      };
      if (!res.ok) {
        setGenMsg({ ok: false, text: body.error?.message ?? `Error ${res.status}.` });
      } else {
        setGenMsg({ ok: true, text: "Generated and saved to the library." });
        setGenPrompt("");
        await load();
      }
    } catch (e) {
      setGenMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
            Library
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text">
            Assets
          </h1>
          <p className="mt-1 font-mono text-[12px] text-faint">
            {assets.length} {assets.length === 1 ? "asset" : "assets"} in the
            library
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
            Pick a project above to browse its asset library.
          </p>
        </div>
      )}

      {projectId && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
          {/* Library column */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTypeFilter(f.id)}
                  aria-pressed={typeFilter === f.id}
                  className={[
                    "rounded-md border px-3 py-1.5 font-mono text-[12px] transition-colors",
                    typeFilter === f.id
                      ? "border-rec/60 bg-rec/10 text-text"
                      : "border-line bg-panel text-dim hover:text-text",
                  ].join(" ")}
                >
                  {f.label}
                  <span className="ml-1.5 text-faint">{counts[f.id] ?? 0}</span>
                </button>
              ))}
              <select
                value={sceneFilter}
                onChange={(e) => setSceneFilter(e.target.value)}
                className="ml-auto rounded-md border border-line bg-panel px-3 py-1.5 font-mono text-[12px] text-dim"
                aria-label="Filter by scene"
              >
                <option value="all">All scenes</option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    Scene {s.index + 1}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="mt-4 rounded-md border border-rec/40 bg-rec/[0.07] px-4 py-3 text-sm text-text">
                {error}
              </p>
            )}

            {loading ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-56 animate-pulse rounded-md border border-line bg-panel"
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="mt-4 rounded-md border border-line bg-panel px-6 py-12 text-center">
                <p className="text-sm text-dim">
                  {assets.length === 0
                    ? "The library is empty. Upload media or generate from a prompt."
                    : "Nothing matches these filters."}
                </p>
              </div>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {projectId &&
                  filtered.map((a) => (
                    <li
                      key={a.id}
                      className="overflow-hidden rounded-md border border-line bg-panel"
                    >
                      <div className="flex h-44 items-center justify-center bg-ink">
                        {a.type === "image" && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={fileUrl(projectId, a.id)}
                            alt={a.path}
                            className="max-h-full max-w-full object-contain"
                            loading="lazy"
                          />
                        )}
                        {a.type === "video" && (
                          <video
                            src={fileUrl(projectId, a.id)}
                            className="max-h-full max-w-full"
                            controls
                            preload="metadata"
                          />
                        )}
                        {a.type === "audio" && (
                          <div className="w-full px-4">
                            <p className="mb-2 truncate text-center font-mono text-[12px] text-dim">
                              {a.path}
                            </p>
                            <audio
                              src={fileUrl(projectId, a.id)}
                              controls
                              className="w-full"
                              preload="metadata"
                            />
                          </div>
                        )}
                        {a.type === "caption" && (
                          <p className="px-4 text-center font-mono text-[12px] text-dim">
                            Caption file — attach to the timeline as subtitles.
                          </p>
                        )}
                      </div>
                      <div className="border-t border-line p-3">
                        <p className="truncate font-mono text-[12px] text-text">
                          {a.path}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="rounded border border-line bg-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-dim">
                            {a.type}
                          </span>
                          {a.sceneId && (
                            <span className="rounded border border-line bg-ink px-1.5 py-0.5 font-mono text-[10px] text-dim">
                              {(() => {
                                const s = scenes.find((x) => x.id === a.sceneId);
                                return s ? `Scene ${s.index + 1}` : a.sceneId;
                              })()}
                            </span>
                          )}
                          {a.provider && (
                            <span className="rounded border border-line bg-ink px-1.5 py-0.5 font-mono text-[10px] text-faint">
                              {a.provider}
                            </span>
                          )}
                          <span className="ml-auto font-mono text-[10px] text-faint">
                            {formatDate(a.createdAt)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDelete(a)}
                          className="mt-2.5 rounded-md border border-line px-2.5 py-1 font-mono text-[11px] text-dim transition-colors hover:border-rec/60 hover:text-rec"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* Side column */}
          <div className="space-y-6">
            {/* Upload */}
            <section
              aria-label="Upload asset"
              className="rounded-md border border-line bg-panel p-4"
            >
              <h2 className="text-sm font-semibold text-text">Upload media</h2>
              <p className="mt-1 font-mono text-[11px] leading-relaxed text-faint">
                Images, video, audio or caption files. Max 150 MB.
              </p>
              <input
                type="file"
                accept="image/*,video/*,audio/*,.vtt,.srt"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="mt-3 w-full text-sm text-dim file:mr-3 file:rounded-md file:border file:border-line file:bg-raise file:px-3 file:py-1.5 file:text-sm file:text-text"
              />
              <label className="mt-3 block">
                <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
                  Scene (optional)
                </span>
                <select
                  value={uploadScene}
                  onChange={(e) => setUploadScene(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-text"
                >
                  <option value="">Unassigned</option>
                  {scenes.map((s) => (
                    <option key={s.id} value={s.id}>
                      Scene {s.index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block">
                <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
                  Prompt / note (optional)
                </span>
                <input
                  value={uploadPrompt}
                  onChange={(e) => setUploadPrompt(e.target.value)}
                  placeholder="What is this for?"
                  className="mt-1 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-text placeholder:text-faint"
                />
              </label>
              <button
                type="button"
                disabled={!uploadFile || uploading}
                onClick={() => void handleUpload()}
                className="mt-3 w-full rounded-md bg-rec px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#c93a40] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {uploading ? "Uploading…" : "Upload to library"}
              </button>
              {uploadMsg && (
                <p className="mt-2 font-mono text-[11px] text-dim">{uploadMsg}</p>
              )}
            </section>

            {/* Generate */}
            <section
              aria-label="Generate asset"
              className="rounded-md border border-line bg-panel p-4"
            >
              <h2 className="text-sm font-semibold text-text">
                Generate from prompt
              </h2>
              <p className="mt-1 font-mono text-[11px] leading-relaxed text-faint">
                Wired to the media providers. Needs a key under Providers —
                honest error until then.
              </p>
              <div className="mt-3 flex gap-2">
                {GENERATE_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setGenType(t.id)}
                    aria-pressed={genType === t.id}
                    className={[
                      "flex-1 rounded-md border px-2 py-1.5 font-mono text-[11px] transition-colors",
                      genType === t.id
                        ? "border-rec/60 bg-rec/10 text-text"
                        : "border-line bg-ink text-dim hover:text-text",
                    ].join(" ")}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <label className="mt-3 block">
                <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
                  Scene (optional)
                </span>
                <select
                  value={genScene}
                  onChange={(e) => setGenScene(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-text"
                >
                  <option value="">Unassigned</option>
                  {scenes.map((s) => (
                    <option key={s.id} value={s.id}>
                      Scene {s.index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block">
                <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
                  Prompt
                </span>
                <textarea
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe the shot, the look, the voice…"
                  className="mt-1 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-text placeholder:text-faint"
                />
              </label>
              <button
                type="button"
                disabled={!genPrompt.trim() || generating}
                onClick={() => void handleGenerate()}
                className="mt-3 w-full rounded-md border border-line bg-raise px-4 py-2 text-sm font-medium text-text transition-colors hover:border-dim disabled:cursor-not-allowed disabled:opacity-40"
              >
                {generating ? "Generating…" : "Generate"}
              </button>
              {genMsg && (
                <p
                  className={[
                    "mt-2 font-mono text-[11px] leading-relaxed",
                    genMsg.ok ? "text-ok" : "text-warn",
                  ].join(" ")}
                >
                  {genMsg.text}
                </p>
              )}
            </section>

            {/* Script export */}
            <section
              aria-label="Voiceover script"
              className="rounded-md border border-line bg-panel p-4"
            >
              <h2 className="text-sm font-semibold text-text">
                Voiceover script
              </h2>
              <p className="mt-1 font-mono text-[11px] leading-relaxed text-faint">
                Downloads the full narration as a .txt — works with no TTS
                provider. Read it into any recorder or TTS tool.
              </p>
              <button
                type="button"
                disabled={!scriptText.trim()}
                onClick={handleScriptDownload}
                className="mt-3 w-full rounded-md border border-line bg-raise px-4 py-2 text-sm font-medium text-text transition-colors hover:border-dim disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export script as text
              </button>
              {!scriptText.trim() && (
                <p className="mt-2 font-mono text-[11px] text-faint">
                  No script on this project yet.
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssetsPage() {
  return (
    <Suspense
      fallback={
        <div
          className="h-64 animate-pulse rounded-md border border-line bg-panel"
          aria-hidden="true"
        />
      }
    >
      <AssetsInner />
    </Suspense>
  );
}
