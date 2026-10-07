'use server';

/**
 * Phase 2 pipeline server actions: AI generation for the research, script,
 * storyboard and shots stages, plus gate management (approve / skip / edit)
 * and cost-limit settings.
 *
 * All generation runs server-side — API keys never reach the client.
 * Every action returns an ActionResult envelope so the UI can render the
 * provider name, the error, a possible reason and a suggested action.
 * Models are never switched silently: the provider's configured model is
 * used and reported back with every result.
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAIProvider, getSearchProvider } from '@/lib/providers/registry';
import { getProviderApiKey } from '@/lib/providers/config';
import { StubSearchProvider } from '@/lib/providers/stubs';
import {
  CUSTOM_LLM_PROVIDER_ID,
  DEFAULT_CUSTOM_MODEL,
  parseCustomModelField,
} from '@/lib/providers/openai-compatible';
import {
  ProviderNotConfiguredError,
  type SearchProvider,
  type SearchResultItem,
} from '@/lib/providers/types';
import {
  ResearchBriefSchema,
  ScriptSchema,
  StoryboardSchema,
  ShotPromptsSchema,
  type PipelineStage,
  type ResearchBrief,
  type Script,
  type Storyboard,
} from './schemas';
import {
  RESEARCH_SYSTEM_PROMPT,
  RESEARCH_JSON_SHAPE,
  SCRIPT_SYSTEM_PROMPT,
  SCRIPT_JSON_SHAPE,
  STORYBOARD_SYSTEM_PROMPT,
  STORYBOARD_JSON_SHAPE,
  SHOTS_SYSTEM_PROMPT,
  SHOTS_JSON_SHAPE,
} from './prompts';
import { runGeneration, NOT_CONFIGURED_MESSAGE } from './generate';
import {
  STAGE_ORDER,
  normalizeGates,
  isUnlocked,
  canGenerate,
  headlineStage,
  setGate,
  type GateStatus,
} from './gates';

/* ------------------------------------------------------------------ */
/* Result + error envelopes                                             */
/* ------------------------------------------------------------------ */

export type PipelineErrorCode =
  | 'NOT_CONFIGURED'
  | 'NOT_FOUND'
  | 'LOCKED'
  | 'MISSING_INPUT'
  | 'GENERATION_FAILED'
  | 'VALIDATION_FAILED'
  | 'LIMIT_REACHED'
  | 'INVALID_EDIT';

export interface PipelineActionError {
  code: PipelineErrorCode;
  /** Short message shown as the error title. */
  message: string;
  /** Provider display name, e.g. "OpenRouter". */
  provider: string;
  /** Model that was (or would be) used, if known. */
  model: string | null;
  /** Possible reason for the failure. */
  reason: string;
  /** What the user can do about it. */
  suggestedAction: string;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: PipelineActionError };

function fail(
  code: PipelineErrorCode,
  message: string,
  extra: Partial<Pick<PipelineActionError, 'provider' | 'model' | 'reason' | 'suggestedAction'>> = {},
): ActionResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      provider: extra.provider ?? 'OpenRouter',
      model: extra.model ?? null,
      reason: extra.reason ?? '',
      suggestedAction: extra.suggestedAction ?? 'Try again. If the problem persists, check the provider status in Settings → Providers.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Input validation                                                   */
/* ------------------------------------------------------------------ */

const ProjectIdInput = z.string().min(1).max(100);
const GeneratableStageInput = z.enum(['research', 'script', 'storyboard', 'shots']);
type GeneratableStage = z.infer<typeof GeneratableStageInput>;

const STAGE_SCHEMAS = {
  research: ResearchBriefSchema,
  script: ScriptSchema,
  storyboard: StoryboardSchema,
  shots: ShotPromptsSchema,
} as const;

const ResolvedLimitsSchema = z.object({
  maxScenes: z.number().int().positive().max(50).default(12),
  maxRetries: z.number().int().min(0).max(5).default(2),
  maxGenerations: z.number().int().positive().max(500).default(20),
});
export type ResolvedLimits = z.infer<typeof ResolvedLimitsSchema>;

