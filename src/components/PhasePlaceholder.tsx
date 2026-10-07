import type { ComponentType } from "react";

/**
 * Honest Phase-1 placeholder for pages whose real functionality ships in
 * Phase 2/3. States what will live here — never fakes it.
 */
export function PhasePlaceholder({
  title,
  phase,
  blurb,
  items,
  icon: Icon,
}: {
  title: string;
  phase: string;
  blurb: string;
  items: string[];
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-md border border-line bg-panel px-6 py-10 text-center sm:px-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-line bg-raise">
          <Icon className="h-6 w-6 text-dim" />
        </div>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-widest text-faint">
          {phase}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-dim">
          {blurb}
        </p>
        <ul className="mx-auto mt-6 max-w-md space-y-2 text-left">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded border border-line/70 bg-ink px-3 py-2.5 text-sm text-dim"
            >
              <span
                className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
