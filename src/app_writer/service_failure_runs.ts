import type { AppWriterContextSelection } from './context.ts';
import type {
  AppGenerationPlanStepId,
  AppGenerationRunRecord,
  AppGenerationValidationFinding,
  AppPackageGenerationResult,
  AppWriterStarterId,
} from './types.ts';
import {
  appendGenerationNotesFromError,
  appendModelRequestMetadata,
  appendModelRequestMetadataFromError,
  AppPackageGenerationFailedError,
  buildGenerationFailedFinding,
} from './service_failures.ts';
import { recordGenerationActivity } from './service_audit.ts';
import { targetVersionForContext } from './service_revision.ts';
import {
  saveGenerationWorkspaceFindings,
  saveGenerationWorkspaceSnapshot,
  updateGenerationPlanStepInWorkspace,
} from './service_workspace_snapshot.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';

type FailureRepository = Pick<
  PackageReviewRepository,
  | 'updateAppGenerationRun'
  | 'recordAuditEvent'
  | 'saveAppGenerationWorkspace'
  | 'getAppGenerationWorkspaceByGenerationId'
>;

export async function failGenerationRun(input: {
  repository: Pick<PackageReviewRepository, 'updateAppGenerationRun' | 'recordAuditEvent'>;
  run: AppGenerationRunRecord;
  error: unknown;
  now: () => string;
}): Promise<AppPackageGenerationFailedError> {
  const failedRun = await input.repository.updateAppGenerationRun({
    ...input.run,
    status: 'failed',
    modelRequestMetadata: appendModelRequestMetadataFromError(input.run, input.error),
    generationNotes: appendGenerationNotesFromError(input.run, input.error),
    validationFindings: [
      ...input.run.validationFindings,
      buildGenerationFailedFinding(input.error),
    ],
    updatedAt: input.now(),
  });
  await recordGenerationActivity({
    repository: input.repository,
    run: failedRun,
    eventType: 'app_generation.failed',
    status: 'failed',
    summary: 'App package generation failed before a package could be saved.',
  });

  return new AppPackageGenerationFailedError(
    input.error instanceof Error ? input.error.message : 'App package generation failed.',
    failedRun,
  );
}

export async function failGenerationRunAtStep(input: {
  repository: FailureRepository;
  run: AppGenerationRunRecord;
  error: unknown;
  now: () => string;
  planStepId: AppGenerationPlanStepId;
  generation?: AppPackageGenerationResult;
  activitySummary?: string;
}): Promise<AppGenerationRunRecord> {
  const failedFinding = buildGenerationFailedFinding(input.error);
  const failedRun = await input.repository.updateAppGenerationRun({
    ...input.run,
    status: 'failed',
    modelRequestMetadata: appendModelRequestMetadataFromError(input.run, input.error),
    generationNotes: appendGenerationNotesFromError(input.run, input.error),
    validationFindings: [...input.run.validationFindings, failedFinding],
    updatedAt: input.now(),
  });
  await updateGenerationPlanStepInWorkspace({
    repository: input.repository,
    run: failedRun,
    id: input.planStepId,
    status: 'failed',
    now: failedRun.updatedAt,
    diagnosticCount: failedRun.validationFindings.length,
  });

  if (input.generation === undefined) {
    await saveGenerationWorkspaceFindings({
      repository: input.repository,
      run: failedRun,
      validationFindings: failedRun.validationFindings,
    });
  } else {
    await saveGenerationWorkspaceSnapshot({
      repository: input.repository,
      run: failedRun,
      generation: input.generation,
      validationFindings: failedRun.validationFindings,
    });
  }

  await recordGenerationActivity({
    repository: input.repository,
    run: failedRun,
    eventType: 'app_generation.failed',
    status: 'failed',
    summary: input.activitySummary ??
      'App package generation failed before a package could be saved.',
  });

  return failedRun;
}

export async function failAuthoringGenerationRun(input: {
  repository: FailureRepository;
  run: AppGenerationRunRecord;
  error: unknown;
  now: () => string;
}): Promise<AppGenerationRunRecord> {
  return await failGenerationRunAtStep({
    ...input,
    planStepId: 'author_workspace',
  });
}

export async function failRepairingGenerationRun(input: {
  repository: FailureRepository;
  run: AppGenerationRunRecord;
  generation: AppPackageGenerationResult;
  error: unknown;
  now: () => string;
}): Promise<AppGenerationRunRecord> {
  return await failGenerationRunAtStep({
    ...input,
    planStepId: 'repair_if_needed',
    generation: input.generation,
  });
}

export async function failRunForStarterMismatch(input: {
  repository: FailureRepository;
  run: AppGenerationRunRecord;
  contextSelection: AppWriterContextSelection;
  starterFinding: AppGenerationValidationFinding;
  packageSnapshot: {
    normalizedRequest: AppPackageGenerationResult['normalizedRequest'];
    appPlan: AppPackageGenerationResult['appPlan'];
    selectedStarterId: AppWriterStarterId;
    notes: string[];
    modelRequestMetadata?: AppGenerationRunRecord['modelRequestMetadata'];
    validationFindings?: AppGenerationValidationFinding[];
  };
  now: () => string;
  activitySummary: string;
  errorMessage: string;
  planStep?: {
    id: AppGenerationPlanStepId;
    result: Record<string, unknown>;
  };
  generation?: AppPackageGenerationResult;
  repairAttemptCount?: number;
}): Promise<never> {
  const failedRun = await input.repository.updateAppGenerationRun({
    ...input.run,
    status: 'failed',
    normalizedRequest: input.packageSnapshot.normalizedRequest,
    appPlan: input.packageSnapshot.appPlan,
    selectedStarterId: input.packageSnapshot.selectedStarterId,
    generatedAppId: input.packageSnapshot.appPlan.appId,
    generatedVersion: targetVersionForContext(input.contextSelection),
    modelRequestMetadata: input.packageSnapshot.modelRequestMetadata ??
      (input.generation === undefined
        ? [...input.run.modelRequestMetadata]
        : appendModelRequestMetadata(input.run, input.generation)),
    generationNotes: [...input.packageSnapshot.notes],
    validationFindings: [
      input.starterFinding,
      ...(input.packageSnapshot.validationFindings ?? []),
    ],
    ...(input.repairAttemptCount === undefined
      ? {}
      : { repairAttemptCount: input.repairAttemptCount }),
    updatedAt: input.now(),
  });
  await recordGenerationActivity({
    repository: input.repository,
    run: failedRun,
    eventType: 'app_generation.failed',
    status: 'failed',
    summary: input.activitySummary,
  });

  if (input.planStep !== undefined) {
    await updateGenerationPlanStepInWorkspace({
      repository: input.repository,
      run: failedRun,
      id: input.planStep.id,
      status: 'failed',
      now: failedRun.updatedAt,
      diagnosticCount: 1,
      result: input.planStep.result,
    });
  }

  if (input.generation !== undefined) {
    await saveGenerationWorkspaceSnapshot({
      repository: input.repository,
      run: failedRun,
      generation: input.generation,
      validationFindings: [
        input.starterFinding,
        ...input.generation.validationFindings,
      ],
    });
  }

  throw new AppPackageGenerationFailedError(input.errorMessage, failedRun);
}
