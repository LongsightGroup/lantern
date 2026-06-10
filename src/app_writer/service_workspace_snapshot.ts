import type {
  AppGenerationPlanStepId,
  AppGenerationPlanStepStatus,
  AppGenerationRunRecord,
  AppGenerationValidationFinding,
  AppGenerationWorkspaceRecord,
  AppPackageGenerationResult,
} from './types.ts';
import { normalizeGenerationPlan, updateGenerationPlanStep } from './generation_plan.ts';
import { mergeWorkspaceFiles, selectNonPackageWorkspaceFiles } from './workspace_files.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';

export async function saveGenerationWorkspaceSnapshot(input: {
  repository: Pick<
    PackageReviewRepository,
    'saveAppGenerationWorkspace' | 'getAppGenerationWorkspaceByGenerationId'
  >;
  run: AppGenerationRunRecord;
  generation: AppPackageGenerationResult;
  validationFindings: AppGenerationValidationFinding[];
  generationPlan?: AppGenerationWorkspaceRecord['generationPlan'];
}): Promise<AppGenerationWorkspaceRecord> {
  const existing = await input.repository.getAppGenerationWorkspaceByGenerationId(
    input.run.generationId,
  );

  return await input.repository.saveAppGenerationWorkspace({
    generationId: input.run.generationId,
    selectedStarterId: input.generation.selectedStarterId,
    files: existing === null ? input.generation.files : mergeWorkspaceFiles(
      selectNonPackageWorkspaceFiles(existing.files),
      input.generation.files,
    ),
    generationPlan: input.generationPlan ?? existing?.generationPlan ?? [],
    validationFindings: input.validationFindings,
    repairAttemptCount: input.run.repairAttemptCount,
    updatedAt: input.run.updatedAt,
  });
}

export async function updateGenerationPlanStepInWorkspace(input: {
  repository: Pick<
    PackageReviewRepository,
    'saveAppGenerationWorkspace' | 'getAppGenerationWorkspaceByGenerationId'
  >;
  run: AppGenerationRunRecord;
  id: AppGenerationPlanStepId;
  status: AppGenerationPlanStepStatus;
  now: string;
  summary?: string;
  result?: Record<string, unknown>;
  diagnosticCount?: number;
}): Promise<AppGenerationWorkspaceRecord> {
  const workspace = await input.repository.getAppGenerationWorkspaceByGenerationId(
    input.run.generationId,
  );

  if (workspace === null) {
    throw new Error(
      `App generation workspace ${input.run.generationId} was not found while updating plan step ${input.id}.`,
    );
  }

  return await input.repository.saveAppGenerationWorkspace({
    ...workspace,
    generationPlan: updateGenerationPlanStep({
      plan: normalizeGenerationPlan(workspace.generationPlan),
      id: input.id,
      status: input.status,
      now: input.now,
      ...(input.summary === undefined ? {} : { summary: input.summary }),
      ...(input.result === undefined ? {} : { result: input.result }),
      ...(input.diagnosticCount === undefined ? {} : { diagnosticCount: input.diagnosticCount }),
    }),
    updatedAt: input.run.updatedAt,
  });
}

export async function saveGenerationWorkspaceFindings(input: {
  repository: Pick<
    PackageReviewRepository,
    'saveAppGenerationWorkspace' | 'getAppGenerationWorkspaceByGenerationId'
  >;
  run: AppGenerationRunRecord;
  validationFindings: AppGenerationValidationFinding[];
}): Promise<AppGenerationWorkspaceRecord> {
  const workspace = await input.repository.getAppGenerationWorkspaceByGenerationId(
    input.run.generationId,
  );

  if (workspace === null) {
    throw new Error(
      `App generation workspace ${input.run.generationId} was not found while saving findings.`,
    );
  }

  return await input.repository.saveAppGenerationWorkspace({
    ...workspace,
    validationFindings: input.validationFindings,
    repairAttemptCount: input.run.repairAttemptCount,
    updatedAt: input.run.updatedAt,
  });
}
