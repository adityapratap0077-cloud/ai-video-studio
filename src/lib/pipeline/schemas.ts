/**
 * Zod schemas for the AI Video Studio pipeline stages.
 *
 * These are the integration contracts between:
 * - Phase 2: server actions that generate each stage via AIProvider
 * - Phase 3: asset library, timeline, FFmpeg assembly, export
 *
 * All stages are stored in Project.data JSON under their stage key.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Stage 1: Research                                                   */
/* ------------------------------------------------------------------ */

export const ResearchSourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  /** Short note on what this source contributed. */
  note: z.string().optional(),
});

export const ResearchClaimSchema = z.object({
  text: z.string(),
  /** 'high' | 'medium' | 'low' — how confident the model is. */
  confidence: z.enum(['high', 'medium', 'low']),
  /** True when the claim came from a web search result, false for model knowledge. */
  fromResearch: z.boolean(),
  sourceUrl: z.string().url().optional(),
});

export const ResearchBriefSchema = z.object({
  summary: z.string(),
  keyFacts: z.array(z.string()),
  claims: z.array(ResearchClaimSchema),
  /** Claims that might be wrong — flagged for human review. */
  potentialInaccuracies: z.array(z.string()),
  sources: z.array(ResearchSourceSchema),
  /** Always present: explains what came from model knowledge vs web research. */
  provenanceNote: z.string(),
  /** True when a SearchProvider was used; false = model knowledge only. */
  usedWebResearch: z.boolean(),
});

export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

/* ------------------------------------------------------------------ */
/* Stage 2: Script                                                     */
/* ------------------------------------------------------------------ */

export const ScriptSchema = z.object({
  hook: z.string(),
  body: z.string(),
  /** Ending / call-to-action. */
  cta: z.string(),
  /** Full narration text in speaking order (hook + body + cta). */
  fullText: z.string(),
  estimatedDurationSec: z.number().positive(),
  /** Words per minute assumed for the estimate. */
  wordsPerMinute: z.number().default(150),
});

export type Script = z.infer<typeof ScriptSchema>;

/* ------------------------------------------------------------------ */
/* Stage 3: Storyboard (scenes)                                        */
/* ------------------------------------------------------------------ */

export const SceneSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  narration: z.string(),
  visual: z.string(),
  camera: z.string(),
  mood: z.string(),
});

export const StoryboardSchema = z.object({
  scenes: z.array(SceneSchema).min(1),
  totalDurationSec: z.number().positive(),
});

export type Scene = z.infer<typeof SceneSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;

/* ------------------------------------------------------------------ */
/* Stage 4: Shot prompts                                               */
/* ------------------------------------------------------------------ */

export const ShotPromptSchema = z.object({
  id: z.string(),
  sceneId: z.string(),
  description: z.string(),
  videoPrompt: z.string(),
  negativePrompt: z.string().optional(),
  camera: z.string(),
  lens: z.string().optional(),
  lighting: z.string(),
  environment: z.string(),
  subject: z.string(),
  motion: z.string(),
  durationSec: z.number().positive(),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']),
});

export const ShotPromptsSchema = z.object({
  shots: z.array(ShotPromptSchema).min(1),
});

export type ShotPrompt = z.infer<typeof ShotPromptSchema>;

/* ------------------------------------------------------------------ */
/* Stage 5: Assets                                                     */
/* ------------------------------------------------------------------ */

export const AssetTypeSchema = z.enum(['image', 'video', 'audio', 'caption']);

export const AssetSchema = z.object({
  id: z.string(),
  type: AssetTypeSchema,
  /** Scene this asset belongs to, if any. */
  sceneId: z.string().optional(),
  /** Relative path under the project's asset directory. */
  path: z.string(),
  /** Prompt used to generate it, if applicable. */
  prompt: z.string().optional(),
  /** Provider that produced it, e.g. "openrouter", "local". */
  provider: z.string().optional(),
  createdAt: z.string(),
});

export type Asset = z.infer<typeof AssetSchema>;

/* ------------------------------------------------------------------ */
/* Stage 6: Timeline                                                   */
/* ------------------------------------------------------------------ */

export const TimelineClipSchema = z.object({
  id: z.string(),
  sceneId: z.string(),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  /** Relative path to the video/image asset, if assigned. */
  assetPath: z.string().optional(),
  label: z.string(),
});

export const TimelineSchema = z.object({
  clips: z.array(TimelineClipSchema),
  /** Relative path to the assembled voiceover audio. */
  voiceoverPath: z.string().optional(),
  /** Relative path to background music, if any. */
  musicPath: z.string().optional(),
  /** Captions as WebVTT content (stored inline, exported as file). */
  captionsVtt: z.string().optional(),
  totalDurationSec: z.number().nonnegative(),
});

export type Timeline = z.infer<typeof TimelineSchema>;

/* ------------------------------------------------------------------ */
/* Project data envelope                                               */
/* ------------------------------------------------------------------ */

export const PipelineStageSchema = z.enum([
  'idea',
  'research',
  'script',
  'storyboard',
  'shots',
  'assets',
  'timeline',
  'export',
]);

export type PipelineStage = z.infer<typeof PipelineStageSchema>;

/** Per-stage approval state for human gates. */
export const StageGateSchema = z.object({
  status: z.enum(['pending', 'generating', 'review', 'approved', 'skipped']),
  updatedAt: z.string(),
});

export const ProjectDataSchema = z.object({
  research: ResearchBriefSchema.optional(),
  script: ScriptSchema.optional(),
  storyboard: StoryboardSchema.optional(),
  shots: ShotPromptsSchema.optional(),
  assets: z.array(AssetSchema).default([]),
  timeline: TimelineSchema.optional(),
  /** Human gate state per stage. */
  gates: z.record(PipelineStageSchema, StageGateSchema).optional(),
  /** Cost-control settings. */
  limits: z
    .object({
      maxScenes: z.number().int().positive().default(12),
      maxGenerations: z.number().int().positive().default(20),
      maxRetries: z.number().int().min(0).default(2),
    })
    .optional(),
});

export type ProjectData = z.infer<typeof ProjectDataSchema>;
