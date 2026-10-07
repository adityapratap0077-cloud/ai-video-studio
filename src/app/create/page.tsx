"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STAGES } from "@/lib/types";
import { createProject } from "@/lib/api";

const PLATFORMS = ["YouTube Shorts", "TikTok", "YouTube", "Reels"];
const DURATIONS = ["15s", "30s", "60s", "90s", "3 min", "5 min", "10 min"];
const ASPECTS = ["9:16", "16:9", "1:1"] as const;
const LANGUAGES = ["English", "Hindi", "Hinglish", "Spanish", "Other"];
const TONES = [
  "Cinematic",
  "Energetic",
  "Calm",
  "Documentary",
  "Playful",
  "Dramatic",
];
const VISUAL_STYLES = [
  "Photoreal",
  "Neon noir",
  "Anime",
  "Minimal",
  "Documentary realism",
  "Claymation",
];

const inputClass =
  "w-full rounded-md border border-line bg-ink px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-dim";
const labelClass =
  "mb-1.5 block font-mono text-[11px] uppercase tracking-widest text-faint";

export default function CreatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [idea, setIdea] = useState("");
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [duration, setDuration] = useState(DURATIONS[1]);
  const [aspectRatio, setAspectRatio] =
    useState<(typeof ASPECTS)[number]>("9:16");
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [tone, setTone] = useState(TONES[0]);
  const [audience, setAudience] = useState("");
  const [visualStyle, setVisualStyle] = useState(VISUAL_STYLES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);

  const canSubmit = name.trim().length > 0 && idea.trim().length > 0 && !saving;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await createProject({
        name: name.trim(),
        idea: idea.trim(),
        settings: {
          platform,
          duration,
          aspectRatio,
          language,
          tone,
          audience: audience.trim(),
          visualStyle,
        },
      });
      setSimulated(res.mock);
      router.push(`/projects/${res.data.id}`);
    } catch (err) {
      setSaving(false);
      setError(
        err instanceof Error ? err.message : "Could not create the project.",
      );
    }
  }

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
        New production
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text">
        Create
      </h1>
      <p className="mt-2 max-w-xl text-[15px] text-dim">
        Describe the video in plain words. The studio files it as a project and
        walks it through the pipeline, stage by stage.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
        <form
          onSubmit={onSubmit}
          className="rounded-md border border-line bg-panel p-5 sm:p-7"
        >
          <div>
            <label htmlFor="name" className={labelClass}>
              Project name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Neon Streets"
              maxLength={80}
              required
              className={inputClass}
            />
          </div>

          <div className="mt-5">
            <label htmlFor="idea" className={labelClass}>
              The idea
            </label>
            <textarea
              id="idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="A 30-second cinematic short: rain-soaked neon alley, a lone courier, synthwave grade…"
              rows={6}
              required
              className={`${inputClass} resize-y leading-relaxed`}
            />
            <p className="mt-1.5 text-[13px] text-faint">
              One paragraph is enough — mood, subject, and what the viewer
              should feel.
            </p>
          </div>

          <div className="mt-7 border-t border-line pt-6">
            <p className={labelClass}>Format</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="platform" className="sr-only">
                  Platform
                </label>
                <select
                  id="platform"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className={inputClass}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <p className="mt-1 font-mono text-[10px] text-faint">platform</p>
              </div>
              <div>
                <label htmlFor="duration" className="sr-only">
                  Duration
                </label>
                <select
                  id="duration"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className={inputClass}
                >
                  {DURATIONS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
                <p className="mt-1 font-mono text-[10px] text-faint">duration</p>
              </div>
              <fieldset>
                <legend className="sr-only">Aspect ratio</legend>
                <div
                  role="radiogroup"
                  aria-label="Aspect ratio"
                  className="flex overflow-hidden rounded-md border border-line"
                >
                  {ASPECTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={aspectRatio === a}
                      onClick={() => setAspectRatio(a)}
                      className={`flex-1 px-2 py-2.5 font-mono text-[13px] transition-colors ${
                        aspectRatio === a
                          ? "bg-raise text-text"
                          : "bg-ink text-faint hover:text-dim"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <p className="mt-1 font-mono text-[10px] text-faint">
                  aspect ratio
                </p>
              </fieldset>
            </div>
          </div>

          <div className="mt-6">
            <p className={labelClass}>Voice</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="language" className="sr-only">
                  Language
                </label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={inputClass}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <p className="mt-1 font-mono text-[10px] text-faint">language</p>
              </div>
              <div>
                <label htmlFor="tone" className="sr-only">
                  Tone
                </label>
                <select
                  id="tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className={inputClass}
                >
                  {TONES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <p className="mt-1 font-mono text-[10px] text-faint">tone</p>
              </div>
              <div>
                <label htmlFor="visualStyle" className="sr-only">
                  Visual style
                </label>
                <select
                  id="visualStyle"
                  value={visualStyle}
                  onChange={(e) => setVisualStyle(e.target.value)}
                  className={inputClass}
                >
                  {VISUAL_STYLES.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <p className="mt-1 font-mono text-[10px] text-faint">
                  visual style
                </p>
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="audience" className="sr-only">
                Audience
              </label>
              <input
                id="audience"
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Who is this for? e.g. 16–34, sci-fi fans"
                maxLength={120}
                className={inputClass}
              />
              <p className="mt-1 font-mono text-[10px] text-faint">
                audience (optional)
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-5 text-sm text-rec">
              {error}
            </p>
          )}
          {simulated && (
            <p role="note" className="mt-5 font-mono text-[11px] text-faint">
              sample data — the projects API is not connected yet
            </p>
          )}

          <div className="mt-7 border-t border-line pt-6">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-md bg-rec px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#c93a40] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Creating…" : "Create Project"}
            </button>
          </div>
        </form>

        <aside className="h-fit rounded-md border border-line bg-panel p-5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
            From idea to export
          </p>
          <ol className="mt-4 space-y-2.5">
            {STAGES.map((stage, i) => (
              <li key={stage.id} className="flex items-center gap-3">
                <span className="w-6 font-mono text-[11px] tabular-nums text-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={`text-sm ${i === 0 ? "text-text" : "text-dim"}`}
                >
                  {stage.label}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-5 border-t border-line pt-4 text-[13px] leading-relaxed text-faint">
            Phase 1 creates the project shell. Research, script and storyboard
            generation arrive in Phase 2; shots, assets, timeline and export in
            Phase 3.
          </p>
        </aside>
      </div>
    </div>
  );
}
