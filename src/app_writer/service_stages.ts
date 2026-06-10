import type { AppWriterContextSelection } from './context.ts';
import type {
  AppGenerationPlanningResult,
  AppGenerationRunRecord,
  AppGenerationWorkspaceRecord,
  AppPackageFileGenerationResult,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
} from './types.ts';
import type { AppWriterWorkspaceRunner } from './workspace_runner.ts';
import {
  AppPackageGenerationFailedError,
  buildStarterMismatchFinding,
} from './service_failures.ts';
import { failAuthoringGenerationRun, failRunForStarterMismatch } from './service_failure_runs.ts';
import { deduplicateStrings } from './string_utils.ts';
import { readPlanningFromRun, targetVersionForContext } from './service_revision.ts';
import { recordGenerationActivity, recordGenerationProgressUpdates } from './service_audit.ts';
import {
  saveGenerationWorkspaceSnapshot,
  updateGenerationPlanStepInWorkspace,
} from './service_workspace_snapshot.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';

export async function planInitialPackage(input: {
  repository: Pick<
    PackageReviewRepository,
    | 'updateAppGenerationRun'
    | 'recordAuditEvent'
    | 'saveAppGenerationWorkspace'
    | 'getAppGenerationWorkspaceByGenerationId'
  >;
  workspaceRunner: AppWriterWorkspaceRunner;
  run: AppGenerationRunRecord;
  generatorInput: AppPackageGenerationInput;
  contextSelection: AppWriterContextSelection;
  initializedWorkspace: AppGenerationWorkspaceRecord;
  now: () => string;
}): Promise<{ run: AppGenerationRunRecord; planning: AppGenerationPlanningResult }> {
  if (input.run.status !== 'started' && input.run.status !== 'initializing') {
    const existingPlanning = readPlanningFromRun(input.run);

    if (existingPlanning !== null) {
      return {
        run: input.run,
        planning: existingPlanning,
      };
    }

    throw new Error(
      `App generation run ${input.run.generationId} cannot plan from status ${input.run.status}.`,
    );
  }

  let run = await input.repository.updateAppGenerationRun({
    ...input.run,
    status: 'planning',
    updatedAt: input.now(),
  });
  await recordGenerationActivity({
    repository: input.repository,
    run,
    eventType: 'app_generation.planning',
    status: 'accepted',
    summary: 'Created the Lantern-owned app plan for the initialized workspace.',
  });
  await updateGenerationPlanStepInWorkspace({
    repository: input.repository,
    run,
    id: 'create_app_plan',
    status: 'running',
    now: run.updatedAt,
  });

  const planning = await input.workspaceRunner.plan({
    ...input.generatorInput,
    initializedWorkspace: input.initializedWorkspace,
  });
  const starterFinding = buildStarterMismatchFinding({
    expectedStarterId: input.contextSelection.starterId,
    actualStarterId: planning.selectedStarterId,
  });

  if (starterFinding !== null) {
    await failRunForStarterMismatch({
      repository: input.repository,
      run,
      contextSelection: input.contextSelection,
      starterFinding,
      packageSnapshot: {
        normalizedRequest: planning.normalizedRequest,
        appPlan: planning.appPlan,
        selectedStarterId: planning.selectedStarterId,
        notes: [...planning.notes],
        modelRequestMetadata: [
          ...run.modelRequestMetadata,
          ...(planning.modelRequestMetadata ?? []),
        ],
      },
      now: input.now,
      activitySummary: 'Generated package plan selected the wrong Lantern starter.',
      errorMessage:
        `Generated package starter ${planning.selectedStarterId} did not match selected starter ${input.contextSelection.starterId}.`,
      planStep: {
        id: 'create_app_plan',
        result: {
          expectedStarterId: input.contextSelection.starterId,
          actualStarterId: planning.selectedStarterId,
        },
      },
    });
  }

  run = await input.repository.updateAppGenerationRun({
    ...run,
    status: 'planning',
    normalizedRequest: planning.normalizedRequest,
    appPlan: planning.appPlan,
    selectedStarterId: planning.selectedStarterId,
    generatedAppId: planning.appPlan.appId,
    generatedVersion: targetVersionForContext(input.contextSelection),
    modelRequestMetadata: [...run.modelRequestMetadata, ...(planning.modelRequestMetadata ?? [])],
    generationNotes: [...planning.notes],
    updatedAt: input.now(),
  });
  await updateGenerationPlanStepInWorkspace({
    repository: input.repository,
    run,
    id: 'create_app_plan',
    status: 'succeeded',
    now: run.updatedAt,
    result: {
      appId: planning.appPlan.appId,
      starterId: planning.selectedStarterId,
    },
  });
  await recordGenerationProgressUpdates({
    repository: input.repository,
    run,
    eventType: 'app_generation.planning',
    updates: planning.progressUpdates,
  });

  return {
    run,
    planning,
  };
}

