"use client";

import { useCallback, useState } from "react";

const STORAGE_KEY = "avs:selectedProjectId";

/** Project id shared across the Assets / Timeline / Exports pages. */
export function useSelectedProjectId(): [
  string | null,
  (id: string | null) => void,
] {
  // Lazy initializer reads localStorage on the client (window is undefined
  // during SSR, where it falls back to null).
  const [id, setId] = useState<string | null>(() => {
    try {
      return typeof window === "undefined"
        ? null
        : window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const select = useCallback((next: string | null) => {
    setId(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, next);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable — selection just won't persist
    }
  }, []);

  return [id, select];
}

export interface ProjectSummary {
  id: string;
  name: string;
  idea: string;
  stage: string;
  updatedAt: string;
}

export async function fetchProjectSummaries(): Promise<ProjectSummary[]> {
  const res = await fetch("/api/projects?limit=100", { cache: "no-store" });
  if (!res.ok) throw new Error(`Projects API responded ${res.status}.`);
  const body = (await res.json()) as { projects?: ProjectSummary[] };
  return body.projects ?? [];
}