const UpdateLimitsInput = z.object({
  maxScenes: z.number().int().min(1).max(50).optional(),
  maxRetries: z.number().int().min(0).max(5).optional(),
  maxGenerations: z.number().int().min(1).max(500).optional(),
});

/* ------------------------------------------------------------------ */
/* Project data loading / saving                                        */
/* ------------------------------------------------------------------ */

function safeParseData(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

function resolveLimits(raw: unknown): ResolvedLimits {
  const parsed = ResolvedLimitsSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  return ResolvedLimitsSchema.parse({});
}

function pickStage<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  if (value === undefined) return undefined;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

interface RunMeta {
  model: string;
  attempts: number;
  at: string;
}

function readMeta(raw: Record<string, unknown>): { generationsUsed: number; runs: Record<string, RunMeta> } {
  const meta = raw._meta;
  if (typeof meta !== 'object' || meta === null) return { generationsUsed: 0, runs: {} };
  const m = meta as { generationsUsed?: unknown; runs?: unknown };
  return {
    generationsUsed: typeof m.generationsUsed === 'number' ? m.generationsUsed : 0,
    runs: typeof m.runs === 'object' && m.runs !== null ? (m.runs as Record<string, RunMeta>) : {},
  };
}

export interface NormalizedPipeline {
  research?: ResearchBrief;
  script?: Script;
  storyboard?: Storyboard;
  shots?: { shots: import('./schemas').ShotPrompt[] };
  gates: Record<PipelineStage, ReturnType<typeof normalizeGates>[PipelineStage]>;
  limits: ResolvedLimits;
}

export interface PipelineSnapshot {
  pipeline: NormalizedPipeline;
  /** Headline stage string for the Stepper. */
  projectStage: string;
  providerName: string;
  providerModel: string | null;
  providerConfigured: boolean;
  generationsUsed: number;
  runs: Record<string, RunMeta>;
}

export interface PipelineStateData {
  projectId: string;
  name: string;
  idea: string;
  settings: Record<string, unknown>;
  snapshot: PipelineSnapshot;
}

interface ProjectRow {
  id: string;
  name: string;
  idea: string;
  settings: string;
  stage: string;
  data: string;
}

async function loadProject(projectId: string): Promise<ProjectRow | null> {
  try {
    return await db.project.findUnique({ where: { id: projectId } });
  } catch {
    return null;
  }
}

/**
 * Mirrors getAIProvider()'s precedence (custom LLM wins over OpenRouter)
 * so the UI always names the provider/model that will actually be used.
 * Never switches models silently — this is display-only.
 */
async function resolveProviderInfo(): Promise<{
  name: string;
  model: string | null;
  configured: boolean;
}> {
  try {
    const customKey = await getProviderApiKey(CUSTOM_LLM_PROVIDER_ID);
    if (customKey) {
      let isActive = true;
      let modelField = '';
      try {
        const row = await db.providerConfig.findUnique({
          where: { providerId: CUSTOM_LLM_PROVIDER_ID },
          select: { isActive: true, model: true },
        });
        if (row) {
          isActive = row.isActive;
          modelField = row.model ?? '';
        }
      } catch {
        // keep env/default resolution
      }
      if (isActive) {
        const parsed = parseCustomModelField(modelField);
        const model =
          parsed.model || process.env.CUSTOM_LLM_MODEL || DEFAULT_CUSTOM_MODEL;
        return { name: 'Custom LLM', model, configured: true };
      }
    }
  } catch {
    // fall through to OpenRouter
  }

  let openRouterKey: string | null = null;
  try {
    openRouterKey = await getProviderApiKey('openrouter');
  } catch {
    openRouterKey = null;
  }
  if (openRouterKey) {
    let model = process.env.OPENROUTER_MODEL || 'openrouter/free';
    try {
      const row = await db.providerConfig.findUnique({
        where: { providerId: 'openrouter' },
        select: { model: true },
      });
      if (row?.model) model = row.model;
    } catch {
      // Keep the env/default model when the DB is unavailable.
    }
    return { name: 'OpenRouter', model, configured: true };
  }
  return {
    name: 'OpenRouter',
    model: process.env.OPENROUTER_MODEL || 'openrouter/free',
    configured: false,
  };
}

function buildSnapshot(
  project: ProjectRow,
  providerName: string,
  providerModel: string | null,
  providerConfigured: boolean,
): PipelineSnapshot {
  const raw = safeParseData(project.data);
  const gates = normalizeGates(raw.gates);
  const now = new Date().toISOString();
  // The idea gate reflects whether an idea exists at all.
  gates.idea = {
    status: project.idea.trim() ? 'approved' : 'pending',
    updatedAt: gates.idea.updatedAt ?? now,
  };
  const meta = readMeta(raw);
  return {
    pipeline: {
      research: pickStage(ResearchBriefSchema, raw.research),
      script: pickStage(ScriptSchema, raw.script),
      storyboard: pickStage(StoryboardSchema, raw.storyboard),
      shots: pickStage(ShotPromptsSchema, raw.shots),
      gates,
      limits: resolveLimits(raw.limits),
    },
    projectStage: headlineStage(gates),
    providerName,
    providerModel,
    providerConfigured,
    generationsUsed: meta.generationsUsed,
    runs: meta.runs,
  };
}

/** Parse "30s" / "3 min" style durations to seconds. Defaults to 30. */
function parseDurationToSec(value: unknown): number {
  if (typeof value !== 'string') return 30;
  const s = value.trim().toLowerCase();
  const sec = s.match(/^(\d+(?:\.\d+)?)\s*s(ec(ond)?s?)?$/);
  if (sec) return Math.max(1, Math.round(Number(sec[1])));
  const min = s.match(/^(\d+(?:\.\d+)?)\s*min(ute)?s?$/);
  if (min) return Math.max(1, Math.round(Number(min[1]) * 60));
  return 30;
}

function settingsLine(settings: Record<string, unknown>): string {
  const get = (k: string) => (typeof settings[k] === 'string' ? (settings[k] as string) : '');
  const parts = [
    get('platform') && `platform: ${get('platform')}`,
    get('duration') && `target duration: ${get('duration')}`,
    get('aspectRatio') && `aspect ratio: ${get('aspectRatio')}`,
    get('language') && `language: ${get('language')}`,
    get('tone') && `tone: ${get('tone')}`,
    get('audience') && `audience: ${get('audience')}`,
    get('visualStyle') && `visual style: ${get('visualStyle')}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : 'no specific settings';
}

function aspectRatioOf(settings: Record<string, unknown>): '9:16' | '16:9' | '1:1' {
  const v = settings.aspectRatio;
  return v === '16:9' || v === '1:1' || v === '9:16' ? v : '9:16';
}

/* ------------------------------------------------------------------ */
/* Read: full pipeline state                                            */
/* ------------------------------------------------------------------ */

/** Load the project plus its normalized pipeline state for the UI. */
export async function getPipelineState(projectId: string): Promise<ActionResult<PipelineStateData>> {
  const idParsed = ProjectIdInput.safeParse(projectId);
  if (!idParsed.success) return fail('NOT_FOUND', 'Project not found.', { reason: 'Invalid project id.' });

  const project = await loadProject(idParsed.data);
  if (!project) {
    return fail('NOT_FOUND', 'Project not found.', { reason: 'No project with this id exists in the database.' });
  }

  const info = await resolveProviderInfo();
  return {
    ok: true,
    data: {
      projectId: project.id,
      name: project.name,
      idea: project.idea,
      settings: safeParseData(project.settings),
      snapshot: buildSnapshot(project, info.name, info.model, info.configured),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Generation core                                                     */
/* ------------------------------------------------------------------ */

interface StageContext {
  idea: string;
  settings: Record<string, unknown>;
  research?: ResearchBrief;
  script?: Script;
  storyboard?: Storyboard;
  limits: ResolvedLimits;
}

const STAGE_LABELS: Record<GeneratableStage, string> = {
  research: 'Research',
  script: 'Script',
  storyboard: 'Storyboard',
  shots: 'Shots',
};

function mapProviderError(
  err: unknown,
  providerName: string,
  model: string | null,
): Omit<PipelineActionError, 'code' | 'message'> {
  const message = err instanceof Error ? err.message : 'Unknown provider error.';
  const base = {
    provider: providerName,
    model,
    reason: message,
    suggestedAction: 'Try again. If the problem persists, check the provider status in Settings → Providers.',
  };
  const code = (err as { code?: string })?.code;
  switch (code) {
    case 'invalid_key':
      return { ...base, reason: message, suggestedAction: `Your ${providerName} API key was rejected. Check it in Settings → Providers and save a valid key.` };
    case 'rate_limited':
      return { ...base, reason: message, suggestedAction: 'The provider is rate-limiting requests. Wait a minute and try again.' };
    case 'timeout':
    case 'network':
      return { ...base, reason: message, suggestedAction: `The request could not reach ${providerName}. Check your network connection and try again.` };
    default:
      return base;
  }
}

async function saveStageResult(
  projectId: string,
  stage: GeneratableStage,
  value: unknown,
  run: RunMeta,
  providerName: string,
): Promise<PipelineSnapshot> {
  const project = (await loadProject(projectId))!;
  const raw = safeParseData(project.data);
  const gates = normalizeGates(raw.gates);
  const now = new Date().toISOString();

  raw[stage] = value;
  const withGate = setGate(gates, stage, 'review', now);
  raw.gates = withGate;

  const meta = readMeta(raw);
  raw._meta = {
    generationsUsed: meta.generationsUsed + 1,
    runs: { ...meta.runs, [stage]: run },
  };

  const projectStage = headlineStage(withGate);
  await db.project.update({
    where: { id: projectId },
    data: { data: JSON.stringify(raw), stage: projectStage },
  });

  return buildSnapshot(
    { ...project, data: JSON.stringify(raw), stage: projectStage },
    providerName,
    run.model,
    true,
  );
}

interface RunStageArgs {
  projectId: string;
  stage: GeneratableStage;
  systemPrompt: string;
  jsonShape: string;
  buildUserPrompt: (ctx: StageContext) => string;
  postProcess: (value: unknown, ctx: StageContext) => unknown;
  /** Extra preconditions; return an error message when not met. */
  require?: (ctx: StageContext) => string | null;
  temperature?: number;
  maxTokens?: number;
}

async function runStage(args: RunStageArgs): Promise<ActionResult<{ snapshot: PipelineSnapshot; model: string; attempts: number }>> {
  const idParsed = ProjectIdInput.safeParse(args.projectId);
  if (!idParsed.success) return fail('NOT_FOUND', 'Project not found.', { reason: 'Invalid project id.' });
  const projectId = idParsed.data;

  const project = await loadProject(projectId);
  if (!project) {
    return fail('NOT_FOUND', 'Project not found.', { reason: 'No project with this id exists in the database.' });
  }

  const raw = safeParseData(project.data);
  const gates = normalizeGates(raw.gates);
  gates.idea = {
    status: project.idea.trim() ? 'approved' : 'pending',
    updatedAt: gates.idea.updatedAt,
  };
  const limits = resolveLimits(raw.limits);
  const meta = readMeta(raw);

  if (!canGenerate(args.stage, gates)) {
    const missing = STAGE_ORDER.slice(1, STAGE_ORDER.indexOf(args.stage)).find(
      (s) => gates[s].status !== 'approved' && gates[s].status !== 'skipped',
    );
    return fail('LOCKED', `${STAGE_LABELS[args.stage]} is locked.`, {
      reason: missing
        ? `The "${missing}" stage must be approved or skipped first.`
        : 'A previous stage must be approved or skipped first.',
      suggestedAction: 'Approve or skip the earlier stage, then generate this one.',
    });
  }

  const info = await resolveProviderInfo();

  if (meta.generationsUsed >= limits.maxGenerations) {
    return fail('LIMIT_REACHED', 'Generation limit reached.', {
      provider: info.name,
      model: info.model,
      reason: `This project has used ${meta.generationsUsed} of ${limits.maxGenerations} allowed generations.`,
      suggestedAction: 'Raise "Max generations" in the cost limits panel to continue.',
    });
  }

  const ctx: StageContext = {
    idea: project.idea,
    settings: safeParseData(project.settings),
    research: pickStage(ResearchBriefSchema, raw.research),
    script: pickStage(ScriptSchema, raw.script),
    storyboard: pickStage(StoryboardSchema, raw.storyboard),
    limits,
  };

  if (args.require) {
    const problem = args.require(ctx);
    if (problem) {
      return fail('MISSING_INPUT', problem, {
        suggestedAction: 'Generate the earlier stage first, then try again.',
      });
    }
  }

  if (!info.configured) {
    return fail('NOT_CONFIGURED', NOT_CONFIGURED_MESSAGE, {
      provider: info.name,
      model: info.model,
      reason: `No ${info.name} API key is saved.`,
      suggestedAction: 'Open Settings → Providers and add your API key, then try again.',
    });
  }

  const provider = await getAIProvider();
  let result: Awaited<ReturnType<typeof runGeneration>>;
  try {
    result = await runGeneration({
      generate: (o) => provider.generateText(o),
      stageLabel: STAGE_LABELS[args.stage],
      systemPrompt: args.systemPrompt,
      userPrompt: args.buildUserPrompt(ctx),
      jsonShape: args.jsonShape,
      schema: STAGE_SCHEMAS[args.stage] as z.ZodType<unknown>,
      maxRetries: limits.maxRetries,
      temperature: args.temperature,
      maxTokens: args.maxTokens,
    });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return fail('NOT_CONFIGURED', NOT_CONFIGURED_MESSAGE, {
        provider: info.name,
        model: info.model,
        reason: `No ${info.name} API key is saved.`,
        suggestedAction: 'Open Settings → Providers and add your API key, then try again.',
      });
    }
    return { ok: false, error: { ...mapProviderError(err, info.name, info.model), code: 'GENERATION_FAILED', message: 'Generation failed.' } };
  }

  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: result.error.message,
        provider: info.name,
        model: info.model,
        reason: result.error.reason,
        suggestedAction: 'Try generating again — the next attempt starts fresh. If it keeps failing, try a different model in Settings → Providers.',
      },
    };
  }

  const processed = args.postProcess(result.data, ctx);
  const snapshot = await saveStageResult(
    projectId,
    args.stage,
    processed,
    { model: result.model, attempts: result.attempts, at: new Date().toISOString() },
    info.name,
  );
  return { ok: true, data: { snapshot, model: result.model, attempts: result.attempts } };
}

/* ------------------------------------------------------------------ */
/* Stage 1: Research                                                   */
/* ------------------------------------------------------------------ */

/**
 * Try the configured search provider (live Tavily when a search key is
 * saved, honest stub otherwise), falling back to model knowledge.
 */
async function tryWebSearch(idea: string): Promise<{
  used: boolean;
  note: string;
  results: SearchResultItem[];
}> {
  const empty = { used: false, note: '', results: [] as SearchResultItem[] };
  let provider: SearchProvider;
  try {
    provider = await getSearchProvider();
  } catch {
    return empty;
  }
  if (provider instanceof StubSearchProvider) return empty;
  try {
    const results = await provider.search(idea, 5);
    return { used: true, note: '', results };
  } catch (err) {
    return {
      used: false,
      note: `Web search failed (${err instanceof Error ? err.message : 'unknown error'}) — falling back to model knowledge.`,
      results: [],
    };
  }
}

/* ------------------------------------------------------------------ */
/* Stage 1: Research                                                   */
/* ------------------------------------------------------------------ */

export async function generateResearch(
  projectId: string,
): Promise<ActionResult<{ snapshot: PipelineSnapshot; model: string; attempts: number }>> {
  const idParsed = ProjectIdInput.safeParse(projectId);
  const project = idParsed.success ? await loadProject(idParsed.data) : null;
  const search = project?.idea ? await tryWebSearch(project.idea) : { used: false, note: '', results: [] as SearchResultItem[] };
  return runStage({
    projectId,
    stage: 'research',
    systemPrompt: RESEARCH_SYSTEM_PROMPT,
    jsonShape: RESEARCH_JSON_SHAPE,
    temperature: 0.5,
    maxTokens: 3000,
    buildUserPrompt: (ctx) => {
      const searchBlock = search.used
        ? `Web search WAS performed via the search provider. Set usedWebResearch to true. ` +
          `Claims backed by these results must have fromResearch: true and include the sourceUrl. ` +
          `Sources must only use URLs from these results — never invent URLs.\n` +
          search.results
            .map((r, i) => `${i + 1}. ${r.title} (${r.url})\n${r.snippet}`)
            .join('\n\n')
        : `Web search was NOT performed — set usedWebResearch to false and fromResearch to false on every claim.`;
      return (
        `Video idea:\n"""${ctx.idea}"""\n\nSettings: ${settingsLine(ctx.settings)}\n\n` +
        `${searchBlock}` +
        `${search.note ? `\nNote: ${search.note}` : ''}\n\nProduce the research brief.`
      );
    },
    postProcess: (value) => {
      // Enforce honest provenance: when no web search ran, no claim may
      // pretend otherwise, whatever the model wrote.
      const brief = value as ResearchBrief;
      return {
        ...brief,
        usedWebResearch: search.used,
        claims: brief.claims.map((c) => ({
          ...c,
          fromResearch: search.used ? c.fromResearch : false,
          sourceUrl: search.used ? c.sourceUrl : undefined,
        })),
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Stage 2: Script                                                     */
/* ------------------------------------------------------------------ */

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export async function generateScript(
  projectId: string,
): Promise<ActionResult<{ snapshot: PipelineSnapshot; model: string; attempts: number }>> {
  return runStage({
    projectId,
    stage: 'script',
    systemPrompt: SCRIPT_SYSTEM_PROMPT,
    jsonShape: SCRIPT_JSON_SHAPE,
    temperature: 0.7,
    maxTokens: 2500,
    buildUserPrompt: (ctx) => {
      const targetSec = parseDurationToSec(ctx.settings.duration);
      const targetWords = Math.max(20, Math.round((targetSec / 60) * 150));
      const researchBlock = ctx.research
        ? `Research brief to draw on:\nSummary: ${ctx.research.summary}\nKey facts:\n${ctx.research.keyFacts.map((f) => `- ${f}`).join('\n')}`
        : 'No research brief is available — work from the idea directly.';
      return (
        `Video idea:\n"""${ctx.idea}"""\n\nSettings: ${settingsLine(ctx.settings)}\n\n` +
        `${researchBlock}\n\nTarget: approximately ${targetWords} words for ~${targetSec} seconds of narration.\n\nWrite the script.`
      );
    },
    postProcess: (value) => {
      // Duration is computed deterministically from the word count (150 wpm),
      // never trusted from the model.
      const script = value as Script;
      const words = countWords(script.fullText);
      return {
        ...script,
        wordsPerMinute: 150,
        estimatedDurationSec: Math.round((words / 150) * 60 * 10) / 10,
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Stage 3: Storyboard                                                 */
/* ------------------------------------------------------------------ */

export async function generateStoryboard(
  projectId: string,
): Promise<ActionResult<{ snapshot: PipelineSnapshot; model: string; attempts: number }>> {
  return runStage({
    projectId,
    stage: 'storyboard',
    systemPrompt: STORYBOARD_SYSTEM_PROMPT,
    jsonShape: STORYBOARD_JSON_SHAPE,
    temperature: 0.5,
    maxTokens: 4000,
    require: (ctx) => (ctx.script ? null : 'Generate the script first — the storyboard needs narration to split into scenes.'),
    buildUserPrompt: (ctx) => {
      const script = ctx.script!;
      return (
        `Narration script:\n"""${script.fullText}"""\n\n` +
        `Total duration: ${script.estimatedDurationSec} seconds.\n` +
        `Maximum scenes: ${ctx.limits.maxScenes} (produce at most this many).\n` +
        `Settings: ${settingsLine(ctx.settings)}\n\nSplit the script into scenes covering the full duration.`
      );
    },
    postProcess: (value, ctx) => {
      // Cap scenes at the cost limit and renumber deterministically.
      const board = value as Storyboard;
      const scenes = board.scenes.slice(0, ctx.limits.maxScenes).map((s, i) => ({
        ...s,
        id: `scene-${i + 1}`,
        index: i,
      }));
      return { scenes, totalDurationSec: board.totalDurationSec };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Stage 4: Shot prompts                                               */
/* ------------------------------------------------------------------ */

export async function generateShots(
  projectId: string,
): Promise<ActionResult<{ snapshot: PipelineSnapshot; model: string; attempts: number }>> {
  return runStage({
    projectId,
    stage: 'shots',
    systemPrompt: SHOTS_SYSTEM_PROMPT,
    jsonShape: SHOTS_JSON_SHAPE,
    temperature: 0.6,
    maxTokens: 6000,
    require: (ctx) => (ctx.storyboard ? null : 'Generate the storyboard first — shot prompts are written per scene.'),
    buildUserPrompt: (ctx) => {
      const board = ctx.storyboard!;
      const ratio = aspectRatioOf(ctx.settings);
      const sceneLines = board.scenes
        .map(
          (s) =>
            `- ${s.id} (${s.startSec}s → ${s.endSec}s): narration """${s.narration}""" | visual: ${s.visual} | camera: ${s.camera} | mood: ${s.mood}`,
        )
        .join('\n');
      return (
        `Storyboard scenes:\n${sceneLines}\n\n` +
        `Aspect ratio for every shot: ${ratio}\n` +
        `Visual style: ${typeof ctx.settings.visualStyle === 'string' ? ctx.settings.visualStyle : 'cinematic'}\n\n` +
        `Write one shot prompt per scene, with ALL fields.`
      );
    },
    postProcess: (value, ctx) => {
      const shots = value as { shots: import('./schemas').ShotPrompt[] };
      const sceneIds = new Set(ctx.storyboard!.scenes.map((s) => s.id));
      // Keep shots that reference real scenes; renumber ids deterministically.
      const kept = shots.shots.filter((sh) => sceneIds.has(sh.sceneId));
      const finalShots = (kept.length > 0 ? kept : shots.shots).map((sh, i) => ({
        ...sh,
        id: `shot-${i + 1}`,
      }));
      return { shots: finalShots };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Gates: approve / skip / edit / limits                                */
/* ------------------------------------------------------------------ */

async function writeGatesAndStage(
  projectId: string,
  gates: Record<PipelineStage, ReturnType<typeof normalizeGates>[PipelineStage]>,
): Promise<PipelineSnapshot> {
  const project = (await loadProject(projectId))!;
  const raw = safeParseData(project.data);
  raw.gates = gates;
  const projectStage = headlineStage(gates);
  await db.project.update({
    where: { id: projectId },
    data: { data: JSON.stringify(raw), stage: projectStage },
  });
  const info = await resolveProviderInfo();
  return buildSnapshot(
    { ...project, data: JSON.stringify(raw), stage: projectStage },
    info.name,
    info.model,
    info.configured,
  );
}

/** Approve a stage that is in review, unlocking the next stage. */
export async function approveStage(
  projectId: string,
  stage: string,
): Promise<ActionResult<{ snapshot: PipelineSnapshot }>> {
  const idParsed = ProjectIdInput.safeParse(projectId);
  const stageParsed = GeneratableStageInput.safeParse(stage);
  if (!idParsed.success || !stageParsed.success) return fail('NOT_FOUND', 'Project or stage not found.');

  const project = await loadProject(idParsed.data);
  if (!project) return fail('NOT_FOUND', 'Project not found.');

  const raw = safeParseData(project.data);
  const gates = normalizeGates(raw.gates);
  const st = stageParsed.data;
  const current = gates[st].status;
  if (current !== 'review' && current !== 'generating') {
    return fail('LOCKED', `Cannot approve — the ${STAGE_LABELS[st]} stage is "${current}".`, {
      reason: 'Only a stage awaiting review can be approved.',
      suggestedAction: 'Generate the stage first, then approve the result.',
    });
  }
  const snapshot = await writeGatesAndStage(idParsed.data, setGate(gates, st, 'approved'));
  return { ok: true, data: { snapshot } };
}

/** Skip a stage (records the decision, unlocks the next stage). */
export async function skipStage(
  projectId: string,
  stage: string,
): Promise<ActionResult<{ snapshot: PipelineSnapshot }>> {
  const idParsed = ProjectIdInput.safeParse(projectId);
  const stageParsed = GeneratableStageInput.safeParse(stage);
  if (!idParsed.success || !stageParsed.success) return fail('NOT_FOUND', 'Project or stage not found.');

  const project = await loadProject(idParsed.data);
  if (!project) return fail('NOT_FOUND', 'Project not found.');

  const raw = safeParseData(project.data);
  const gates = normalizeGates(raw.gates);
  const st = stageParsed.data;
  if (!isUnlocked(st, gates)) {
    return fail('LOCKED', `Cannot skip — the ${STAGE_LABELS[st]} stage is locked.`, {
      reason: 'A previous stage must be approved or skipped first.',
      suggestedAction: 'Approve or skip the earlier stage first.',
    });
  }
  const snapshot = await writeGatesAndStage(idParsed.data, setGate(gates, st, 'skipped'));
  return { ok: true, data: { snapshot } };
}

/**
 * Save a hand-edited stage payload. The JSON is parsed and validated with
 * the stage's Zod schema before anything is written; the gate returns to
 * "review" so the edit can be approved.
 */
export async function saveStageEdit(
  projectId: string,
  stage: string,
  jsonText: string,
): Promise<ActionResult<{ snapshot: PipelineSnapshot }>> {
  const idParsed = ProjectIdInput.safeParse(projectId);
  const stageParsed = GeneratableStageInput.safeParse(stage);
  if (!idParsed.success || !stageParsed.success) return fail('NOT_FOUND', 'Project or stage not found.');
  if (typeof jsonText !== 'string' || jsonText.length > 200_000) {
    return fail('INVALID_EDIT', 'Edit not saved.', { reason: 'The edited text is empty or too large.' });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return fail('INVALID_EDIT', 'Edit not saved — invalid JSON.', {
      reason: err instanceof Error ? err.message : 'JSON parse error.',
      suggestedAction: 'Fix the JSON syntax and save again.',
    });
  }

  const st = stageParsed.data;
  const validated = STAGE_SCHEMAS[st].safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues
      .map((i) => `- ${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`)
      .join('\n');
    return fail('INVALID_EDIT', 'Edit not saved — validation failed.', {
      reason: issues,
      suggestedAction: 'Fix the highlighted fields so the JSON matches the stage schema, then save again.',
    });
  }

  const project = await loadProject(idParsed.data);
  if (!project) return fail('NOT_FOUND', 'Project not found.');

  const raw = safeParseData(project.data);
  raw[st] = validated.data;
  const gates = setGate(normalizeGates(raw.gates), st, 'review');
  raw.gates = gates;
  const projectStage = headlineStage(gates);
  await db.project.update({
    where: { id: idParsed.data },
    data: { data: JSON.stringify(raw), stage: projectStage },
  });

  const info = await resolveProviderInfo();
  const snapshot = buildSnapshot(
    { ...project, data: JSON.stringify(raw), stage: projectStage },
    info.name,
    info.model,
    info.configured,
  );
  return { ok: true, data: { snapshot } };
}

/** Update the cost-control limits for a project. */
export async function updateLimits(
  projectId: string,
  input: unknown,
): Promise<ActionResult<{ snapshot: PipelineSnapshot }>> {
  const idParsed = ProjectIdInput.safeParse(projectId);
  const limitsParsed = UpdateLimitsInput.safeParse(input);
  if (!idParsed.success || !limitsParsed.success) {
    return fail('INVALID_EDIT', 'Limits not saved.', { reason: 'Invalid limit values.' });
  }

  const project = await loadProject(idParsed.data);
  if (!project) return fail('NOT_FOUND', 'Project not found.');

  const raw = safeParseData(project.data);
  raw.limits = { ...resolveLimits(raw.limits), ...limitsParsed.data };
  await db.project.update({ where: { id: idParsed.data }, data: { data: JSON.stringify(raw) } });

  const info = await resolveProviderInfo();
  const snapshot = buildSnapshot(
    { ...project, data: JSON.stringify(raw) },
    info.name,
    info.model,
    info.configured,
  );
  return { ok: true, data: { snapshot } };
}

/** Keep the UI honest: which gate statuses a stage card may show. */
export type { GateStatus };
