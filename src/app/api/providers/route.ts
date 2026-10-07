import { NextResponse } from 'next/server';
import { getProviderStatusList } from '@/lib/providers/registry';
import { errorJson } from '../_lib';

export const runtime = 'nodejs';

/** GET /api/providers — masked provider list (no keys, encrypted or raw). */
export async function GET() {
  try {
    const providers = await getProviderStatusList();
    return NextResponse.json({ providers });
  } catch {
    return errorJson('Failed to load providers.', 'PROVIDERS_LIST_FAILED');
  }
}
