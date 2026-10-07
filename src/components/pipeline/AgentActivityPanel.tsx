"use client";

/**
 * Agent activity panel: live checklist of the pipeline stages with their
 * states. Clicking a completed stage scrolls to its output.
 */
import type { PipelineStage } from "@/lib/pipeline/schemas";
import type { GateStatus } from "@/lib/pipeline/actions";

export interface ActivityStage {
  id: PipelineStage;
  label: string;
  status: GateStatus;
  phase: string;
}

function stateOf(status: GateStatus): "done" | "active" | "pending" {
  if (status === "approved" || status === "skipped") return "done";
  if (status === "generating" || status === "review") return "active";
  return "pending";
}

const DOT: Record<"done" | "active" | "pending", string> = {
  done: "bg-ok",
  active: "bg-rec",
  pending: "bg-line",
};

export function AgentActivityPanel({
  stages,
  providerName,
  providerModel,
  generationsUsed,
  maxGenerations,
}: {
  stages: ActivityStage[];
  providerName: string;
  providerModel: string | null;
  generationsUsed: number;
  maxGenerations: number;
}) {
  const jump = (id: PipelineStage) => {
    document
      .getElementById(`stage-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section
      aria-label="Pipeline progress"
      className="rounded-md border border-line bg-panel p-5"
    >
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-faint">
        Agent activity
      </h2>

      <ol className="mt-4 space-y-1">
        {stages.map((s) => {
          const state = stateOf(s.status);
          const clickable = state === "done" || s.status === "review";
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => clickable && jump(s.id)}
                disabled={!clickable}
                className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left ${
                  clickable ? "hover:bg-raise" : "cursor-default"
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${DOT[state]} ${state === "active" ? "animate-pulse" : ""}`}
                  aria-hidden="true"
                />
                <span
                  className={`text-sm ${state === "pending" ? "text-faint" : "text-text"}`}
                >
                  {s.label}
                </span>
                <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-faint">
                  {s.status === "generating"
                    ? "working…"
                    : s.status === "review"
                      ? "review"
                      : state}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 border-t border-line/60 pt-4 font-mono text-[11px] leading-relaxed text-faint">
        <p>
          provider <span className="text-dim">{providerName}</span>
        </p>
        {providerModel && (
          <p>
            model <span className="text-dim">{providerModel}</span>
          </p>
        )}
        <p>
          generations{" "}
          <span className="text-dim">
            {generationsUsed} / {maxGenerations}
          </span>
        </p>
      </div>
    </section>
  );
}
