import { describe, it, expect, vi } from 'vitest';
import { DEMO_PROJECT, seedDemoProject } from './demo-data';

describe('DEMO_PROJECT', () => {
  it('has the expected name, idea and settings', () => {
    expect(DEMO_PROJECT.name).toBe('What If the Ocean Disappeared?');
    expect(DEMO_PROJECT.idea).toContain('30-second');
    expect(DEMO_PROJECT.settings).toMatchObject({
      platform: 'YouTube Shorts',
      durationSec: 30,
      aspectRatio: '9:16',
      language: 'English',
    });
  });

  it('has exactly 7 scenes, numbered sequentially', () => {
    expect(DEMO_PROJECT.scenes).toHaveLength(7);
    DEMO_PROJECT.scenes.forEach((scene, i) => {
      expect(scene.n).toBe(i + 1);
      expect(scene.title).toBeTruthy();
      expect(scene.narration).toBeTruthy();
      expect(scene.visual).toBeTruthy();
      expect(scene.camera).toBeTruthy();
      expect(scene.mood).toBeTruthy();
    });
  });

  it('scene durations are sequential and non-overlapping', () => {
    const { scenes, settings } = DEMO_PROJECT;
    const first = scenes[0]!;
    expect(first.durationSec[0]).toBe(0);

    for (let i = 0; i < scenes.length; i++) {
      const [start, end] = scenes[i]!.durationSec;
      expect(start).toBeLessThan(end);
      if (i > 0) {
        const prevEnd = scenes[i - 1]!.durationSec[1];
        expect(start).toBe(prevEnd); // no gaps, no overlaps
      }
    }

    const last = scenes[scenes.length - 1]!;
    expect(last.durationSec[1]).toBe(settings.durationSec);
  });

  it('script has hook, body and ending', () => {
    expect(DEMO_PROJECT.script.hook).toBeTruthy();
    expect(DEMO_PROJECT.script.body).toBeTruthy();
    expect(DEMO_PROJECT.script.ending).toBeTruthy();
    expect(DEMO_PROJECT.script.estimatedSec).toBe(30);
  });

  it('research has summary, key facts, claims and sources', () => {
    const { research } = DEMO_PROJECT;
    expect(research.summary).toBeTruthy();
    expect(research.keyFacts.length).toBeGreaterThanOrEqual(3);
    expect(research.claims).toHaveLength(3);
    for (const claim of research.claims) {
      expect(['high', 'medium', 'low']).toContain(claim.confidence);
      expect(claim.note).toBeTruthy();
    }
    expect(research.sources.length).toBeGreaterThanOrEqual(2);
    for (const source of research.sources) {
      expect(source.title).toBeTruthy();
      expect(source.url).toMatch(/^https:\/\//);
    }
    expect(research.aiNote).toContain('demo mode');
  });

  it('contains no lorem ipsum placeholder text', () => {
    const json = JSON.stringify(DEMO_PROJECT).toLowerCase();
    expect(json).not.toContain('lorem ipsum');
  });
});

describe('seedDemoProject', () => {
  it('creates the demo project when none exists', async () => {
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'demo-1' }),
      },
    };

    await seedDemoProject(prisma);

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { isDemo: true },
    });
    expect(prisma.project.create).toHaveBeenCalledTimes(1);
    const data = prisma.project.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      name: DEMO_PROJECT.name,
      isDemo: true,
      stage: 'storyboard',
    });
    expect(data.data).toBe(DEMO_PROJECT);
  });

  it('does nothing when a demo project already exists', async () => {
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: 'demo-existing' }),
        create: vi.fn(),
      },
    };

    await seedDemoProject(prisma);

    expect(prisma.project.create).not.toHaveBeenCalled();
  });
});
