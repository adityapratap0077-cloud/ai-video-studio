# AI Video Studio — Roadmap & Architecture Plan

This document is the working architecture plan for all six phases. It is concrete by design: what exists, what is planned, and what is **explicitly not yet built**. Phase 1 is the current build.

---

## Phase 1 — Foundation (this build)

**Goal:** A working studio shell a user can click through, with real key management and one real LLM provider.

- Project system: create, list, open, rename, delete projects. Each project has a `stage` (idea → script → storyboard → shots → assets → assembly → export) and a JSON `data` column carrying that stage's working state.
- UI shell: dashboard, project detail with stage navigation, Settings → Providers page, demo-mode banner.
- **OpenRouter provider**: `LLMProvider` implementation backed by OpenRouter's chat API. Model is user-configurable (`OPENROUTER_MODEL`, default `openrouter/free`).
- **BYOK settings**: per-provider key entry, AES-256-GCM encryption at rest (`ENCRYPTION_KEY`), Test connection button, delete/replace key.
- **Demo mode**: default-on mock provider and sample projects so the whole UI is explorable with zero keys and zero network calls.
- Prisma + SQLite schema: `Project`, `ProviderKey` (encrypted), `UserSettings`. See the schema sketch below.

## Phase 2 — Idea → Script → Storyboard → Shot prompts

**Goal:** The creative LLM pipeline. Each step generates structured output the user can **approve, edit, or regenerate** before the pipeline advances — a human gate between every AI step.

Pipeline steps and their JSON schemas (validated with Zod before anything is persisted):

1. **Idea intake** — free-text premise + target length + style. Schema: `{ premise, durationSeconds, style, tone }`.
2. **Script** — scene-by-scene script with narration lines and visual notes. Schema: `{ scenes: [{ id, narration, visualNotes, durationSeconds }] }`.
3. **Storyboard** — one board per scene: visual description + camera direction. Schema: `{ boards: [{ sceneId, description, camera, mood }] }`.
4. **Shot prompts** — per-board generation prompts optimized for the target video provider. Schema: `{ shots: [{ boardId, positivePrompt, negativePrompt, aspectRatio, durationSeconds }] }`.

Design rules:

- Every LLM call goes through the `LLMProvider` interface with `response_format: json_object` (or provider-native structured output), then Zod-parse; on parse failure, retry with a repair prompt (max 2 retries), then surface the error to the user — never persist invalid data.
- Prompts live as versioned templates under `src/lib/pipeline/prompts/` (not yet built), one file per step, so prompt tuning is a code review, not a config mystery.
- Human gates are first-class UI: each step renders the generated output with Approve / Edit / Regenerate actions; advancing requires explicit approval. Regenerate accepts an optional "direction" note ("make it funnier") that is appended to the prompt.
- Cost guard: before a multi-step run, show an estimated token/cost line based on model pricing; confirm once, not per step.
- ⛔ **Not yet built:** prompts directory, Zod schemas, pipeline orchestration, gate UI.

## Phase 3 — Assets, assembly, export

**Goal:** Turn approved shot prompts into a finished video file.

- **Asset management**: an `Asset` model (see schema sketch) tracking every generated file — type (video clip, image, audio, caption file), provider, prompt, cost, local path, checksum. A media library UI with preview, rename, delete, and re-generate.
- **Timeline**: per-project shot sequence with per-shot clip assignment, trim points, transitions, caption text, and audio tracks (narration + music). Persisted as JSON in the project `data` column.
- **FFmpeg assembly** (server-side): concat clips, apply crossfades, burn in captions (SRT generated from the script), mix narration + ducked music track, loudness-normalize. Requires FFmpeg on the host (bundled via `ffmpeg-static` or system binary — TBD at build time).
- **Export targets**:
  - **MP4** (H.264 + AAC, 1080p default, configurable).
  - **ZIP project package** — portable format spec: `manifest.json` (project metadata, pipeline outputs, timeline), `assets/` (all media), `script.json`, `storyboard.json`, `captions.srt`, `timeline.json`. Re-importable: dropping a package ZIP back into the studio recreates the project.
- ⛔ **Not yet built:** Asset model, media library UI, timeline editor, FFmpeg pipeline, ZIP spec implementation.

## Phase 4 — VideoProvider implementations

**Goal:** Real video generation behind the `VideoProvider` interface.

Interface notes (target shape; file `src/lib/providers/types.ts` is the eventual contract):

```ts
interface VideoProvider {
  readonly id: string;                 // "veo" | "runway" | "kling" | ...
  generateJob(input: VideoJobInput): Promise<VideoJob>;
  getJobStatus(jobId: string): Promise<VideoJobStatus>;
  downloadResult(jobId: string): Promise<ReadableStream | Buffer>;
  estimateCost(input: VideoJobInput): Promise<CostEstimate>;
}

interface VideoJobInput {
  prompt: string;
  negativePrompt?: string;
  imageRef?: Buffer;                  // image-to-video start frame
  durationSeconds: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  model?: string;
}
```

- Jobs are async everywhere: submit → poll with backoff → download on completion. Job state lives in the `Asset` model (`pending` → `processing` → `ready` | `failed`).
- **Veo**, **Runway**, **Kling** each get an adapter implementing the interface; provider-specific quirks (auth schemes, polling shapes, watermark policies) stay inside the adapter.
- Cost: `estimateCost` is called before submit and shown in the UI confirmation; actual cost recorded on the asset after completion.
- ⛔ **Not yet built:** the `VideoProvider` interface, all three adapters, job polling, cost estimation.

