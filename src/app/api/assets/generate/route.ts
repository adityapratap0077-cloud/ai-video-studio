/**
 * POST /api/assets/generate
 *
 * Body: { projectId, sceneId?, type: "image" | "video" | "audio", prompt }
 *
 * Routes the request to the matching media-provider interface (image /
 * video / TTS). Today those interfaces are stubs: when no provider key is
 * configured the response is an honest 501 PROVIDER_NOT_CONFIGURED.
 * Phase 4/5 agents implement the real providers behind the same
 * interfaces — this endpoint needs no changes for that.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorJson } from '@/app/api/_lib';
import {
  StubImageProvider,
  StubTTSProvider,
  StubVideoProvider,
} from '@/lib/providers/stubs';
import { ProviderNotConfiguredError } from '@/lib/providers/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GenerateBody = z.object({
  projectId: z.string().min(1).max(64),
  sceneId: z.string().max(200).optional(),
  type: z.enum(['image', 'video', 'audio']),
  prompt: z.string().min(1).max(5000),
});

const PROVIDER_ID_BY_TYPE = {
  image: 'image',
  video: 'video',
  audio: 'tts',
} as const;

const PROVIDER_LABEL = {
  image: 'Image',
  video: 'Video',
  audio: 'Voiceover (TTS)',
} as const;

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorJson('Invalid JSON body.', 'INVALID_JSON', 400);
  }
  const parsed = GenerateBody.safeParse(raw);
  if (!parsed.success) {
    return errorJson('Invalid request body.', 'INVALID_BODY', 400);
  }
  const { projectId, type, prompt } = parsed.data;

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) {
    return errorJson('Project not found.', 'PROJECT_NOT_FOUND', 404);
  }

  const providerId = PROVIDER_ID_BY_TYPE[type];
  const label = PROVIDER_LABEL[type];

  // Phase 4/5 hook: when a real provider row exists AND a real
  // implementation is registered, call it. Until then the stubs below
  // throw ProviderNotConfiguredError and we answer honestly.
  let row: { encryptedKey: string } | null = null;
  try {
    row = await db.providerConfig.findUnique({
      where: { providerId },
      select: { encryptedKey: true },
    });
  } catch {
    row = null;
  }

  try {
    if (!row || row.encryptedKey.length === 0) {
      throw new ProviderNotConfiguredError(label);
    }
    // A key exists but no generation implementation is registered yet.
    // Route through the interface so Phase 4/5 only swaps the impl.
    const provider =
      type === 'image'
        ? new StubImageProvider()
        : type === 'video'
          ? new StubVideoProvider()
          : new StubTTSProvider();
    if (type === 'image') {
      await (provider as StubImageProvider).generateImage({ prompt });
    } else if (type === 'video') {
      await (provider as StubVideoProvider).generateVideo({ prompt });
    } else {
      await (provider as StubTTSProvider).generateSpeech({ text: prompt });
    }
    // Unreachable while stubs throw — kept for the Phase 4/5 handoff.
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.json(
        {
          error: {
            message: `${label} provider is not configured. Add an API key under Providers to enable ${label.toLowerCase()} generation.`,
            code: 'PROVIDER_NOT_CONFIGURED',
            providerId,
          },
        },
        { status: 501 },
      );
    }
    return errorJson('Generation failed.', 'GENERATION_FAILED');
  }
}
