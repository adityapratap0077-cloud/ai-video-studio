import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { errorJson, maskProviderConfig } from '../../_lib';

export const runtime = 'nodejs';

const PatchProviderBody = z.object({
  apiKey: z.string().min(1).max(4000).optional(),
  model: z.string().max(200).optional(),
});

/**
 * PATCH /api/providers/[id] — body { apiKey?: string, model?: string }.
 * Encrypts apiKey into encryptedKey, stores the last 4 chars as keyHint,
 * and returns the masked record. Never echoes the key.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorJson('Invalid JSON body.', 'INVALID_JSON', 400);
  }
  const parsed = PatchProviderBody.safeParse(raw);
  if (!parsed.success) {
    return errorJson('Invalid request body.', 'INVALID_BODY', 400);
  }

  try {
    const row = await db.providerConfig.findFirst({
      where: { OR: [{ providerId: id }, { id }] },
    });
    if (!row) {
      return errorJson('Provider not found.', 'PROVIDER_NOT_FOUND', 404);
    }

    const data: {
      encryptedKey?: string;
      keyHint?: string;
      model?: string;
      lastStatus?: string;
      lastError?: string;
    } = {};
    if (parsed.data.apiKey !== undefined) {
      data.encryptedKey = encrypt(parsed.data.apiKey);
      data.keyHint = parsed.data.apiKey.slice(-4);
      // Key changed: previous test status is stale.
      data.lastStatus = 'not_configured';
      data.lastError = '';
    }
    if (parsed.data.model !== undefined) {
      data.model = parsed.data.model;
    }

    const updated = await db.providerConfig.update({
      where: { id: row.id },
      data,
    });
    return NextResponse.json({ provider: maskProviderConfig(updated) });
  } catch {
    return errorJson('Failed to update provider.', 'PROVIDER_UPDATE_FAILED');
  }
}
