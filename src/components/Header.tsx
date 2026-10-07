"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useDemoMode } from "@/lib/demo";
import { NAV } from "./Sidebar";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Live timecode, HH:MM:SS:FF at 24fps. Static when reduced motion is on. */
function Timecode() {
  const [now, setNow] = useState(() => new Date());
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setNow(new Date()), 1000 / 24);
    return () => window.clearInterval(id);
  }, [reduced]);

  const frames = reduced ? 0 : Math.floor(now.getMilliseconds() / (1000 / 24));
  const tc = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
    now.getSeconds(),
  )}:${pad(frames)}`;

  return (
    <span
      className="font-mono text-[13px] tabular-nums text-dim"
      aria-label={`Studio timecode ${tc}`}
    >
      {tc}
    </span>
  );
}

function HeaderInner() {
  const { demo } = useDemoMode();

  return (
    <>
      <div className="flex h-14 items-center gap-3 border-b border-line bg-ink px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-2.5 lg:hidden">
          <span className="rec-dot rec-dot-sm" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight text-text">
            AI Video Studio
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {demo && (
            <span className="rounded border border-warn/50 bg-warn/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-warn">
              Demo
            </span>
          )}
          <span className="hidden items-center gap-2 sm:flex" aria-hidden="true">
            <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
              TC
            </span>
            <Timecode />
          </span>
        </div>
      </div>

      {/* Mobile / tablet nav — horizontal scroll under the header */}
      <nav
        aria-label="Primary"
        className="border-b border-line bg-panel lg:hidden"
      >
        <ul className="flex gap-1 overflow-x-auto px-3 py-2">
          {NAV.map((item) => (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-dim hover:bg-raise hover:text-text"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

export function Header() {
  return (
    <header>
      <Suspense>
        <HeaderInner />
      </Suspense>
    </header>
  );
}
