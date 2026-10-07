"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  IconAssets,
  IconCreate,
  IconExports,
  IconProjects,
  IconProviders,
  IconSettings,
  IconStoryboard,
  IconTimeline,
  type Icon,
} from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: Icon;
}

export const NAV: NavItem[] = [
  { href: "/projects", label: "Projects", icon: IconProjects },
  { href: "/create", label: "Create", icon: IconCreate },
  { href: "/storyboard", label: "Storyboard", icon: IconStoryboard },
  { href: "/assets", label: "Assets", icon: IconAssets },
  { href: "/timeline", label: "Timeline", icon: IconTimeline },
  { href: "/exports", label: "Exports", icon: IconExports },
  { href: "/providers", label: "Providers", icon: IconProviders },
  { href: "/settings", label: "Settings", icon: IconSettings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-panel lg:flex">
      <div className="flex items-center gap-3 border-b border-line px-5 py-5">
        <span className="rec-dot" aria-hidden="true" />
        <div>
          <p className="text-[15px] font-semibold tracking-tight text-text">
            AI Video Studio
          </p>
          <p className="font-mono text-[11px] text-faint">edit suite · v0.1</p>
        </div>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-raise text-text"
                      : "text-dim hover:bg-raise/60 hover:text-text",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "h-5 w-5 shrink-0",
                      active ? "text-rec" : "text-faint group-hover:text-dim",
                    ].join(" ")}
                  >
                    <item.icon className="h-5 w-5" />
                  </span>
                  {item.label}
                  {active && (
                    <span
                      className="ml-auto h-1.5 w-1.5 rounded-full bg-rec"
                      aria-hidden="true"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-line px-5 py-4">
        <p className="font-mono text-[11px] leading-relaxed text-faint">
          phase 1 — project shell
          <br />
          generation lands in phase 2
        </p>
      </div>
    </aside>
  );
}
