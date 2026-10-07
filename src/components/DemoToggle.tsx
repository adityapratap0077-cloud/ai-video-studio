"use client";

import { Suspense } from "react";
import { useDemoMode } from "@/lib/demo";

/** Demo-mode toggle — writes the avs_demo cookie; no backend needed. */
function DemoToggleInner() {
  const { demo, setDemo } = useDemoMode();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={demo}
      onClick={() => setDemo(!demo)}
      className="relative h-6 w-11 shrink-0 rounded-full border border-line bg-ink transition-colors data-[on=true]:border-rec/60 data-[on=true]:bg-rec/25"
      data-on={demo}
      aria-label="Demo mode"
    >
      <span
        className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-dim transition-all data-[on=true]:bg-rec"
        style={{ left: demo ? "calc(100% - 1.25rem)" : "0.25rem" }}
        data-on={demo}
        aria-hidden="true"
      />
    </button>
  );
}

export function DemoToggle() {
  return (
    <Suspense
      fallback={
        <span
          className="h-6 w-11 rounded-full border border-line bg-ink"
          aria-hidden="true"
        />
      }
    >
      <DemoToggleInner />
    </Suspense>
  );
}