export async function generateInitialPackageFiles(input: {
  repository: Pick<
    PackageReviewRepository,
    | 'updateAppGenerationRun'
    | 'recordAuditEvent'
    | 'saveAppGenerationWorkspace'
    | 'getAppGenerationWorkspaceByGenerationId'
    | 'getAppGenerationRunById'
  >;
  workspaceRunner: AppWriterWorkspaceRunner;
  run: AppGenerationRunRecord;
  generatorInput: AppPackageGenerationInput;
  planning: AppGenerationPlanningResult;
  initializedWorkspace: AppGenerationWorkspaceRecord;
  now: () => string;
}): Promise<{ run: AppGenerationRunRecord; generation: AppPackageGenerationResult }> {
  const existingWorkspace = await input.repository.getAppGenerationWorkspaceByGenerationId(
    input.run.generationId,
  );
  const existingAuthorStep = existingWorkspace?.generationPlan.find(
    (step) => step.id === 'author_workspace',
  );

  if (
    existingWorkspace !== undefined &&
    existingWorkspace !== null &&
    existingAuthorStep?.status === 'succeeded'
  ) {
    const existingRun = (await input.repository.getAppGenerationRunById(input.run.generationId)) ??
      input.run;

    return {
      run: existingRun,
      generation: reconstructGeneration({
        planning: input.planning,
        run: existingRun,
        workspace: existingWorkspace,
      }),
    };
  }

  const run = await input.repository.updateAppGenerationRun({
    ...input.run,
    status: 'generating_package',
    updatedAt: input.now(),
  });
  await recordGenerationActivity({
    repository: input.repository,
    run,
    eventType: 'app_generation.generating',
    status: 'accepted',
    summary: 'Asked the app writer workspace harness to author the scaffold workspace.',
  });
  await updateGenerationPlanStepInWorkspace({
    repository: input.repository,
    run,
    id: 'author_workspace',
    status: 'running',
    now: run.updatedAt,
  });

  let fileGeneration: AppPackageFileGenerationResult;
  try {
    fileGeneration = await input.workspaceRunner.author({
      ...input.generatorInput,
      planning: input.planning,
      initializedWorkspace: input.initializedWorkspace,
    });
  } catch (error) {
    const failedRun = await failAuthoringGenerationRun({
      repository: input.repository,
      run,
      error,
      now: input.now,
    });

    throw new AppPackageGenerationFailedError(
      error instanceof Error ? error.message : 'App package generation failed.',
      failedRun,
    );
  }
  const generation = assembleGenerationFromStages(input.planning, fileGeneration);
  await updateGenerationPlanStepInWorkspace({
    repository: input.repository,
    run,
    id: 'author_workspace',
    status: fileGeneration.validationFindings.some((finding) => finding.severity === 'error')
      ? 'failed'
      : 'succeeded',
    now: run.updatedAt,
    result: {
      fileCount: fileGeneration.files.length,
    },
    diagnosticCount: fileGeneration.validationFindings.length,
  });
  await saveGenerationWorkspaceSnapshot({
    repository: input.repository,
    run,
    generation,
    validationFindings: generation.validationFindings,
  });

  return {
    run,
    generation,
  };
}

export function assembleGenerationFromStages(
  planning: AppGenerationPlanningResult,
  fileGeneration: AppPackageFileGenerationResult,
): AppPackageGenerationResult {
  return {
    normalizedRequest: planning.normalizedRequest,
    appPlan: planning.appPlan,
    selectedStarterId: planning.selectedStarterId,
    files: fileGeneration.files,
    progressUpdates: fileGeneration.progressUpdates,
    notes: [...planning.notes, ...fileGeneration.notes],
    validationFindings: fileGeneration.validationFindings,
    ...(fileGeneration.modelRequestMetadata === undefined
      ? {}
      : { modelRequestMetadata: fileGeneration.modelRequestMetadata }),
  };
}

export function reconstructGeneration(input: {
  run: AppGenerationRunRecord;
  workspace: AppGenerationWorkspaceRecord;
  planning?: AppGenerationPlanningResult;
  baseGeneration?: AppPackageGenerationResult;
}): AppPackageGenerationResult {
  const normalizedRequest = input.run.normalizedRequest ?? input.planning?.normalizedRequest ??
    null;
  const appPlan = input.run.appPlan ?? input.planning?.appPlan ?? null;
  const selectedStarterId = input.run.selectedStarterId ?? input.workspace.selectedStarterId;

  if (normalizedRequest === null || appPlan === null) {
    if (input.baseGeneration !== undefined) {
      return input.baseGeneration;
    }

    throw new Error('Cannot reconstruct generation without normalized request and app plan.');
  }

  const planningNotes = input.planning?.notes ?? [];
  const noteSources = input.baseGeneration === undefined
    ? [...planningNotes, ...input.run.generationNotes]
    : [...input.run.generationNotes, ...input.baseGeneration.notes, ...planningNotes];
  const validationFindings = input.workspace.validationFindings.length > 0
    ? input.workspace.validationFindings
    : input.run.validationFindings;

  return {
    normalizedRequest,
    appPlan,
    selectedStarterId,
    files: input.workspace.files,
    progressUpdates: [],
    notes: deduplicateStrings(noteSources),
    validationFindings,
    ...(input.baseGeneration?.modelRequestMetadata === undefined
      ? {}
      : { modelRequestMetadata: input.baseGeneration.modelRequestMetadata }),
  };
}

export function buildGenerationFromPersistedWorkspace(input: {
  baseGeneration: AppPackageGenerationResult;
  run: AppGenerationRunRecord;
  workspace: AppGenerationWorkspaceRecord | null;
}): AppPackageGenerationResult {
  if (input.workspace === null) {
    return input.baseGeneration;
  }

  return reconstructGeneration({
    run: input.run,
    workspace: input.workspace,
    baseGeneration: input.baseGeneration,
  });
}
