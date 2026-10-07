/** Shared API shapes. These mirror the backend contracts exactly. */

export type ProviderStatus =
  | "connected"
  | "not_configured"
  | "invalid_key"
  | "rate_limited"
  | "unavailable";

export interface Provider {
  providerId: string;
  displayName: string;
  /** Last 4 shown as e.g. "••••1234" placeholder; full key is never exposed. */
  keyHint: string | null;
  model: string | null;
  isActive: boolean;
  lastStatus: ProviderStatus;
  lastTestedAt: string | null;
  lastError: string | null;
}

export interface TestResult {
  status: ProviderStatus;
  message: string;
  latencyMs: number;
}

export type ProjectStage =
  | "idea"
  | "research"
  | "script"
  | "storyboard"
  | "shots"
  | "assets"
  | "timeline"
  | "export";

export interface ProjectSettings {
  platform: "YouTube Shorts" | "TikTok" | "YouTube" | "Reels" | string;
  duration: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  language: string;
  tone: string;
  audience: string;
  visualStyle: string;
}

export interface Project {
  id: string;
  name: string;
  idea: string;
  stage: ProjectStage;
  isDemo: boolean;
  updatedAt: string;
  settings?: ProjectSettings;
}

export const STAGES: { id: ProjectStage; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "research", label: "Research" },
  { id: "script", label: "Script" },
  { id: "storyboard", label: "Storyboard" },
  { id: "shots", label: "Shots" },
  { id: "assets", label: "Assets" },
  { id: "timeline", label: "Timeline" },
  { id: "export", label: "Export" },
];

export function stageLabel(stage: ProjectStage): string {
  return STAGES.find((s) => s.id === stage)?.label ?? stage;
}
