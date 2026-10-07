/**
 * Demo project content for AI Video Studio.
 *
 * Everything in this file is hand-written SAMPLE content for demo mode —
 * realistic in tone, but not the product of real research or generation.
 * The backend stores this object as JSON in `Project.data`.
 */

export interface DemoScene {
  n: number;
  title: string;
  durationSec: [number, number];
  narration: string;
  visual: string;
  camera: string;
  mood: string;
}

type Confidence = 'high' | 'medium' | 'low';

export const DEMO_PROJECT = {
  name: 'What If the Ocean Disappeared?',
  idea: 'Create a 30-second cinematic video explaining what would happen if the ocean suddenly disappeared.',
  settings: {
    platform: 'YouTube Shorts',
    durationSec: 30,
    aspectRatio: '9:16',
    language: 'English',
    tone: 'dramatic',
    audience: 'general',
    visualStyle: 'cinematic documentary',
  },
  research: {
    summary:
      'Demo research summary: the ocean covers about 71% of Earth\u2019s surface and holds roughly 97% of the planet\u2019s water. It drives the water cycle through evaporation, absorbs the majority of excess heat trapped by greenhouse gases, and its currents redistribute warmth around the globe. Marine phytoplankton produce a large share of the oxygen in every breath we take. If the ocean vanished overnight, coastlines would become dry seabeds, rainfall would stall, and temperature extremes would intensify.',
    keyFacts: [
      'The ocean covers about 71% of Earth\u2019s surface and holds roughly 97% of all water on the planet (demo figure, after NOAA).',
      'Oceans absorb around 90% of the excess heat trapped by greenhouse gases, acting as the planet\u2019s main heat buffer (demo figure, after NASA).',
      'Marine phytoplankton generate roughly half of the oxygen in Earth\u2019s atmosphere through photosynthesis (demo figure, after NOAA).',
      'About 86% of global evaporation comes from the ocean surface, feeding the clouds and rainfall that water crops worldwide (demo figure).',
    ],
    claims: [
      {
        claim: 'Coastal cities would be left staring at dry seabeds stretching to the horizon.',
        confidence: 'high' as Confidence,
        note: 'Demo claim: follows directly from ocean bathymetry — remove the water and the continental shelf is exposed.',
      },
      {
        claim: 'Global rainfall patterns would stall within days to weeks.',
        confidence: 'medium' as Confidence,
        note: 'Demo claim: evaporation is the engine of the water cycle, but exact timing depends on atmospheric moisture already aloft.',
      },
      {
        claim: 'Atmospheric oxygen levels would measurably decline within a single year.',
        confidence: 'low' as Confidence,
        note: 'Demo claim: the atmospheric oxygen reservoir is enormous, so a one-year dip would likely be too small to measure.',
      },
    ],
    sources: [
      {
        title: 'NOAA Ocean Service — How much water is in the ocean?',
        url: 'https://oceanservice.noaa.gov/facts/oceanwater.html',
      },
      {
        title: 'NASA Climate — The ocean and climate change',
        url: 'https://climate.nasa.gov/',
      },
      {
        title: 'NOAA — Phytoplankton and the oxygen we breathe',
        url: 'https://www.noaa.gov/',
      },
    ],
    aiNote:
      'Generated from model knowledge in demo mode \u2014 no web research was performed. Source links above are illustrative placeholders pointing at well-known publishers; verify every fact and URL before production use.',
  },
  script: {
    hook: 'What if you woke up tomorrow\u2026 and the ocean was gone? Not dried up over centuries \u2014 gone overnight. Every sea, every wave, vanished.',
    body: 'Coastal cities would stare out over empty seabeds stretching to the horizon. Ships would rest on plains of mud. Within days, the rain cycle would stall \u2014 no evaporation, no clouds, no rain. Crops would fail. Temperatures would swing wildly, because the ocean soaks up the heat that keeps our climate stable. And half the oxygen in the breath you just took? It came from the sea.',
    ending:
      'The ocean isn\u2019t just water. It\u2019s the planet\u2019s life support. Lose it, and we don\u2019t get a second take.',
    estimatedSec: 30,
  },
  scenes: [
    {
      n: 1,
      title: 'The Vanishing',
      durationSec: [0, 4] as [number, number],
      narration:
        'What if you woke up tomorrow\u2026 and the ocean was gone?',
      visual:
        'Demo visual: aerial shot of a coastline at dawn as the sea visibly recedes, exposing wet sand far beyond the old shoreline.',
      camera: 'Slow aerial pull-back, high angle, gentle drift left.',
      mood: 'Ominous, unreal quiet.',
    },
    {
      n: 2,
      title: 'Gone Overnight',
      durationSec: [4, 8] as [number, number],
      narration:
        'Not dried up over centuries \u2014 gone overnight. Every sea, every wave, vanished.',
      visual:
        'Demo visual: split-screen timelapse \u2014 a full harbor on the left, the same harbor as a dry basin on the right.',
      camera: 'Locked-off wide shot; hard cut between the two halves.',
      mood: 'Shocking, stark.',
    },
    {
      n: 3,
      title: 'Empty Seabeds',
      durationSec: [8, 13] as [number, number],
      narration:
        'Coastal cities would stare out over empty seabeds stretching to the horizon. Ships would rest on plains of mud.',
      visual:
        'Demo visual: cargo ships tilted on cracked mud flats, seabirds circling, a distant city skyline on the horizon.',
      camera: 'Low dolly move across the mud flats toward the stranded ships.',
      mood: 'Desolate, post-apocalyptic.',
    },
    {
      n: 4,
      title: 'The Sky Dries',
      durationSec: [13, 17] as [number, number],
      narration:
        'Within days, the rain cycle would stall \u2014 no evaporation, no clouds, no rain.',
      visual:
        'Demo visual: clouds thinning and dissolving over parched farmland; cracked earth filling the frame.',
      camera: 'Slow tilt down from the empty sky to the cracked soil.',
      mood: 'Bleak, thirsty.',
    },
    {
      n: 5,
      title: 'Heat Unleashed',
      durationSec: [17, 21] as [number, number],
      narration:
        'Crops would fail. Temperatures would swing wildly, because the ocean soaks up the heat that keeps our climate stable.',
      visual:
        'Demo visual: heat shimmer rising off a dead wheat field; a split thermometer graphic swinging between extremes.',
      camera: 'Handheld-style push-in through the ruined field.',
      mood: 'Oppressive, urgent.',
    },
    {
      n: 6,
      title: 'Last Breath',
      durationSec: [21, 26] as [number, number],
      narration:
        'And half the oxygen in the breath you just took? It came from the sea.',
      visual:
        'Demo visual: macro shot of glowing phytoplankton drifting in dark water, fading to black as the light dies.',
      camera: 'Extreme close-up, slow drift; light dims to darkness.',
      mood: 'Intimate, fragile.',
    },
    {
      n: 7,
      title: 'Life Support',
      durationSec: [26, 30] as [number, number],
      narration:
        'The ocean isn\u2019t just water. It\u2019s the planet\u2019s life support. Lose it, and we don\u2019t get a second take.',
      visual:
        'Demo visual: Earth from space \u2014 the blue marble slowly desaturating as oceans drain away, then a hard cut to black.',
      camera: 'Slow orbital pull-away from Earth, then cut to black.',
      mood: 'Somber, final.',
    },
  ] as DemoScene[],
};

/**
 * Seeds the demo project row if none exists.
 * `prisma` is typed as `any` to avoid coupling this module to the
 * generated Prisma client.
 */
interface PrismaSeedClient {
  project: {
    findFirst(args: { where: { isDemo: boolean } }): Promise<{ id: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}
export async function seedDemoProject(prisma: PrismaSeedClient): Promise<void> {
  const existing = await prisma.project.findFirst({ where: { isDemo: true } });
  if (existing) return;
  await prisma.project.create({
    data: {
      name: DEMO_PROJECT.name,
      isDemo: true,
      stage: 'storyboard',
      data: DEMO_PROJECT,
    },
  });
}
