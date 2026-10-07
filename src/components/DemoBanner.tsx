/**
 * Shown whenever the viewer is looking at demo/sample data — on demo
 * project pages and at the top of the projects list in demo mode.
 */
export function DemoBanner({ detail }: { detail?: string }) {
  return (
    <div
      role="note"
      aria-label="Demo mode notice"
      className="flex items-start gap-3 rounded-md border border-warn/40 bg-warn/[0.07] px-4 py-3"
    >
      <span
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warn"
        aria-hidden="true"
      />
      <div>
        <p className="font-mono text-[12px] uppercase tracking-wide text-warn">
          Demo mode — sample data
        </p>
        <p className="mt-1 text-sm text-dim">
          {detail ??
            "Everything marked DEMO is a sample. Create your own project to start for real."}
        </p>
      </div>
    </div>
  );
}

/** Small inline pill used on cards and list rows for demo projects. */
export function DemoPill() {
  return (
    <span className="inline-flex items-center rounded border border-warn/50 bg-warn/10 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-warn">
      Demo
    </span>
  );
}
