/**
 * Action-layer integration tests: generation flow, gates, edits and limits
 * against the real test SQLite DB (file:./test.db) with a mocked AI
 * provider. No network calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/providers/registry', () => ({
  getAIProvider: vi.fn(),
  getSearchProvider: vi.fn(),
}));
vi.mock('@/lib/providers/config', () => ({
  getProviderApiKey: vi.fn(),
}));

import { db } from '@/lib/db';
import { StubSearchProvider } from '@/lib/providers/stubs';
import { ProviderNotConfiguredError } from '@/lib/providers/types';
import { getAIProvider, getSearchProvider } from '@/lib/providers/registry';
import { getProviderApiKey } from '@/lib/providers/config';
import {
  generateResearch,
  generateScript,
  generateStoryboard,
  generateShots,
  approveStage,
  skipStage,
  saveStageEdit,
  updateLimits,
  getPipelineState,
} from './actions';

const mockedGetAIProvider = vi.mocked(getAIProvider);
const mockedGetSearchProvider = vi.mocked(getSearchProvider);
const mockedGetProviderApiKey = vi.mocked(getProviderApiKey);

const researchJson = JSON.stringify({
  summary: 'A brief about sourdough.',
  keyFacts: ['Fermentation takes time.'],
  claims: [{ text: 'Sourdough uses wild yeast.', confidence: 'high', fromResearch: false }],
  potentialInaccuracies: [],
  sources: [],
  provenanceNote: 'Model knowledge only.',
  usedWebResearch: false,
});

const scriptJson = JSON.stringify({
  hook: 'Stop scrolling.',
  body: 'Sourdough is alive.',
  cta: 'Follow for more.',
  fullText: 'Stop scrolling. Sourdough is alive. Follow for more.',
  estimatedDurationSec: 999,
  wordsPerMinute: 150,
});

const storyboardJson = JSON.stringify({
  scenes: [
    { id: 'scene-1', index: 0, startSec: 0, endSec: 3, narration: 'Stop scrolling.', visual: 'A loaf.', camera: 'Push-in.', mood: 'Warm.' },
    { id: 'scene-2', index: 1, startSec: 3, endSec: 6, narration: 'Sourdough is alive.', visual: 'Bubbles.', camera: 'Macro.', mood: 'Curious.' },
  ],
  totalDurationSec: 6,
});

const shotsJson = JSON.stringify({
  shots: [
    {
      id: 'shot-1', sceneId: 'scene-1', description: 'Loaf push-in.',
      videoPrompt: 'Cinematic loaf, warm light, slow push-in.',
      camera: 'Push-in', lighting: 'Warm', environment: 'Kitchen',
      subject: 'Sourdough loaf', motion: 'Slow push-in',
      durationSec: 3, aspectRatio: '9:16',
    },
  ],
});

function fakeProvider(textQueue: string[]) {
  const generateText = vi.fn(async () => {
    const text = textQueue.shift() ?? textQueue[textQueue.length - 1];
    return { text, model: 'test-model' };
  });
  return {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'ai' as const,
    generateText,
    testConnection: vi.fn(async () => ({ status: 'connected' as const, message: 'ok' })),
  };
}

let projectId = '';

beforeEach(async () => {
  mockedGetProviderApiKey.mockReset();
  mockedGetAIProvider.mockReset();
  mockedGetSearchProvider.mockReset();
  mockedGetProviderApiKey.mockImplementation(async (id: string) =>
    id === 'openrouter' ? 'test-key' : null,
  );
  mockedGetSearchProvider.mockResolvedValue(new StubSearchProvider());

  const project = await db.project.create({
    data: {
      name: `p2-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      idea: 'A 30 second video about sourdough starter.',
      settings: JSON.stringify({ duration: '30s', aspectRatio: '9:16' }),
    },
  });
  projectId = project.id;
});

afterEach(async () => {
  if (projectId) {
    await db.project.deleteMany({ where: { id: projectId } });
    projectId = '';
  }
});

describe('generateResearch', () => {
  it('generates, validates and stores the brief with gate in review', async () => {
    mockedGetAIProvider.mockResolvedValue(fakeProvider([researchJson]));
    const res = await generateResearch(projectId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.snapshot.pipeline.research?.summary).toBe('A brief about sourdough.');
    expect(res.data.snapshot.pipeline.gates.research.status).toBe('review');
    expect(res.data.snapshot.generationsUsed).toBe(1);
    expect(res.data.model).toBe('test-model');
    // usedWebResearch enforced false when no live search ran
    expect(res.data.snapshot.pipeline.research?.usedWebResearch).toBe(false);
  });

  it('returns NOT_CONFIGURED with the exact UI message when no key is saved', async () => {
    mockedGetProviderApiKey.mockResolvedValue(null);
    mockedGetAIProvider.mockResolvedValue(fakeProvider([researchJson]));
    // getAIProvider mock bypasses the registry, so force the throw path:
    mockedGetAIProvider.mockImplementation(async () => {
      throw new ProviderNotConfiguredError('OpenRouter');
    });
    const res = await generateResearch(projectId);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('NOT_CONFIGURED');
    expect(res.error.message).toBe(
      'AI provider not configured — add your OpenRouter key in Providers.',
    );
  });

  it('returns NOT_FOUND for an unknown project', async () => {
    const res = await generateResearch('nope-not-real');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND');
  });
});

describe('gates across the action layer', () => {
  it('locks script until research is approved, then unlocks', async () => {
    mockedGetAIProvider.mockResolvedValue(fakeProvider([researchJson, scriptJson]));

    const locked = await generateScript(projectId);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error.code).toBe('LOCKED');

    await generateResearch(projectId);
    const approved = await approveStage(projectId, 'research');
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.data.snapshot.pipeline.gates.research.status).toBe('approved');

    const scriptRes = await generateScript(projectId);
    expect(scriptRes.ok).toBe(true);
    if (!scriptRes.ok) return;
    // duration recomputed from words (8 words → 3.2s), not the model's 999
    expect(scriptRes.data.snapshot.pipeline.script?.estimatedDurationSec).toBe(3.2);
  });

  it('runs the full chain to shots with scene caps respected', async () => {
    mockedGetAIProvider.mockResolvedValue(
      fakeProvider([researchJson, scriptJson, storyboardJson, shotsJson]),
    );

    for (const [gen, stage] of [
      [generateResearch, 'research'],
      [generateScript, 'script'],
      [generateStoryboard, 'storyboard'],
      [generateShots, 'shots'],
    ] as const) {
      const r = await gen(projectId);
      expect(r.ok).toBe(true);
      const a = await approveStage(projectId, stage);
      expect(a.ok).toBe(true);
    }

    const state = await getPipelineState(projectId);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.data.snapshot.pipeline.shots?.shots).toHaveLength(1);
    expect(state.data.snapshot.pipeline.shots?.shots[0].sceneId).toBe('scene-1');
    expect(state.data.snapshot.generationsUsed).toBe(4);
  });

  it('skip unlocks the next stage', async () => {
    mockedGetAIProvider.mockResolvedValue(fakeProvider([scriptJson]));
    const skipped = await skipStage(projectId, 'research');
    expect(skipped.ok).toBe(true);
    const scriptRes = await generateScript(projectId);
    expect(scriptRes.ok).toBe(true);
  });

  it('approve rejects a stage that is not in review', async () => {
    const res = await approveStage(projectId, 'research');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('LOCKED');
  });
});

describe('saveStageEdit', () => {
  it('rejects invalid JSON', async () => {
    const res = await saveStageEdit(projectId, 'research', '{oops');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('INVALID_EDIT');
      expect(res.error.message).toMatch(/invalid JSON/i);
    }
  });

  it('rejects JSON that fails schema validation', async () => {
    const res = await saveStageEdit(projectId, 'research', JSON.stringify({ summary: 'x' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('INVALID_EDIT');
  });

  it('saves a valid edit and returns the stage to review', async () => {
    mockedGetAIProvider.mockResolvedValue(fakeProvider([researchJson]));
    await generateResearch(projectId);
    await approveStage(projectId, 'research');

    const edited = JSON.parse(researchJson) as Record<string, unknown>;
    edited.summary = 'Edited summary.';
    const res = await saveStageEdit(projectId, 'research', JSON.stringify(edited));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.snapshot.pipeline.research?.summary).toBe('Edited summary.');
    expect(res.data.snapshot.pipeline.gates.research.status).toBe('review');
  });
});

describe('updateLimits', () => {
  it('saves new limits and enforces maxGenerations', async () => {
    mockedGetAIProvider.mockResolvedValue(fakeProvider([researchJson]));
    const saved = await updateLimits(projectId, { maxGenerations: 1, maxScenes: 5 });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.data.snapshot.pipeline.limits.maxGenerations).toBe(1);
    expect(saved.data.snapshot.pipeline.limits.maxScenes).toBe(5);

    const first = await generateResearch(projectId);
    expect(first.ok).toBe(true);

    const second = await generateResearch(projectId);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('LIMIT_REACHED');
  });

  it('rejects invalid limit values', async () => {
    const res = await updateLimits(projectId, { maxScenes: -3 });
    expect(res.ok).toBe(false);
  });
});
