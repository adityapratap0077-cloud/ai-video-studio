/**
 * MOCK DATA — clearly-marked local fallback.
 *
 * The backend agent owns the /api/* routes. Until they are live, the API
 * client in ./api.ts falls back to this in-memory store and every page
 * renders a "Sample data" notice when that happens. Mutations (save/test/
 * create/delete) apply to this in-memory copy only and are labelled
 * "simulated" in the UI.
 */
import type {
  Project,
  Provider,
  ProjectSettings,
  ProviderStatus,
  TestResult,
} from "./types";

const seedProviders: Provider[] = [
  {
    providerId: "openrouter",
    displayName: "OpenRouter",
    keyHint: "••••8f2a",
    model: "anthropic/claude-sonnet-4",
    isActive: true,
    lastStatus: "connected",
    lastTestedAt: "2026-10-07T08:12:44.000Z",
    lastError: null,
  },
  {
    providerId: "video",
    displayName: "Video",
    keyHint: null,
    model: "veo-3.1",
    isActive: true,
    lastStatus: "not_configured",
    lastTestedAt: null,
    lastError: null,
  },
  {
    providerId: "image",
    displayName: "Image",
    keyHint: "••••91bc",
    model: "flux-pro",
    isActive: true,
    lastStatus: "invalid_key",
    lastTestedAt: "2026-10-07T07:58:02.000Z",
    lastError: "Authentication failed (401) — key rejected by provider.",
  },
  {
    providerId: "tts",
    displayName: "TTS",
    keyHint: "••••44de",
    model: "eleven-v3",
    isActive: true,
    lastStatus: "rate_limited",
    lastTestedAt: "2026-10-07T06:41:19.000Z",
    lastError: "429 Too Many Requests — quota resets in ~60s.",
  },
  {
    providerId: "search",
    displayName: "Search",
    keyHint: null,
    model: null,
    isActive: false,
    lastStatus: "unavailable",
    lastTestedAt: null,
    lastError: "Provider endpoint unreachable from this server.",
  },
];

const seedProjects: Project[] = [
  {
    id: "demo-neon-streets",
    name: "Neon Streets",
    idea: "A 30-second cinematic short: rain-soaked neon alley, a lone courier, synthwave grade. Proof of the full idea-to-export pipeline.",
    stage: "storyboard",
    isDemo: true,
    updatedAt: "2026-10-06T19:22:10.000Z",
    settings: {
      platform: "YouTube Shorts",
      duration: "30s",
      aspectRatio: "9:16",
      language: "English",
      tone: "Cinematic",
      audience: "16–34, sci-fi fans",
      visualStyle: "Neon noir, anamorphic",
    },
  },
  {
    id: "demo-product-teaser",
    name: "Product Launch Teaser",
    idea: "15-second teaser for a fictional smartwatch: macro shots, fast cuts, bold kinetic type.",
    stage: "idea",
    isDemo: true,
    updatedAt: "2026-10-05T11:04:52.000Z",
    settings: {
      platform: "Reels",
      duration: "15s",
      aspectRatio: "9:16",
      language: "English",
      tone: "Energetic",
      audience: "Tech early adopters",
      visualStyle: "Clean product macro",
    },
  },
  {
    id: "proj-monsoon-doc",
    name: "Monsoon Documentary",
    idea: "A 5-minute documentary short on Mumbai monsoons — street vendors, local trains, chai stalls. Voiceover-led, warm grade.",
    stage: "research",
    isDemo: false,
    updatedAt: "2026-10-07T09:31:00.000Z",
    settings: {
      platform: "YouTube",
      duration: "5 min",
      aspectRatio: "16:9",
      language: "Hinglish",
      tone: "Documentary",
      audience: "Urban India, 20–45",
      visualStyle: "Warm documentary realism",
    },
  },
];

// In-memory store; mutations apply here only (simulated until the API lands).
const providers: Provider[] = seedProviders.map((p) => ({ ...p }));
let projects: Project[] = seedProjects.map((p) => ({
  ...p,
  settings: p.settings ? { ...p.settings } : undefined,
}));

export function mockListProviders(): Provider[] {
  return providers.map((p) => ({ ...p }));
}

export function mockListProjects(demo: boolean): Project[] {
  const all = projects.map((p) => ({
    ...p,
    settings: p.settings ? { ...p.settings } : undefined,
  }));
  // Demo projects only surface in demo mode.
  return demo ? all : all.filter((p) => !p.isDemo);
}

export function mockGetProject(id: string): Project | null {
  const found = projects.find((p) => p.id === id);
  if (!found) return null;
  return { ...found, settings: found.settings ? { ...found.settings } : undefined };
}

export function mockCreateProject(input: {
  name: string;
  idea: string;
  settings: ProjectSettings;
}): Project {
  const project: Project = {
    id: `mock-${Date.now().toString(36)}`,
    name: input.name,
    idea: input.idea,
    stage: "idea",
    isDemo: false,
    updatedAt: new Date().toISOString(),
    settings: { ...input.settings },
  };
  projects = [project, ...projects];
  return { ...project };
}

export function mockDeleteProject(id: string): boolean {
  const before = projects.length;
  projects = projects.filter((p) => p.id !== id);
  return projects.length < before;
}

export function mockSaveProvider(
  id: string,
  patch: { apiKey?: string; model?: string },
): Provider | null {
  const idx = providers.findIndex((p) => p.providerId === id);
  if (idx === -1) return null;
  const current = providers[idx];
  const keyHint =
    patch.apiKey && patch.apiKey.trim().length > 0
      ? `••••${patch.apiKey.trim().slice(-4)}`
      : current.keyHint;
  providers[idx] = {
    ...current,
    keyHint,
    model: patch.model !== undefined ? patch.model : current.model,
    // A fresh key hasn't been tested yet — status resets to untested.
    lastStatus: patch.apiKey ? "not_configured" : current.lastStatus,
    lastTestedAt: patch.apiKey ? null : current.lastTestedAt,
    lastError: patch.apiKey ? null : current.lastError,
  };
  return { ...providers[idx] };
}

const TEST_MESSAGES: Record<ProviderStatus, string> = {
  connected: "Connection OK — provider responded with a valid auth handshake.",
  not_configured: "No API key configured for this provider.",
  invalid_key: "Authentication failed (401) — key rejected by provider.",
  rate_limited: "429 Too Many Requests — quota resets in ~60s.",
  unavailable: "Provider endpoint unreachable from this server.",
};

export function mockTestProvider(id: string): TestResult | null {
  const provider = providers.find((p) => p.providerId === id);
  if (!provider) return null;
  // Deterministic-ish latency per provider so the UI demo is stable.
  const latencyMs = 180 + (id.length * 37) % 420;
  return {
    status: provider.lastStatus,
    message: provider.lastError ?? TEST_MESSAGES[provider.lastStatus],
    latencyMs,
  };
}
