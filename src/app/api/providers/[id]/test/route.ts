import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAIProvider, PROVIDER_TYPES } from '@/lib/providers/registry';
import {
  StubImageProvider,
  StubSearchProvider,
  StubTTSProvider,
  StubVideoProvider,
} from '@/lib/providers/stubs';
import type { ProviderTestResult } from '@/lib/providers/types';
import { errorJson, maskProviderConfig } from '../../../_lib';

export const runtime = 'nodejs';

/**
 * POST /api/providers/[id]/test — runs testConnection for the provider,
 * persists lastStatus/lastTestedAt/lastError, and returns the result.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const row = await db.providerConfig.findFirst({
      where: { OR: [{ providerId: id }, { id }] },
    });
    if (!row) {
      return errorJson('Provider not found.', 'PROVIDER_NOT_FOUND', 404);
    }

    const capability = PROVIDER_TYPES[row.providerId] ?? row.providerId;
    let result: ProviderTestResult;
    switch (capability) {
      case 'ai': {
        const provider = await getAIProvider();
        result = await provider.testConnection();
        break;
      }
      case 'video':
        result = await new StubVideoProvider().testConnection();
        break;
      case 'image':
        result = await new StubImageProvider().testConnection();
        break;
      case 'tts':
        result = await new StubTTSProvider().testConnection();
        break;
      case 'search':
        result = await new StubSearchProvider().testConnection();
        break;
      default:
        result = {
          status: 'not_configured',
          message: `${row.displayName} provider not configured.`,
        };
    }

    const updated = await db.providerConfig.update({
      where: { id: row.id },
      data: {
        lastStatus: result.status,
        lastTestedAt: new Date(),
        lastError: result.status === 'connected' ? '' : result.message,
      },
    });

    return NextResponse.json({
      status: result.status,
      message: result.message,
      latencyMs: result.latencyMs,
      provider: maskProviderConfig(updated),
    });
  } catch {
    return errorJson('Provider test failed.', 'PROVIDER_TEST_FAILED');
  }
}
