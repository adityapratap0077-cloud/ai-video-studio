"use client";

/**
 * PipelineBoard: the vertical Phase 2 stage flow for a project.
 * Idea → Research → Script → Storyboard → Shots, then Phase 3 placeholders.
 *
 * Owns all pipeline UI state; every mutation goes through the server
 * actions in @/lib/pipeline/actions and replaces the snapshot from the
 * action's return value (no refetch needed).
 */
import { useCallback, useState } from "react";
import {
  approveStage,
  generateResearch,
  generateScript,
  generateStoryboard,
  generateShots,
  saveStageEdit,
  skipStage,
  updateLimits,
  type PipelineActionError,
  type PipelineSnapshot,
} from "@/lib/pipeline/actions";
import { isUnlocked, STAGE_ORDER } from "@/lib/pipeline/gates";
import { type PipelineStage } from "@/lib/pipeline/schemas";
import { StageCard, type GeneratableStage } from "./StageCard";
import {
  ResearchOutput,
  ScriptOutput,
  StoryboardOutput,
  ShotsOutput,
} from "./stage-output";
import {
  AgentActivityPanel,
  type ActivityStage,
} from "./AgentActivityPanel";
import { LimitsPanel } from "./LimitsPanel";

const STAGE_META: {
  stage: GeneratableStage;
  label: string;
  description: string;
  needsConfirm: boolean;
}[] = [
  {
    stage: "research",
    label: "Research",
    description: "Facts, claims and sources the script can lean on.",
    needsConfirm: false,
  },
  {
    stage: "script",
    label: "Script",
    description: "Hook, body and CTA timed against the target duration.",
    needsConfirm: false,
  },
  {
    stage: "storyboard",
    label: "Storyboard",
    description: "Scene-by-scene boards with visuals, camera and mood.",
    needsConfirm: true,
  },
  {
    stage: "shots",
    label: "Shots",
    description: "Per-shot generation prompts for the video provider.",
    needsConfirm: true,
  },
];

const GENERATORS: Record<GeneratableStage, (id: string) => Promise<unknown>> = {
  research: generateResearch,
  script: generateScript,
  storyboard: generateStoryboard,
  shots: generateShots,
};

const STAGE_LABEL: Record<PipelineStage, string> = {
  idea: "Idea",
  research: "Research",
  script: "Script",
  storyboard: "Storyboard",
  shots: "Shots",
  assets: "Assets",
  timeline: "Timeline",
  export: "Export",
};

const PHASE_OF: Record<PipelineStage, string> = {
  idea: "input",
  research: "Phase 2",
  script: "Phase 2",
  storyboard: "Phase 2",
  shots: "Phase 2",
  assets: "Phase 3",
  timeline: "Phase 3",
  export: "Phase 3",
};

type SnapshotResult = { snapshot: PipelineSnapshot };

function asSnapshot(res: unknown): PipelineSnapshot | null {
  if (
    typeof res === "object" &&
    res !== null &&
    "ok" in res &&
    (res as { ok: boolean }).ok === true
  ) {
    return (res as { ok: true; data: SnapshotResult }).data.snapshot;
  }
  return null;
}

function asError(res: unknown): PipelineActionError | null {
  if (
    typeof res === "object" &&
    res !== null &&
    "ok" in res &&
    (res as { ok: boolean }).ok === false
  ) {
    return (res as { ok: false; error: PipelineActionError }).error;
  }
  return null;
}

