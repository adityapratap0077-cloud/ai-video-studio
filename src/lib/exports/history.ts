/**
 * Export history: { id, timestamp, type, path } records stored in
 * Project.data.exports.
 *
 * The `exports` key is NOT part of the Phase-2 ProjectDataSchema — it is
 * read/written as a plain JSON array (passthrough), so Phase 2 parsing
 * keeps working unchanged. Validation here is done with a small local
 * zod schema that strips unknown fields.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { readProjectData, writeProjectData } from '@/lib/assets/store';

export const ExportRecordSchema = z.object({
  id: z.string(),
  /** ISO timestamp of when the export was produced. */
  timestamp: z.string(),
  /** What was produced: mp4 | package | srt | script | storyboard | json */
  type: z.string(),
  /** Path relative to ASSET_DIR (or "generated" for on-the-fly files). */
  path: z.string(),
  /** Human label shown in the UI. */
  label: z.string().optional(),
});

export type ExportRecord = z.infer<typeof ExportRecordSchema>;

const EXPORT_TYPES = new Set(['mp4', 'package', 'srt', 'script', 'storyboard', 'json']);

export async function listExports(projectId: string): Promise<ExportRecord[]> {
  const data = await readProjectData(projectId);
  const raw = Array.isArray(data.exports) ? data.exports : [];
  const records: ExportRecord[] = [];
  for (const entry of raw) {
    const parsed = ExportRecordSchema.safeParse(entry);
    if (parsed.success) records.push(parsed.data);
  }
  return records.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

/** Append an export record; returns the stored record. */
export async function recordExport(
  projectId: string,
  entry: { type: string; path: string; label?: string },
): Promise<ExportRecord> {
  if (!EXPORT_TYPES.has(entry.type)) {
    throw new Error(`Unknown export type: ${entry.type}`);
  }
  const data = await readProjectData(projectId);
  const raw = Array.isArray(data.exports) ? data.exports : [];
  const record: ExportRecord = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: entry.type,
    path: entry.path,
    ...(entry.label ? { label: entry.label } : {}),
  };
  raw.push(record);
  data.exports = raw;
  await writeProjectData(projectId, data);
  return record;
}
