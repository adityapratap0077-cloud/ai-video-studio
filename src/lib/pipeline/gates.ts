/**
 * Pure gate logic for the AI Video Studio pipeline.
 *
 * Gates are the human approval checkpoints between stages. These functions
 * are intentionally pure (no DB, no network) so they can be unit-tested.
 */
import { z } from 'zod';
import { PipelineStageSchema, StageGateSchema, type PipelineStage } from './schemas';

/** Per-stage approval state for human gates. */
export type StageGate = z.infer<typeof StageGateSchema>;

export type GateStatus = StageGate['status'];

/** Canonical stage order, idea first. Phase 2 owns up to 'shots'. */
export const STAGE_ORDER: PipelineStage[] = PipelineStageSchema.options;

/** Stages the Phase 2 actions can generate. */
export const GENERATABLE_STAGES: PipelineStage[] = [
  'research',
  'script',
  'storyboard',
  'shots',
];

/** All gates pending, stamped with `now`. */
export function defaultGates(now: string = new Date().toISOString()): Record<PipelineStage, StageGate> {
  const gates = {} as Record<PipelineStage, StageGate>;
  for (const stage of STAGE_ORDER) {
    gates[stage] = { status: 'pending', updatedAt: now };
  }
  return gates;
}

const GATE_STATUSES: GateStatus[] = ['pending', 'generating', 'review', 'approved', 'skipped'];

function isGateStatus(value: unknown): value is GateStatus {
  return GATE_STATUSES.includes(value as GateStatus);
}

/**
 * Merge stored gates with defaults: unknown/missing stages become pending,
 * malformed entries are repaired. Never throws on bad input.
 */
export function normalizeGates(raw: unknown): Record<PipelineStage, StageGate> {
  const base = defaultGates();
  if (typeof raw !== 'object' || raw === null) return base;
  const record = raw as Record<string, unknown>;
  for (const stage of STAGE_ORDER) {
    const entry = record[stage];
    if (typeof entry !== 'object' || entry === null) continue;
    const { status, updatedAt } = entry as { status?: unknown; updatedAt?: unknown };
    if (isGateStatus(status)) {
      base[stage] = {
        status,
        updatedAt: typeof updatedAt === 'string' ? updatedAt : base[stage].updatedAt,
      };
    }
  }
  return base;
}

/**
 * A stage is unlocked when every earlier stage (after idea) is approved or
 * skipped. Idea itself is always unlocked.
 */
export function isUnlocked(stage: PipelineStage, gates: Record<PipelineStage, StageGate>): boolean {
  if (stage === 'idea') return true;
  const idx = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER.slice(1, idx).every(
    (s) => gates[s].status === 'approved' || gates[s].status === 'skipped',
  );
}

/** Whether the Generate/Regenerate button should be enabled for a stage. */
export function canGenerate(stage: PipelineStage, gates: Record<PipelineStage, StageGate>): boolean {
  if (!GENERATABLE_STAGES.includes(stage)) return false;
  return isUnlocked(stage, gates);
}

/**
 * Headline stage for the stepper: the first stage that is not yet passed
 * (approved/skipped), i.e. where the user's attention should be.
 */
export function headlineStage(gates: Record<PipelineStage, StageGate>): PipelineStage {
  for (const stage of STAGE_ORDER) {
    const status = gates[stage].status;
    if (status !== 'approved' && status !== 'skipped') return stage;
  }
  return 'export';
}

/** Stamp a gate with a new status. */
export function setGate(
  gates: Record<PipelineStage, StageGate>,
  stage: PipelineStage,
  status: GateStatus,
  now: string = new Date().toISOString(),
): Record<PipelineStage, StageGate> {
  return { ...gates, [stage]: { status, updatedAt: now } };
}
