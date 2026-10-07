/**
 * API client. Tries the real /api/* routes first; when they are not
 * reachable (backend agent still building them), falls back to the
 * clearly-marked mock store in ./mock.ts and sets `mock: true` so the UI
 * can label the data as samples.
 */
import {
  mockCreateProject,
  mockDeleteProject,
  mockGetProject,
  mockListProjects,
  mockListProviders,
  mockSaveProvider,
  mockTestProvider,
} from "./mock";
import type {
  Project,
  ProjectSettings,
  Provider,
  TestResult,
} from "./types";

export interface ApiResult<T> {
  data: T;
  /** True when the data came from the local mock store, not the backend. */
  mock: boolean;
}

async function request<T>(
  path: string,
  init: RequestInit | undefined,
  mockFn: () => T | null,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    const data = (await res.json()) as T;
    return { data, mock: false };
  } catch {
    const fallback = mockFn();
    if (fallback === null) {
      throw new Error(
        "The API is not reachable and no sample data exists for this request.",
      );
    }
    return { data: fallback, mock: true };
  }
}

export function listProjects(demo: boolean): Promise<ApiResult<Project[]>> {
  const qs = demo ? "?demo=1" : "";
  return request(`/api/projects${qs}`, undefined, () =>
    mockListProjects(demo),
  );
}

export function getProject(id: string): Promise<ApiResult<Project>> {
  return request(
    `/api/projects/${encodeURIComponent(id)}`,
    undefined,
    () => mockGetProject(id),
  );
}

export function createProject(input: {
  name: string;
  idea: string;
  settings: ProjectSettings;
}): Promise<ApiResult<Project>> {
  return request(
    "/api/projects",
    { method: "POST", body: JSON.stringify(input) },
    () => mockCreateProject(input),
  );
}

export function deleteProject(id: string): Promise<ApiResult<void>> {
  return request(
    `/api/projects/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    () => {
      if (!mockDeleteProject(id)) return null;
      return undefined;
    },
  );
}

export function listProviders(): Promise<ApiResult<Provider[]>> {
  return request("/api/providers", undefined, () => mockListProviders());
}

export function saveProvider(
  id: string,
  patch: { apiKey?: string; model?: string },
): Promise<ApiResult<Provider>> {
  return request(
    `/api/providers/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
    () => mockSaveProvider(id, patch),
  );
}

export function testProvider(id: string): Promise<ApiResult<TestResult>> {
  return request(
    `/api/providers/${encodeURIComponent(id)}/test`,
    { method: "POST" },
    () => mockTestProvider(id),
  );
}
