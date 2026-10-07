/**
 * Shared helpers for API routes: JSON error envelopes, secret-safe
 * serialization of provider rows and projects.
 */
import { NextResponse } from 'next/server';
import type { Project, ProviderConfig } from '@prisma/client';
import {
  PROVIDER_TYPES,
  type ProviderStatusEntry,
} from '@/lib/providers/registry';

/** Standard error envelope: { error: { message, code } }. */
export function errorJson(message: string, code: string, status = 500) {
  return NextResponse.json({ error: { message, code } }, { status });
}

/** Masked provider row for client responses — never includes keys. */
export function maskProviderConfig(row: ProviderConfig): ProviderStatusEntry {
  return {
    id: row.id,
    providerId: row.providerId,
    displayName: row.displayName,
    type: PROVIDER_TYPES[row.providerId] ?? 'unknown',
    model: row.model,
    isActive: row.isActive,
    lastStatus: row.lastStatus,
    lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    lastError: row.lastError,
    keyHint: row.keyHint,
    hasKey: row.encryptedKey.length > 0,
  };
}

/** Parses a JSON-object string column; returns {} on bad data. */
export function safeParseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/** Project row with the settings/data JSON columns parsed to objects. */
export function serializeProject(project: Project) {
  return {
    ...project,
    settings: safeParseJsonObject(project.settings),
    data: safeParseJsonObject(project.data),
  };
}
