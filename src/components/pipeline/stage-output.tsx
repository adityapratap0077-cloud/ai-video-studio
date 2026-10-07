"use client";

/**
 * Read-only renderers for each Phase 2 stage's output.
 */
import type {
  ResearchBrief,
  Script,
  Storyboard,
  ShotPrompt,
} from "@/lib/pipeline/schemas";

const CONFIDENCE_STYLE: Record<string, string> = {
  high: "border-ok/40 bg-ok/10 text-ok",
  medium: "border-warn/40 bg-warn/10 text-warn",
  low: "border-rec/40 bg-rec/10 text-rec",
};

export function ResearchOutput({ brief }: { brief: ResearchBrief }) {
  return (
    <div className="space-y-4 text-sm">
      <p className="leading-relaxed text-text">{brief.summary}</p>

      <div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
          Key facts
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-text">
          {brief.keyFacts.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </div>

      {brief.claims.length > 0 && (
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
            Claims
          </p>
          <ul className="mt-2 space-y-2">
            {brief.claims.map((c, i) => (
              <li key={i} className="rounded border border-line/70 bg-ink p-3">
                <p className="text-text">{c.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${CONFIDENCE_STYLE[c.confidence] ?? "border-line text-dim"}`}
                  >
                    {c.confidence} confidence
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-faint">
                    {c.fromResearch ? "from web research" : "model knowledge"}
                  </span>
                  {c.sourceUrl && (
                    <a
                      href={c.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[11px] text-dim underline decoration-line underline-offset-2 hover:text-text"
                    >
                      source
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.potentialInaccuracies.length > 0 && (
        <div className="rounded border border-warn/40 bg-warn/[0.06] p-3">
          <p className="font-mono text-[11px] uppercase tracking-widest text-warn">
            Double-check these
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-text">
            {brief.potentialInaccuracies.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {brief.sources.length > 0 && (
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
            Sources
          </p>
          <ul className="mt-2 space-y-1">
            {brief.sources.map((s, i) => (
              <li key={i} className="text-[13px]">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-dim underline decoration-line underline-offset-2 hover:text-text"
                >
                  {s.title}
                </a>
                {s.note && <span className="text-faint"> — {s.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="border-t border-line/60 pt-3 font-mono text-[11px] leading-relaxed text-faint">
        {brief.usedWebResearch ? "● web research used" : "○ model knowledge only"} —{" "}
        {brief.provenanceNote}
      </p>
    </div>
  );
}

export function ScriptOutput({ script }: { script: Script }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3">
        {(
          [
            ["Hook", script.hook, "text-rec"],
            ["Body", script.body, "text-text"],
            ["CTA", script.cta, "text-text"],
          ] as const
        ).map(([label, text, cls]) => (
          <div key={label} className="rounded border border-line/70 bg-ink p-3">
            <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
              {label}
            </p>
            <p className={`mt-1.5 leading-relaxed ${cls}`}>{text}</p>
          </div>
        ))}
      </div>
      <p className="font-mono text-[11px] text-faint">
        ≈ {script.estimatedDurationSec}s · {script.wordsPerMinute} wpm
      </p>
    </div>
  );
}

function fmtSec(v: number): string {
  const m = Math.floor(v / 60);
  const s = (v % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}

export function StoryboardOutput({ board }: { board: Storyboard }) {
  return (
    <div className="space-y-3">
      {board.scenes.map((scene) => (
        <div key={scene.id} className="rounded border border-line/70 bg-ink p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-[12px] text-text">
              {scene.id.replace("scene-", "SC ")}
            </p>
            <p className="font-mono text-[11px] text-faint">
              {fmtSec(scene.startSec)} → {fmtSec(scene.endSec)}
            </p>
          </div>
          <p className="mt-2 text-sm italic leading-relaxed text-dim">
            “{scene.narration}”
          </p>
          <dl className="mt-2 space-y-1 text-[13px]">
            {(
              [
                ["Visual", scene.visual],
                ["Camera", scene.camera],
                ["Mood", scene.mood],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-14 shrink-0 font-mono text-[11px] uppercase text-faint">
                  {k}
                </dt>
                <dd className="text-text">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <p className="font-mono text-[11px] text-faint">
        {board.scenes.length} scenes · {board.totalDurationSec}s total
      </p>
    </div>
  );
}

export function ShotsOutput({ shots }: { shots: ShotPrompt[] }) {
  return (
    <div className="space-y-3">
      {shots.map((shot) => (
        <div key={shot.id} className="rounded border border-line/70 bg-ink p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-[12px] text-text">
              {shot.id.replace("shot-", "SHOT ")}
              <span className="text-faint"> · {shot.sceneId}</span>
            </p>
            <p className="font-mono text-[11px] text-faint">
              {shot.durationSec}s · {shot.aspectRatio}
            </p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-text">
            {shot.videoPrompt}
          </p>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2">
            {(
              [
                ["Camera", shot.camera],
                ["Lens", shot.lens],
                ["Lighting", shot.lighting],
                ["Environment", shot.environment],
                ["Subject", shot.subject],
                ["Motion", shot.motion],
              ] as const
            ).map(([k, v]) =>
              v ? (
                <div key={k} className="flex gap-2">
                  <dt className="w-24 shrink-0 font-mono text-[11px] uppercase text-faint">
                    {k}
                  </dt>
                  <dd className="text-dim">{v}</dd>
                </div>
              ) : null,
            )}
          </dl>
          {shot.negativePrompt && (
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-faint">
              <span className="uppercase tracking-wide text-rec/80">avoid — </span>
              {shot.negativePrompt}
            </p>
          )}
        </div>
      ))}
      <p className="font-mono text-[11px] text-faint">
        {shots.length} shot prompt{shots.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}