export function PipelineBoard({
  projectId,
  idea,
  initialSnapshot,
}: {
  projectId: string;
  idea: string;
  initialSnapshot: PipelineSnapshot;
}) {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot>(initialSnapshot);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, PipelineActionError | null>>({});

  const { pipeline } = snapshot;
  const gates = pipeline.gates;

  const setError = useCallback((key: string, error: PipelineActionError | null) => {
    setErrors((e) => ({ ...e, [key]: error }));
  }, []);

  const apply = useCallback(
    (key: string, res: unknown) => {
      const snap = asSnapshot(res);
      if (snap) {
        setSnapshot(snap);
        setError(key, null);
      } else {
        setError(key, asError(res) ?? {
          code: "GENERATION_FAILED",
          message: "Something went wrong.",
          provider: snapshot.providerName,
          model: snapshot.providerModel,
          reason: "The server action did not return a result.",
          suggestedAction: "Try again.",
        });
      }
      setBusy(null);
    },
    [setError, snapshot.providerName, snapshot.providerModel],
  );

  const onGenerate = useCallback(
    (stage: GeneratableStage) => {
      setBusy(stage);
      setError(stage, null);
      GENERATORS[stage](projectId)
        .then((res) => apply(stage, res))
        .catch(() =>
          apply(stage, {
            ok: false,
            error: {
              code: "GENERATION_FAILED",
              message: "The request failed before reaching the provider.",
              provider: snapshot.providerName,
              model: snapshot.providerModel,
              reason: "Network or server error while calling the server action.",
              suggestedAction: "Check your connection and try again.",
            },
          }),
        );
    },
    [projectId, apply, setError, snapshot.providerName, snapshot.providerModel],
  );

  const onApprove = useCallback(
    (stage: GeneratableStage) => {
      setBusy(stage);
      approveStage(projectId, stage)
        .then((res) => apply(stage, res))
        .catch(() => setBusy(null));
    },
    [projectId, apply],
  );

  const onSkip = useCallback(
    (stage: GeneratableStage) => {
      setBusy(stage);
      skipStage(projectId, stage)
        .then((res) => apply(stage, res))
        .catch(() => setBusy(null));
    },
    [projectId, apply],
  );

  const onSaveEdit = useCallback(
    (stage: GeneratableStage, json: string) => {
      setBusy(stage);
      saveStageEdit(projectId, stage, json)
        .then((res) => apply(stage, res))
        .catch(() => setBusy(null));
    },
    [projectId, apply],
  );

  const onSaveLimits = useCallback(
    (limits: { maxScenes: number; maxRetries: number; maxGenerations: number }) => {
      setBusy("limits");
      updateLimits(projectId, limits)
        .then((res) => apply("limits", res))
        .catch(() => setBusy(null));
    },
    [projectId, apply],
  );

  const lockReasonFor = (stage: GeneratableStage): string | undefined => {
    const idx = STAGE_ORDER.indexOf(stage);
    const blocker = STAGE_ORDER.slice(1, idx).find(
      (s) => gates[s].status !== "approved" && gates[s].status !== "skipped",
    );
    return blocker ? `Approve or skip “${STAGE_LABEL[blocker]}” first.` : undefined;
  };

  const runInfoFor = (stage: GeneratableStage): string | undefined => {
    const run = snapshot.runs[stage];
    if (!run) return undefined;
    const when = new Date(run.at);
    const whenStr = Number.isNaN(when.getTime()) ? run.at : when.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `generated with ${run.model} · ${run.attempts} attempt${run.attempts === 1 ? "" : "s"} · ${whenStr}`;
  };

  const activityStages: ActivityStage[] = STAGE_ORDER.map((id) => ({
    id,
    label: STAGE_LABEL[id],
    status: gates[id].status,
    phase: PHASE_OF[id],
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        {/* Idea card */}
        <section
          id="stage-idea"
          aria-label="Idea stage"
          className="scroll-mt-24 rounded-md border border-line bg-panel p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[16px] font-medium text-text">Idea</h3>
            <span className="inline-flex items-center rounded border border-ok/40 bg-ok/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-ok">
              Approved
            </span>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-text">{idea}</p>
        </section>

        {STAGE_META.map(({ stage, label, description, needsConfirm }) => {
          const status = gates[stage].status;
          const unlocked = isUnlocked(stage, gates);
          const output = pipeline[stage];
          return (
            <StageCard
              key={stage}
              stage={stage}
              label={label}
              description={description}
              status={status}
              unlocked={unlocked}
              lockReason={lockReasonFor(stage)}
              hasOutput={output !== undefined}
              rawJson={output ? JSON.stringify(output, null, 2) : ""}
              providerModel={snapshot.providerModel}
              maxRetries={pipeline.limits.maxRetries}
              needsConfirm={needsConfirm}
              runInfo={runInfoFor(stage)}
              busy={busy === stage}
              error={errors[stage] ?? null}
              onGenerate={() => onGenerate(stage)}
              onApprove={() => onApprove(stage)}
              onSkip={() => onSkip(stage)}
              onSaveEdit={(json) => onSaveEdit(stage, json)}
              onClearError={() => setError(stage, null)}
            >
              {stage === "research" && output && "summary" in output && (
                <ResearchOutput brief={output} />
              )}
              {stage === "script" && output && "hook" in output && (
                <ScriptOutput script={output} />
              )}
              {stage === "storyboard" && output && "scenes" in output && (
                <StoryboardOutput board={output} />
              )}
              {stage === "shots" && output && "shots" in output && (
                <ShotsOutput shots={output.shots} />
              )}
            </StageCard>
          );
        })}

        {/* Phase 3 placeholders — owned by another agent */}
        {(["assets", "timeline", "export"] as const).map((stage) => (
          <section
            key={stage}
            id={`stage-${stage}`}
            aria-label={`${STAGE_LABEL[stage]} stage`}
            className="scroll-mt-24 rounded-md border border-line/70 bg-panel/60 p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[16px] font-medium text-dim">
                {STAGE_LABEL[stage]}
              </h3>
              <span className="font-mono text-[10px] uppercase tracking-wide text-faint">
                Phase 3
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-faint">
              {stage === "assets" &&
                "Generated images, clips, voiceovers and music — the raw material library."}
              {stage === "timeline" &&
                "The multi-track edit: assemble clips, captions and audio into a cut."}
              {stage === "export" &&
                "Render queue with format presets per platform, then download or publish."}
            </p>
          </section>
        ))}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <AgentActivityPanel
          stages={activityStages}
          providerName={snapshot.providerName}
          providerModel={snapshot.providerModel}
          generationsUsed={snapshot.generationsUsed}
          maxGenerations={pipeline.limits.maxGenerations}
        />
        <LimitsPanel
          initial={pipeline.limits}
          busy={busy === "limits"}
          error={errors["limits"] ?? null}
          onSave={onSaveLimits}
          onClearError={() => setError("limits", null)}
        />
        {!snapshot.providerConfigured && (
          <div
            role="note"
            className="rounded-md border border-warn/50 bg-warn/[0.06] p-4"
          >
            <p className="text-sm font-medium text-text">
              No AI provider configured
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-dim">
              Add your API key in{" "}
              <a href="/providers" className="underline underline-offset-2 hover:text-text">
                Providers
              </a>{" "}
              to enable generation.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
