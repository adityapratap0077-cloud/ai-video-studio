"use client";

/**
 * Error card for pipeline failures: provider name, error, possible reason,
 * suggested action. Used for both generation failures and action errors.
 */
import type { PipelineActionError } from "@/lib/pipeline/actions";

export function PipelineErrorCard({ error }: { error: PipelineActionError }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-rec/50 bg-rec/[0.07] p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wide text-rec">
          {error.provider}
        </span>
        {error.model && (
          <span className="rounded border border-line bg-ink px-1.5 py-0.5 font-mono text-[11px] text-dim">
            {error.model}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-faint">
          {error.code}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium text-text">{error.message}</p>
      {error.reason && (
        <p className="mt-1 text-[13px] leading-relaxed text-dim">
          <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
            Possible reason —{" "}
          </span>
          {error.reason}
        </p>
      )}
      {error.suggestedAction && (
        <p className="mt-1 text-[13px] leading-relaxed text-dim">
          <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
            Suggested action —{" "}
          </span>
          {error.suggestedAction}
        </p>
      )}
    </div>
  );
}
