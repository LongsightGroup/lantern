import type {
  AppGenerationPlanStep,
  AppGenerationPlanStepId,
  AppGenerationPlanStepStatus,
} from './types.ts';

const GENERATION_PLAN_STEP_ORDER: AppGenerationPlanStepId[] = [
  'initialize_workspace',
  'create_app_plan',
  'author_workspace',
  'typecheck_source',
  'validate_package',
  'preview_runtime',
  'repair_if_needed',
  'save_pending_version',
];

const GENERATION_PLAN_STEP_SUMMARIES: Record<AppGenerationPlanStepId, string> = {
  initialize_workspace: 'Prepare the Lantern app writer workspace.',
  create_app_plan: 'Create and validate the Lantern app plan.',
  author_workspace: 'Author the generated app workspace files.',
  typecheck_source: 'Run strict TypeScript checks and compile source.',
  validate_package: 'Run Lantern package validation and policy checks.',
  preview_runtime: 'Run Lantern preview/runtime assertions.',
  repair_if_needed: 'Repair diagnostics and rerun the proof loop when needed.',
  save_pending_version: 'Save an immutable pending package version after proof passes.',
};

export function createInitializedGenerationPlan(input: {
  startedAt: string;
  completedAt: string;
  result: Record<string, unknown>;
}): AppGenerationPlanStep[] {
  return GENERATION_PLAN_STEP_ORDER.map((id) =>
    id === 'initialize_workspace'
      ? buildGenerationPlanStep({
        id,
        status: 'succeeded',
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        result: input.result,
      })
      : buildGenerationPlanStep({ id, status: 'pending' })
  );
}

export function updateGenerationPlanStep(input: {
  plan: readonly AppGenerationPlanStep[];
  id: AppGenerationPlanStepId;
  status: AppGenerationPlanStepStatus;
  now: string;
  summary?: string;
  result?: Record<string, unknown>;
  diagnosticCount?: number;
}): AppGenerationPlanStep[] {
  return normalizeGenerationPlan(input.plan).map((step) => {
    if (step.id !== input.id) {
      return step;
    }

    return {
      ...step,
      status: input.status,
      startedAt: step.startedAt ??
        (input.status === 'running' || input.status === 'succeeded' ? input.now : null),
      completedAt:
        input.status === 'succeeded' || input.status === 'failed' || input.status === 'skipped'
          ? input.now
          : null,
      summary: input.summary ?? step.summary,
      result: input.result ?? step.result,
      diagnosticCount: input.diagnosticCount ?? step.diagnosticCount,
    };
  });
}

export function normalizeGenerationPlan(
  plan: readonly AppGenerationPlanStep[],
): AppGenerationPlanStep[] {
  const existing = new Map(plan.map((step) => [step.id, step]));

  return GENERATION_PLAN_STEP_ORDER.map(
    (id) =>
      existing.get(id) ??
        buildGenerationPlanStep({
          id,
          status: 'pending',
        }),
  );
}

function buildGenerationPlanStep(input: {
  id: AppGenerationPlanStepId;
  status: AppGenerationPlanStepStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  summary?: string;
  result?: Record<string, unknown>;
  diagnosticCount?: number;
}): AppGenerationPlanStep {
  return {
    id: input.id,
    status: input.status,
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
    summary: input.summary ?? GENERATION_PLAN_STEP_SUMMARIES[input.id],
    result: input.result ?? {},
    diagnosticCount: input.diagnosticCount ?? 0,
  };
}
