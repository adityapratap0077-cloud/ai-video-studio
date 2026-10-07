"use client";

/**
 * One stage of the pipeline: status badge, generate/regenerate with cost
 * confirmation, review output with approve / edit / regenerate / skip,
 * inline JSON editing, and error display.
 */
import { useState, type ReactNode } from "react";
import type {
  GateStatus,
  PipelineActionError,
} from "@/lib/pipeline/actions";
import { PipelineErrorCard } from "./PipelineErrorCard";

export type GeneratableStage = "research" | "script" | "storyboard" | "shots";

const GATE_BADGE: Record<GateStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "border-line bg-raise text-faint" },
  generating: { label: "Generating", className: "border-rec/50 bg-rec/10 text-rec" },
  review: { label: "In review", className: "border-warn/50 bg-warn/10 text-warn" },
  approved: { label: "Approved", className: "border-ok/40 bg-ok/10 text-ok" },
  skipped: { label: "Skipped", className: "border-line bg-ink text-dim" },
};

export function GateBadge({ status }: { status: GateStatus }) {
  const { label, className } = GATE_BADGE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${className}`}
    >
      {status === "generating" && <span className="rec-dot rec-dot-sm" aria-hidden="true" />}
      {label}
    </span>
  );
}

const BTN =
  "rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const BTN_GHOST = `${BTN} border-line text-text hover:border-dim`;
const BTN_PRIMARY = `${BTN} border-rec/60 bg-rec/10 text-text hover:bg-rec/20`;
const BTN_OK = `${BTN} border-ok/50 text-ok hover:bg-ok/10`;
const BTN_WARN = `${BTN} border-line text-dim hover:border-dim hover:text-text`;

interface StageCardProps {
  stage: GeneratableStage;
  label: string;
  description: string;
  status: GateStatus;
  unlocked: boolean;
  lockReason?: string;
  hasOutput: boolean;
  children?: ReactNode;
  rawJson: string;
  providerModel: string | null;
  maxRetries: number;
  /** Show the "N AI calls" confirmation before generating. */
  needsConfirm: boolean;
  runInfo?: string;
  busy: boolean;
  error: PipelineActionError | null;
  onGenerate: () => void;
  onApprove: () => void;
  onSkip: () => void;
  onSaveEdit: (json: string) => void;
  onClearError: () => void;
}

export function StageCard(props: StageCardProps) {
  const {
    stage,
    label,
    description,
    status,
    unlocked,
    lockReason,
    hasOutput,
    children,
    rawJson,
    providerModel,
    maxRetries,
    needsConfirm,
    runInfo,
    busy,
    error,
    onGenerate,
    onApprove,
    onSkip,
    onSaveEdit,
    onClearError,
  } = props;

  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rawJson);

  const startEdit = () => {
    setDraft(rawJson);
    setEditing(true);
  };

  const showOutput = hasOutput && (status === "review" || status === "approved");
  const generateLabel =
    status === "review" || status === "approved" || status === "skipped"
      ? "Regenerate"
      : "Generate";

  const handleGenerateClick = () => {
    if (needsConfirm && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onGenerate();
  };

  return (
    <section
      id={`stage-${stage}`}
      aria-label={`${label} stage`}
      className="scroll-mt-24 rounded-md border border-line bg-panel p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-medium text-text">{label}</h3>
          <p className="mt-0.5 text-[13px] text-faint">{description}</p>
        </div>
        <GateBadge status={busy ? "generating" : status} />
      </div>

      {runInfo && (
        <p className="mt-2 font-mono text-[11px] text-faint">{runInfo}</p>
      )}

      {error && (
        <div className="mt-4">
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

      {showOutput && !editing && <div className="mt-4">{children}</div>}

      {editing && (
        <div className="mt-4">
          <label
            htmlFor={`edit-${stage}`}
            className="font-mono text-[11px] uppercase tracking-widest text-faint"
          >
            Edit {label} JSON
          </label>
          <textarea
            id={`edit-${stage}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            spellCheck={false}
            className="mt-2 w-full rounded-md border border-line bg-ink p-3 font-mono text-[12px] leading-relaxed text-text"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                onSaveEdit(draft);
              }}
              disabled={busy}
              className={BTN_PRIMARY}
            >
              Save & validate
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={BTN_GHOST}
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 font-mono text-[11px] text-faint">
            Saved edits are validated against the stage schema and return the
            stage to review.
          </p>
        </div>
      )}

      {confirming && (
        <div className="mt-4 rounded-md border border-warn/50 bg-warn/[0.06] p-4">
          <p className="text-sm text-text">
            This will make{" "}
            <strong className="font-semibold">1 AI call</strong>
            {providerModel && (
              <>
                {" "}with <code className="rounded bg-ink px-1.5 py-0.5 font-mono text-[12px]">{providerModel}</code>
              </>
            )}{" "}
            (up to {maxRetries} {maxRetries === 1 ? "retry" : "retries"} if the
            response needs fixing).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleGenerateClick}
              disabled={busy}
              className={BTN_PRIMARY}
            >
              {busy ? "Generating…" : "Confirm & generate"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={BTN_GHOST}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!editing && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {status === "review" && (
            <>
              <button
                type="button"
                onClick={onApprove}
                disabled={busy}
                className={BTN_OK}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={startEdit}
                disabled={busy}
                className={BTN_GHOST}
              >
                Edit
              </button>
            </>
          )}
          {(unlocked || hasOutput) && (
            <button
              type="button"
              onClick={handleGenerateClick}
              disabled={busy || (!unlocked && !hasOutput)}
              className={BTN_PRIMARY}
            >
              {busy ? "Generating…" : generateLabel}
            </button>
          )}
          {status === "review" && (
            <button
              type="button"
              onClick={onSkip}
              disabled={busy}
              className={BTN_WARN}
            >
              Skip stage
            </button>
          )}
          {!unlocked && !hasOutput && lockReason && (
            <p className="font-mono text-[11px] text-faint">🔒 {lockReason}</p>
          )}
        </div>
      )}

      {status === "skipped" && (
        <p className="mt-3 font-mono text-[11px] text-faint">
          Skipped — the pipeline continues without this stage. Generate to fill
          it in anyway.
        </p>
      )}
    </section>
  );
}
