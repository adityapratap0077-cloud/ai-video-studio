import { STAGES, type ProjectStage } from "@/lib/types";

/**
 * The 8-stage pipeline rendered as a timeline strip: each stage is a
 * clip-like segment, completed ones filled, the current one carrying a
 * red playhead marker. Numbering is structural — this is a sequence.
 */
export function StageStepper({ current }: { current: ProjectStage }) {
  const currentIdx = STAGES.findIndex((s) => s.id === current);

  return (
    <div
      className="overflow-x-auto pb-1"
      role="list"
      aria-label={`Production pipeline — current stage: ${STAGES[currentIdx]?.label ?? current}`}
    >
      <ol className="flex min-w-[720px] gap-1">
        {STAGES.map((stage, i) => {
          const done = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <li
              key={stage.id}
              role="listitem"
              aria-current={isCurrent ? "step" : undefined}
              className="relative flex-1"
            >
              {isCurrent && (
                <span
                  className="absolute -top-1 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-rec"
                  aria-hidden="true"
                />
              )}
              <div
                className={[
                  "rounded-sm border px-2 py-2.5 text-center transition-colors",
                  done && "border-line bg-raise",
                  isCurrent && "border-rec/60 bg-rec/10",
                  !done && !isCurrent && "border-line/60 bg-ink",
                ].join(" ")}
              >
                <p
                  className={[
                    "font-mono text-[10px] tabular-nums",
                    isCurrent ? "text-rec" : done ? "text-dim" : "text-faint",
                  ].join(" ")}
                >
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p
                  className={[
                    "mt-0.5 truncate text-[12px]",
                    isCurrent
                      ? "font-medium text-text"
                      : done
                        ? "text-dim"
                        : "text-faint",
                  ].join(" ")}
                >
                  {stage.label}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
