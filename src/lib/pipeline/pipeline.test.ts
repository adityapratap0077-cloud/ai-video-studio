/**
 * Phase 2 pipeline tests: schema contracts, JSON extraction + retry logic,
 * gate transitions, and duration parsing.
 *
 * No real API calls: runGeneration takes an injected `generate` function.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ResearchBriefSchema,
  ScriptSchema,
  StoryboardSchema,
  ShotPromptsSchema,
} from './schemas';
import { extractJsonObject, runGeneration } from './generate';
import {
  defaultGates,
  normalizeGates,
  isUnlocked,
  canGenerate,
  headlineStage,
  setGate,
  STAGE_ORDER,
} from './gates';
import { RESEARCH_JSON_SHAPE } from './prompts';
import type { TextGenResult } from '@/lib/providers/types';

/* ------------------------------------------------------------------ */
/* Schema validation                                                   */
/* ------------------------------------------------------------------ */

const validResearch = {
  summary: 'A brief about sourdough.',
  keyFacts: ['Fermentation takes time.'],
  claims: [{ text: 'Sourdough is leavened by wild yeast.', confidence: 'high', fromResearch: false }],
  potentialInaccuracies: ['Hydration ratios vary by flour.'],
  sources: [],
  provenanceNote: 'Model knowledge only; no web research performed.',
  usedWebResearch: false,
};