## Phase 5 — TTS + Search providers

**Goal:** Voiceover and research behind their own interfaces.

- `TTSProvider`: `synthesize(text, voice, options) → audio stream`. Voice picker UI per project (voice id persisted in project data). Batch synthesis per scene with per-scene timing so narration can be aligned to shots in Phase 3 assembly. Cost confirmation before batch runs.
- `SearchProvider`: `search(query, type) → results[]` where type is `web | image | video`. Used for reference imagery, B-roll research, and fact-checking script claims. Results are links + thumbnails only — downloaded material becomes `Asset` rows with source attribution stored.
- Candidate providers are chosen at build time; the interfaces are provider-agnostic so community adapters are easy to add.
- ⛔ **Not yet built:** both interfaces, all adapters, voice picker, search UI.

## Phase 6 — Local AI

**Goal:** Run the pipeline with zero cloud spend.

- **Ollama**: `LocalProvider` adapter exposing local chat models as an `LLMProvider` — same pipeline, same Zod validation, no API key needed. Model picker lists locally installed models (via Ollama's API).
- **ComfyUI**: local image/video generation via ComfyUI's prompt-queue API as a `VideoProvider` adapter. Workflow JSON templates ship with the repo; users point the adapter at their ComfyUI server URL.
- **Whisper**: local transcription (for imported footage / voice notes) as part of the `LocalProvider` surface.
- Local providers skip key management entirely (no keys to encrypt) but keep the same cost/confirmation UX — showing "local, no cost" instead of a price.
- ⛔ **Not yet built:** the `LocalProvider` interface, all three adapters, ComfyUI workflow templates.

---

## Provider abstraction design — the five interfaces

Everything the pipeline needs from AI services is expressed through five interfaces (contract file: `src/lib/providers/types.ts` — ⛔ not yet written; Phase 1 ships OpenRouter behind this shape):

| Interface | Responsibility | Phase |
|---|---|---|
| `LLMProvider` | Chat completions, structured JSON output for pipeline steps | 1 (OpenRouter), 6 (Ollama) |
| `VideoProvider` | Async text/image-to-video jobs: submit, poll, download, cost estimate | 4 (Veo/Runway/Kling), 6 (ComfyUI) |
| `TTSProvider` | Text-to-speech synthesis, voice listing | 5 |
| `SearchProvider` | Web/image/video search for research and references | 5 |
| `LocalProvider` | Local model runtimes: list models, run inference, transcribe | 6 (Ollama, ComfyUI, Whisper) |

Design principles:

1. **Server-side only.** Implementations run in server actions / route handlers. They receive decrypted keys from the key service and never expose them.
2. **Pipeline code depends on interfaces, never on providers.** Swapping OpenRouter for Ollama changes one registration line, not the pipeline.
3. **Structured output or it didn't happen.** LLM results are Zod-validated before persistence; adapters normalize provider quirks internally.
4. **Cost is a first-class return.** Every interface exposes cost estimation; the UI confirms before spending the user's money.
5. **Demo doubles.** Each interface has a mock implementation used by demo mode and tests — no keys, no network.

## DB schema sketch

Phase 1 tables (Prisma + SQLite):

```prisma
model Project {
  id        String   @id @default(cuid())
  title     String
  stage     String   @default("idea") // idea | script | storyboard | shots | assets | assembly | export
  data      String   @default("{}")    // JSON: per-stage working state (script, boards, shots, timeline...)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ProviderKey {
  id         String   @id @default(cuid())
  providerId String   @unique          // "openrouter", "veo", ...
  label      String?                  // user-given label, e.g. "Personal key"
  iv         String                   // AES-256-GCM nonce (base64)
  ciphertext String                   // encrypted key (base64)
  authTag    String                   // GCM auth tag (base64)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model UserSettings {
  id        String @id @default("singleton")
  demoMode  Boolean @default(true)
  data      String @default("{}")     // JSON: default models, preferences
  updatedAt DateTime @updatedAt
}
```

Future additions (marked, not built):

- ⛔ `Asset` model (Phase 3): `id, projectId, kind (video|image|audio|caption), providerId, prompt, cost, path, checksum, status, createdAt`. Backs the media library and job polling.
- ⛔ `GenerationJob` model (Phase 4): `id, assetId, providerJobId, status, attempts, lastError` — durable record of async provider jobs.
- Project `data` JSON stays the home of pipeline outputs (script, storyboard, shot prompts, timeline) through all phases; only binary/file metadata moves to `Asset`.

## Honest status

- ✅ **Built (Phase 1):** project CRUD + stage tracking, studio UI shell, OpenRouter LLM provider, BYOK settings with encrypted key storage, demo mode, Prisma/SQLite schema above.
- 🗺️ **Roadmap, not built:** everything marked ⛔ above — pipeline prompts/schemas/gates (P2), assets/timeline/FFmpeg/ZIP (P3), video adapters (P4), TTS/search (P5), local AI (P6).

If a feature isn't listed under "Built", assume it doesn't exist yet and check the issue tracker before assuming otherwise.
