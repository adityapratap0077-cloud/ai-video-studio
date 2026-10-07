"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchProjectSummaries,
  useSelectedProjectId,
  type ProjectSummary,
} from "@/lib/use-selected-project";

interface SceneItem {
  id: string;
  index: number;
  startSec: number;
  endSec: number;
  narration: string;
  visual: string;
  camera: string;
  mood: string;
}

interface ClipItem {
  id: string;
  sceneId: string;
  startSec: number;
  endSec: number;
  assetPath?: string;
  label: string;
}

interface TimelineData {
  clips: ClipItem[];
  voiceoverPath?: string;
  musicPath?: string;
  captionsVtt?: string;
  totalDurationSec: number;
}

interface AssetItem {
  id: string;
  type: string;
  sceneId?: string;
  path: string;
}

const TRACKS = ["VIDEO", "VOICE", "MUSIC", "CAPTIONS"] as const;

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function buildVttFromScenes(scenes: SceneItem[]): string {
  const fmt = (sec: number) => {
    const ms = Math.round(sec * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const r = ms % 1000;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
  };
  const cues = scenes
    .filter((s) => s.narration?.trim())
    .map((s) => `${fmt(s.startSec)} --> ${fmt(s.endSec)}\n${s.narration.trim()}`);
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

function countCues(vtt: string): number {
  return (vtt.match(/-->/g) ?? []).length;
}

function TimelineInner() {
  const [projectId, selectProject] = useSelectedProjectId();
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [hasSavedTimeline, setHasSavedTimeline] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [assembleMsg, setAssembleMsg] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("16:9");
  const [dirty, setDirty] = useState(false);

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
      const [tlRes, assetsRes] = await Promise.all([
        fetch(`/api/projects/${encodeURIComponent(projectId)}/timeline`, {
          cache: "no-store",
        }),
        fetch(`/api/projects/${encodeURIComponent(projectId)}/assets`, {
          cache: "no-store",
        }),
      ]);
      if (!tlRes.ok) throw new Error(`Timeline API ${tlRes.status}.`);
      if (!assetsRes.ok) throw new Error(`Assets API ${assetsRes.status}.`);
      const tlBody = (await tlRes.json()) as {
        timeline: TimelineData | null;
        scenes: SceneItem[];
      };
      const assetsBody = (await assetsRes.json()) as { assets: AssetItem[] };
      const loadedScenes = tlBody.scenes ?? [];
      setScenes(loadedScenes);
      setAssets(assetsBody.assets ?? []);
      if (tlBody.timeline && tlBody.timeline.clips.length > 0) {
        setTimeline(tlBody.timeline);
        setHasSavedTimeline(true);
      } else if (loadedScenes.length > 0) {
        const clips: ClipItem[] = loadedScenes.map((s) => ({
          id: `clip-${s.id}`,
          sceneId: s.id,
          startSec: s.startSec,
          endSec: s.endSec,
          label: `Scene ${s.index + 1}`,
        }));
        setTimeline({
          clips,
          totalDurationSec: Math.max(
            ...loadedScenes.map((s) => s.endSec),
            0,
          ),
        });
        setHasSavedTimeline(false);
      } else {
        setTimeline(null);
        setHasSavedTimeline(false);
      }
      setSelectedClipId(null);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load timeline.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect
    void load();
  }, [load]);

  const total = timeline?.totalDurationSec ?? 0;
  const rulerWidth = Math.max(total * zoom, 200);

  const visualAssets = useMemo(
    () => assets.filter((a) => a.type === "image" || a.type === "video"),
    [assets],
  );
  const audioAssets = useMemo(
    () => assets.filter((a) => a.type === "audio"),
    [assets],
  );

  const selectedClip = timeline?.clips.find((c) => c.id === selectedClipId) ?? null;
  const selectedScene = selectedClip
    ? (scenes.find((s) => s.id === selectedClip.sceneId) ?? null)
    : null;

  function patchTimeline(patch: Partial<TimelineData>) {
    setTimeline((t) => (t ? { ...t, ...patch } : t));
    setDirty(true);
  }

  function setClipAsset(clipId: string, assetPath: string | undefined) {
    setTimeline((t) =>
      t
        ? {
            ...t,
            clips: t.clips.map((c) =>
              c.id === clipId ? { ...c, assetPath } : c,
            ),
          }
        : t,
    );
    setDirty(true);
  }

  async function handleSave() {
    if (!projectId || !timeline) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/timeline`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(timeline),
        },
      );
      const body = (await res.json()) as {
        timeline?: TimelineData;
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? `Save ${res.status}.`);
      setTimeline(body.timeline ?? timeline);
      setHasSavedTimeline(true);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssemble() {
    if (!projectId || !timeline) return;
    setAssembling(true);
    setAssembleMsg("Assembling — concat, audio mix, captions, resize…");
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/timeline`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aspectRatio }),
        },
      );
      const body = (await res.json()) as {
        export?: { id: string; path: string };
        durationSec?: number;
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? `Assemble ${res.status}.`);
      setAssembleMsg(
        `Done — ${body.durationSec?.toFixed(1) ?? "?"}s final MP4 recorded to export history.`,
      );
    } catch (e) {
      setAssembleMsg(null);
      setError(e instanceof Error ? e.message : "Assembly failed.");
    } finally {
      setAssembling(false);
    }
  }

  function handleCaptionsFromScenes() {
    if (scenes.length === 0) return;
    patchTimeline({ captionsVtt: buildVttFromScenes(scenes) });
  }

  const assetLabel = (p?: string) => {
    if (!p) return "None";
    const a = assets.find((x) => x.path === p);
    return a ? a.path : p;
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
            Edit
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text">
            Timeline
          </h1>
          <p className="mt-1 font-mono text-[12px] text-faint">
            {timeline
              ? `${timeline.clips.length} clips · ${fmtTime(total)} total`
              : "—"}
            {hasSavedTimeline ? "" : timeline ? " · unsaved draft" : ""}
            {dirty ? " · unsaved changes" : ""}
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
            Pick a project above to open its timeline.
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

          {loading ? (
            <div
              className="mt-6 h-72 animate-pulse rounded-md border border-line bg-panel"
              aria-hidden="true"
            />
          ) : !timeline ? (
            <div className="mt-6 rounded-md border border-line bg-panel px-6 py-14 text-center">
              <p className="text-lg font-medium text-text">
                No scenes to cut yet
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-dim">
                The timeline builds itself from the storyboard. Generate one
                first, then come back to assemble.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
              {/* Tracks */}
              <div className="overflow-x-auto rounded-md border border-line bg-panel">
                <div className="min-w-full p-4" style={{ width: rulerWidth + 220 }}>
                  {/* Ruler */}
                  <div className="mb-2 flex">
                    <div className="w-24 shrink-0" />
                    <div
                      className="relative h-6 shrink-0 font-mono text-[10px] text-faint"
                      style={{ width: rulerWidth }}
                      aria-hidden="true"
                    >
                      {Array.from(
                        { length: Math.floor(total / 5) + 1 },
                        (_, i) => i * 5,
                      ).map((t) => (
                        <span
                          key={t}
                          className="absolute top-0 border-l border-line pl-1"
                          style={{ left: t * zoom }}
                        >
                          {fmtTime(t)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {TRACKS.map((track) => (
                    <div key={track} className="mb-2 flex">
                      <div className="flex w-24 shrink-0 items-center">
                        <span className="rounded border border-line bg-ink px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-dim">
                          {track}
                        </span>
                      </div>
                      <div
                        className="relative h-16 shrink-0 rounded bg-ink/60"
                        style={{ width: rulerWidth }}
                      >
                        {track === "VIDEO" &&
                          timeline.clips.map((clip) => {
                            const left = clip.startSec * zoom;
                            const width = Math.max(
                              (clip.endSec - clip.startSec) * zoom - 2,
                              24,
                            );
                            const active = clip.id === selectedClipId;
                            return (
                              <button
                                key={clip.id}
                                type="button"
                                onClick={() => setSelectedClipId(clip.id)}
                                aria-pressed={active}
                                title={`${clip.label} · ${fmtTime(clip.startSec)}–${fmtTime(clip.endSec)}`}
                                className={[
                                  "absolute top-1.5 bottom-1.5 overflow-hidden rounded border px-2 text-left transition-colors",
                                  active
                                    ? "border-rec bg-rec/20"
                                    : "border-line bg-raise hover:border-dim",
                                ].join(" ")}
                                style={{ left, width }}
                              >
                                <span className="block truncate font-mono text-[11px] text-text">
                                  {clip.label}
                                </span>
                                <span className="block truncate font-mono text-[10px] text-faint">
                                  {clip.assetPath
                                    ? assetLabel(clip.assetPath)
                                    : "placeholder"}
                                </span>
                              </button>
                            );
                          })}
                        {track === "VOICE" && timeline.voiceoverPath && (
                          <div
                            className="absolute top-1.5 bottom-1.5 rounded border border-line bg-raise px-2"
                            style={{ left: 0, width: rulerWidth }}
                            title={assetLabel(timeline.voiceoverPath)}
                          >
                            <span className="block truncate pt-1 font-mono text-[11px] text-text">
                              {assetLabel(timeline.voiceoverPath)}
                            </span>
                            <span className="font-mono text-[10px] text-faint">
                              voiceover
                            </span>
                          </div>
                        )}
                        {track === "MUSIC" && timeline.musicPath && (
                          <div
                            className="absolute top-1.5 bottom-1.5 rounded border border-line bg-raise px-2"
                            style={{ left: 0, width: rulerWidth }}
                            title={assetLabel(timeline.musicPath)}
                          >
                            <span className="block truncate pt-1 font-mono text-[11px] text-text">
                              {assetLabel(timeline.musicPath)}
                            </span>
                            <span className="font-mono text-[10px] text-faint">
                              music · ducked under voiceover
                            </span>
                          </div>
                        )}
                        {track === "CAPTIONS" &&
                          timeline.captionsVtt &&
                          countCues(timeline.captionsVtt) > 0 && (
                            <div
                              className="absolute top-1.5 bottom-1.5 rounded border border-line bg-raise px-2"
                              style={{ left: 0, width: rulerWidth }}
                            >
                              <span className="block truncate pt-1 font-mono text-[11px] text-text">
                                {countCues(timeline.captionsVtt)} cues
                              </span>
                              <span className="font-mono text-[10px] text-faint">
                                burned in at render
                              </span>
                            </div>
                          )}
                        {(track === "VOICE" || track === "MUSIC" || track === "CAPTIONS") &&
                          !(
                            (track === "VOICE" && timeline.voiceoverPath) ||
                            (track === "MUSIC" && timeline.musicPath) ||
                            (track === "CAPTIONS" &&
                              timeline.captionsVtt &&
                              countCues(timeline.captionsVtt) > 0)
                          ) && (
                            <span className="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[10px] text-faint">
                              empty — assign below
                            </span>
                          )}
                      </div>
                    </div>
                  ))}

                  {/* Zoom */}
                  <div className="mt-3 flex items-center gap-3">
                    <span className="font-mono text-[11px] text-faint">Zoom</span>
                    <input
                      type="range"
                      min={2}
                      max={30}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-40 accent-[#e5484d]"
                      aria-label="Timeline zoom"
                    />
                  </div>
                </div>
              </div>

              {/* Inspector */}
              <div className="space-y-6">
                {/* Clip detail */}
                <section
                  aria-label="Clip inspector"
                  className="rounded-md border border-line bg-panel p-4"
                >
                  <h2 className="text-sm font-semibold text-text">
                    Clip inspector
                  </h2>
                  {selectedClip && selectedScene ? (
                    <div className="mt-3 space-y-3 text-sm">
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-wide text-faint">
                          Scene {selectedScene.index + 1} ·{" "}
                          {fmtTime(selectedClip.startSec)}–
                          {fmtTime(selectedClip.endSec)}
                        </p>
                        <p className="mt-1 font-medium text-text">
                          {selectedClip.label}
                        </p>
                      </div>
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-wide text-faint">
                          Narration
                        </p>
                        <p className="mt-1 leading-relaxed text-dim">
                          {selectedScene.narration}
                        </p>
                      </div>
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-wide text-faint">
                          Visual
                        </p>
                        <p className="mt-1 leading-relaxed text-dim">
                          {selectedScene.visual}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="font-mono text-[11px] uppercase tracking-wide text-faint">
                            Camera
                          </p>
                          <p className="mt-1 text-dim">{selectedScene.camera}</p>
                        </div>
                        <div>
                          <p className="font-mono text-[11px] uppercase tracking-wide text-faint">
                            Mood
                          </p>
                          <p className="mt-1 text-dim">{selectedScene.mood}</p>
                        </div>
                      </div>
                      <label className="block">
                        <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
                          Clip asset
                        </span>
                        <select
                          value={selectedClip.assetPath ?? ""}
                          onChange={(e) =>
                            setClipAsset(
                              selectedClip.id,
                              e.target.value || undefined,
                            )
                          }
                          className="mt-1 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-text"
                        >
                          <option value="">
                            Placeholder (label burned in)
                          </option>
                          {visualAssets.map((a) => (
                            <option key={a.id} value={a.path}>
                              [{a.type}] {a.path}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-dim">
                      Click a clip on the VIDEO track to see its scene details
                      and assign media.
                    </p>
                  )}
                </section>

                {/* Audio + captions */}
                <section
                  aria-label="Audio and captions"
                  className="rounded-md border border-line bg-panel p-4"
                >
                  <h2 className="text-sm font-semibold text-text">
                    Audio &amp; captions
                  </h2>
                  <label className="mt-3 block">
                    <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
                      Voiceover
                    </span>
                    <select
                      value={timeline.voiceoverPath ?? ""}
                      onChange={(e) =>
                        patchTimeline({ voiceoverPath: e.target.value || undefined })
                      }
                      className="mt-1 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-text"
                    >
                      <option value="">None</option>
                      {audioAssets.map((a) => (
                        <option key={a.id} value={a.path}>
                          {a.path}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-3 block">
                    <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
                      Music
                    </span>
                    <select
                      value={timeline.musicPath ?? ""}
                      onChange={(e) =>
                        patchTimeline({ musicPath: e.target.value || undefined })
                      }
                      className="mt-1 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-text"
                    >
                      <option value="">None</option>
                      {audioAssets.map((a) => (
                        <option key={a.id} value={a.path}>
                          {a.path}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
                      Captions (WebVTT)
                    </span>
                    <button
                      type="button"
                      onClick={handleCaptionsFromScenes}
                      disabled={scenes.length === 0}
                      className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-dim transition-colors hover:text-text disabled:opacity-40"
                    >
                      From scenes
                    </button>
                  </div>
                  <textarea
                    value={timeline.captionsVtt ?? ""}
                    onChange={(e) => patchTimeline({ captionsVtt: e.target.value })}
                    rows={5}
                    placeholder={"WEBVTT\n\n00:00:00.000 --> 00:00:02.500\nYour line here…"}
                    className="mt-1 w-full rounded-md border border-line bg-ink px-3 py-2 font-mono text-[12px] text-text placeholder:text-faint"
                  />
                  <p className="mt-1 font-mono text-[11px] text-faint">
                    {timeline.captionsVtt
                      ? `${countCues(timeline.captionsVtt)} cues`
                      : "no captions"}
                  </p>
                </section>

                {/* Render */}
                <section
                  aria-label="Render"
                  className="rounded-md border border-line bg-panel p-4"
                >
                  <h2 className="text-sm font-semibold text-text">Render</h2>
                  <label className="mt-3 block">
                    <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
                      Aspect ratio
                    </span>
                    <div className="mt-1 flex gap-2">
                      {(["9:16", "16:9", "1:1"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setAspectRatio(r)}
                          aria-pressed={aspectRatio === r}
                          className={[
                            "flex-1 rounded-md border px-2 py-1.5 font-mono text-[12px] transition-colors",
                            aspectRatio === r
                              ? "border-rec/60 bg-rec/10 text-text"
                              : "border-line bg-ink text-dim hover:text-text",
                          ].join(" ")}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving || !dirty}
                    className="mt-3 w-full rounded-md border border-line bg-raise px-4 py-2 text-sm font-medium text-text transition-colors hover:border-dim disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving ? "Saving…" : "Save timeline"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAssemble()}
                    disabled={assembling || timeline.clips.length === 0}
                    className="mt-2 w-full rounded-md bg-rec px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#c93a40] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {assembling ? "Assembling…" : "Assemble video"}
                  </button>
                  {assembleMsg && (
                    <p className="mt-2 font-mono text-[11px] leading-relaxed text-ok">
                      {assembleMsg}
                    </p>
                  )}
                  <p className="mt-2 font-mono text-[11px] leading-relaxed text-faint">
                    concat → audio mix → captions → resize. Clips without media
                    render as labeled placeholders.
                  </p>
                  {assembleMsg?.startsWith("Done") && (
                    <Link
                      href="/exports"
                      className="mt-2 inline-block font-mono text-[12px] text-rec hover:underline"
                    >
                      Open Exports →
                    </Link>
                  )}
                </section>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TimelinePage() {
  return (
    <Suspense
      fallback={
        <div
          className="h-64 animate-pulse rounded-md border border-line bg-panel"
          aria-hidden="true"
        />
      }
    >
      <TimelineInner />
    </Suspense>
  );
}