describe('ResearchBriefSchema', () => {
  it('accepts a valid brief', () => {
    expect(ResearchBriefSchema.safeParse(validResearch).success).toBe(true);
  });

  it('rejects a brief missing provenanceNote', () => {
    const { provenanceNote: _provenanceNote, ...rest } = validResearch;
    void _provenanceNote;
    const parsed = ResearchBriefSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });

  it('rejects fabricated-looking claim confidence values', () => {
    const bad = {
      ...validResearch,
      claims: [{ text: 'x', confidence: 'certain', fromResearch: false }],
    };
    expect(ResearchBriefSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-URL sources', () => {
    const bad = { ...validResearch, sources: [{ url: 'not-a-url', title: 't' }] };
    expect(ResearchBriefSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ScriptSchema', () => {
  const valid = {
    hook: 'Stop scrolling.',
    body: 'Here is the thing.',
    cta: 'Follow for more.',
    fullText: 'Stop scrolling. Here is the thing. Follow for more.',
    estimatedDurationSec: 12,
  };

  it('accepts a valid script', () => {
    expect(ScriptSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a non-positive duration', () => {
    expect(ScriptSchema.safeParse({ ...valid, estimatedDurationSec: -5 }).success).toBe(false);
    expect(ScriptSchema.safeParse({ ...valid, estimatedDurationSec: 0 }).success).toBe(false);
  });
});

describe('StoryboardSchema', () => {
  const scene = {
    id: 'scene-1',
    index: 0,
    startSec: 0,
    endSec: 4,
    narration: 'Hello.',
    visual: 'A sunrise.',
    camera: 'Slow push-in.',
    mood: 'Hopeful.',
  };

  it('accepts a valid storyboard', () => {
    expect(
      StoryboardSchema.safeParse({ scenes: [scene], totalDurationSec: 4 }).success,
    ).toBe(true);
  });

  it('rejects an empty scene list', () => {
    expect(StoryboardSchema.safeParse({ scenes: [], totalDurationSec: 4 }).success).toBe(false);
  });
});

describe('ShotPromptsSchema', () => {
  const shot = {
    id: 'shot-1',
    sceneId: 'scene-1',
    description: 'Sunrise over hills.',
    videoPrompt: 'Cinematic sunrise, golden light, slow push-in.',
    camera: 'Slow push-in',
    lighting: 'Golden hour',
    environment: 'Rolling hills',
    subject: 'Sunrise',
    motion: 'Slow push-in',
    durationSec: 4,
    aspectRatio: '9:16',
  };

  it('accepts a valid shot (negativePrompt and lens optional)', () => {
    expect(ShotPromptsSchema.safeParse({ shots: [shot] }).success).toBe(true);
  });

  it('rejects a shot missing videoPrompt', () => {
    const { videoPrompt: _videoPrompt, ...rest } = shot;
    void _videoPrompt;
    expect(ShotPromptsSchema.safeParse({ shots: [rest] }).success).toBe(false);
  });

  it('rejects an invalid aspect ratio', () => {
    expect(
      ShotPromptsSchema.safeParse({ shots: [{ ...shot, aspectRatio: '4:3' }] }).success,
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* JSON extraction                                                     */
/* ------------------------------------------------------------------ */

describe('extractJsonObject', () => {
  it('parses plain JSON', () => {
    const res = extractJsonObject('{"a": 1}');
    expect(res).toEqual({ ok: true, value: { a: 1 } });
  });

  it('strips ```json fences', () => {
    const res = extractJsonObject('Here you go:\n```json\n{"a": 1}\n```\nDone.');
    expect(res).toEqual({ ok: true, value: { a: 1 } });
  });

  it('strips bare ``` fences', () => {
    const res = extractJsonObject('```\n{"a": 2}\n```');
    expect(res).toEqual({ ok: true, value: { a: 2 } });
  });

  it('reports when no JSON object is present', () => {
    const res = extractJsonObject('just some prose, no braces at all');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/No JSON object/);
  });

  it('reports malformed JSON', () => {
    const res = extractJsonObject('{"a": }');
    expect(res.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Retry logic                                                         */
/* ------------------------------------------------------------------ */

const researchResult = (text: string): TextGenResult => ({ text, model: 'test-model' });

describe('runGeneration', () => {
  const baseArgs = {
    stageLabel: 'Research',
    systemPrompt: 'sys',
    userPrompt: 'user',
    jsonShape: RESEARCH_JSON_SHAPE,
    schema: ResearchBriefSchema,
  } as const;

  it('succeeds on the first attempt', async () => {
    const generate = vi.fn(async () => researchResult(JSON.stringify(validResearch)));
    const res = await runGeneration({ ...baseArgs, generate, maxRetries: 2 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.attempts).toBe(1);
      expect(res.model).toBe('test-model');
      expect(res.data.summary).toBe(validResearch.summary);
    }
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('retries with a fix-JSON prompt after invalid JSON, then succeeds', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce(researchResult('not json at all'))
      .mockResolvedValueOnce(researchResult(JSON.stringify(validResearch)));
    const res = await runGeneration({ ...baseArgs, generate, maxRetries: 2 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.attempts).toBe(2);
    expect(generate).toHaveBeenCalledTimes(2);
    // Second call carries the repair prompt.
    const secondPrompt = generate.mock.calls[1][0].prompt as string;
    expect(secondPrompt).toMatch(/not usable/i);
  });

  it('retries after schema validation failure, then succeeds', async () => {
    const invalid = JSON.stringify({ ...validResearch, provenanceNote: 42 });
    const generate = vi.fn()
      .mockResolvedValueOnce(researchResult(invalid))
      .mockResolvedValueOnce(researchResult(JSON.stringify(validResearch)));
    const res = await runGeneration({ ...baseArgs, generate, maxRetries: 2 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.attempts).toBe(2);
  });

  it('fails after exhausting maxRetries', async () => {
    const generate = vi.fn(async () => researchResult('still not json'));
    const res = await runGeneration({ ...baseArgs, generate, maxRetries: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.attempts).toBe(2);
      expect(res.error.message).toMatch(/after 2 attempts/);
    }
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('lets provider errors propagate to the caller', async () => {
    const generate = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(runGeneration({ ...baseArgs, generate, maxRetries: 2 })).rejects.toThrow('boom');
  });
});

/* ------------------------------------------------------------------ */
/* Gate transitions                                                    */
/* ------------------------------------------------------------------ */

describe('gates', () => {
  it('defaultGates starts everything at pending', () => {
    const gates = defaultGates('2026-01-01T00:00:00.000Z');
    for (const stage of STAGE_ORDER) {
      expect(gates[stage].status).toBe('pending');
    }
  });

  it('research is always unlocked; script waits for research approval', () => {
    const gates = defaultGates();
    expect(isUnlocked('research', gates)).toBe(true);
    expect(isUnlocked('script', gates)).toBe(false);
    expect(canGenerate('script', gates)).toBe(false);
  });

  it('approving research unlocks script, and skipped counts as passed', () => {
    let gates = setGate(defaultGates(), 'research', 'approved');
    expect(isUnlocked('script', gates)).toBe(true);
    expect(isUnlocked('storyboard', gates)).toBe(false);

    gates = setGate(gates, 'script', 'skipped');
    expect(isUnlocked('storyboard', gates)).toBe(true);
    // review does not unlock
    gates = setGate(gates, 'storyboard', 'review');
    expect(isUnlocked('shots', gates)).toBe(false);
  });

  it('phase 3 stages are not generatable by phase 2 actions', () => {
    const gates = defaultGates();
    expect(canGenerate('assets', gates)).toBe(false);
    expect(canGenerate('timeline', gates)).toBe(false);
    expect(canGenerate('idea', gates)).toBe(false);
  });

  it('headlineStage points at the first unfinished stage', () => {
    let gates = defaultGates();
    gates.idea = { status: 'approved', updatedAt: gates.idea.updatedAt };
    expect(headlineStage(gates)).toBe('research');
    gates = setGate(gates, 'research', 'approved');
    expect(headlineStage(gates)).toBe('script');
    gates = setGate(gates, 'script', 'skipped');
    expect(headlineStage(gates)).toBe('storyboard');
  });

  it('normalizeGates repairs garbage without throwing', () => {
    const gates = normalizeGates({ research: { status: 'bogus' }, nope: 1, script: null });
    expect(gates.research.status).toBe('pending');
    expect(gates.script.status).toBe('pending');
    expect(normalizeGates(null).shots.status).toBe('pending');
    expect(normalizeGates('garbage').shots.status).toBe('pending');
  });

  it('normalizeGates keeps valid stored gates', () => {
    const gates = normalizeGates({
      research: { status: 'approved', updatedAt: '2026-05-01T00:00:00.000Z' },
    });
    expect(gates.research).toEqual({ status: 'approved', updatedAt: '2026-05-01T00:00:00.000Z' });
  });
});
