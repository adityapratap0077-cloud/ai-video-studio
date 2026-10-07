"use client";

/**
 * Cost-control limits for a project: max scenes, max retries, max
 * generations. Saved through the updateLimits server action.
 */
import { useState } from "react";
import type { PipelineActionError } from "@/lib/pipeline/actions";
import { PipelineErrorCard } from "./PipelineErrorCard";

export interface Limits {
  maxScenes: number;
  maxRetries: number;
  maxGenerations: number;
}

export function LimitsPanel({
  initial,
  busy,
  error,
  onSave,
  onClearError,
}: {
  initial: Limits;
  busy: boolean;
  error: PipelineActionError | null;
  onSave: (limits: Limits) => void;
  onClearError: () => void;
}) {
  const [draft, setDraft] = useState<Limits>(initial);
  const [dirty, setDirty] = useState(false);
  const [seenInitial, setSeenInitial] = useState(initial);

  // Derived state: when the server snapshot changes (e.g. after a save),
  // adopt it unless the user has unsaved edits. Render-phase setState is
  // the supported pattern for this.
  if (!dirty && seenInitial !== initial) {
    setSeenInitial(initial);
    setDraft(initial);
  }

  const set = (key: keyof Limits, value: number) => {
    if (Number.isNaN(value)) return;
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };

  const fields: { key: keyof Limits; label: string; hint: string; min: number; max: number }[] = [
    { key: "maxScenes", label: "Max scenes", hint: "Storyboard is capped at this many scenes.", min: 1, max: 50 },
    { key: "maxRetries", label: "Max retries", hint: "JSON-fix retries per generation.", min: 0, max: 5 },
    { key: "maxGenerations", label: "Max generations", hint: "Total AI generations allowed for this project.", min: 1, max: 500 },
  ];

  return (
    <section
      aria-label="Cost limits"
      className="rounded-md border border-line bg-panel p-5"
    >
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-faint">
        Cost limits
      </h2>

      {error && (
        <div className="mt-3">
          <PipelineErrorCard error={error} />
          <button
            type="button"
            onClick={onClearError}
            className="mt-2 font-mono text-[11px] text-faint underline decoration-line underline-offset-2 hover:text-dim"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {fields.map((f) => (
          <div key={f.key}>
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor={`limit-${f.key}`}
                className="text-sm text-text"
              >
                {f.label}
              </label>
              <input
                id={`limit-${f.key}`}
                type="number"
                min={f.min}
                max={f.max}
                value={draft[f.key]}
                onChange={(e) => set(f.key, Number(e.target.value))}
                className="w-20 rounded-md border border-line bg-ink px-2 py-1 font-mono text-[13px] text-text"
              />
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-faint">{f.hint}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={!dirty || busy}
        onClick={() => {
          setDirty(false);
          onSave(draft);
        }}
        className="mt-4 rounded-md border border-line px-3 py-1.5 text-sm text-text hover:border-dim disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save limits"}
      </button>
    </section>
  );
}
