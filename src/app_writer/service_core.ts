import {
  type AppWriterContextSelection,
  selectAppWriterContext,
  selectAppWriterRevisionContext,
} from './context.ts';
import type { AppGenerationRunRecord } from './types.ts';
import { APP_WRITER_DEFAULT_MAX_REPAIR_ATTEMPTS } from './recipe.ts';
import { AppPackageGenerationFailedError } from './service_failures.ts';
import { failGenerationRun } from './service_failure_runs.ts';
import { finishGeneratedPackage } from './service_finish.ts';
import { recordGenerationActivity } from './service_audit.ts';
import { buildInitialGenerationRun, formatRevisionPromptText } from './service_run_records.ts';
import {
  buildContextSelectionFromRun,
  buildGeneratorInputFromRun,
  selectAuthoringModeForGeneration,
} from './service_revision.ts';
import {
  generateInitialPackage,
  initializeAppPackageGenerationRun,
} from './service_workflow_steps.ts';
import { APP_GENERATION_AUDIT_EVENT_TYPES } from './service_constants.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import type {
  ContinueAppPackageGenerationRunInput,
  RunAppPackageGenerationInput,
  RunAppPackageGenerationResult,
  StartedAppPackageGenerationRun,
} from './service_run_types.ts';

export { APP_GENERATION_AUDIT_EVENT_TYPES };
export type {
  ContinueAppPackageGenerationRunInput,
  GeneratedAppPackageFilesRun,
  InitializedAppPackageGenerationRun,
  PlannedAppPackageGenerationRun,
  RunAppPackageGenerationInput,
  RunAppPackageGenerationResult,
  StartedAppPackageGenerationRun,
} from './service_run_types.ts';
export {
  finishGeneratedAppPackageRun,
  generateAppPackageFilesForPlannedRun,
  initializeAppPackageGenerationRun,
  planAppPackageGenerationRun,
} from './service_workflow_steps.ts';

export async function startAppPackageGenerationRun(
  input: RunAppPackageGenerationInput,
): Promise<StartedAppPackageGenerationRun> {
  const now = input.now ?? (() => new Date().toISOString());
  const createdAt = now();
  const requestedAppId = input.requestedAppId ?? null;
  const maxRepairAttempts = input.maxRepairAttempts ?? APP_WRITER_DEFAULT_MAX_REPAIR_ATTEMPTS;
  const authoringMode = input.authoringMode ??
    selectAuthoringModeForGeneration(input.sourceCompiler);
  const contextSelection = selectAppWriterContext({
    promptText: input.promptText,
    requestedAppId,
    authoringMode,
    maxRepairAttempts,
  });
  const run = await input.repository.createAppGenerationRun(
    buildInitialGenerationRun({
      generationId: input.generationId,
      ownerId: input.ownerId,
      promptText: input.promptText,
      requestedAppId,
      contextSelection,
      createdAt,
    }),
  );
  await recordGenerationActivity({
    repository: input.repository,
    run,
    eventType: 'app_generation.started',
    status: 'accepted',
    summary: 'Started an app writer generation run.',
  });

  return {
    run,
    continueGeneration: () =>
      continueStartedAppPackageGeneration({
        input,
        now,
        createdAt,
        requestedAppId,
        contextSelection,
        run,
      }),
  };
}

export async function startAppPackageRevisionRun(
  input: RunAppPackageGenerationInput & {
    sourcePackageVersion: PackageVersionRecord;
    targetVersion: string;
  },
): Promise<StartedAppPackageGenerationRun> {
  const now = input.now ?? (() => new Date().toISOString());
  const createdAt = now();
  const maxRepairAttempts = input.maxRepairAttempts ?? APP_WRITER_DEFAULT_MAX_REPAIR_ATTEMPTS;
  const authoringMode = input.authoringMode ??
    selectAuthoringModeForGeneration(input.sourceCompiler);
  const contextSelection = selectAppWriterRevisionContext({
    promptText: input.promptText,
    sourcePackageVersion: input.sourcePackageVersion,
    targetVersion: input.targetVersion,
    authoringMode,
    maxRepairAttempts,
  });
  const revisionPromptText = formatRevisionPromptText({
    promptText: input.promptText,
    sourcePackageVersion: input.sourcePackageVersion,
    targetVersion: input.targetVersion,
  });
  const run = await input.repository.createAppGenerationRun(
    buildInitialGenerationRun({
      generationId: input.generationId,
      ownerId: input.ownerId,
      promptText: revisionPromptText,
      requestedAppId: input.sourcePackageVersion.appId,
      contextSelection,
      createdAt,
    }),
  );
  await recordGenerationActivity({
    repository: input.repository,
    run,
    eventType: 'app_generation.started',
    status: 'accepted',
    summary:
      `Started an app writer revision run from ${input.sourcePackageVersion.appId}@${input.sourcePackageVersion.version}.`,
    detail: {
      revisionSourcePackageVersionId: input.sourcePackageVersion.id,
      revisionSourceVersion: input.sourcePackageVersion.version,
      revisionTargetVersion: input.targetVersion,
    },
  });

  return {
    run,
    continueGeneration: () =>
      continueStartedAppPackageGeneration({
        input: {
          ...input,
          promptText: revisionPromptText,
          requestedAppId: input.sourcePackageVersion.appId,
        },
        now,
        createdAt,
        requestedAppId: input.sourcePackageVersion.appId,
        contextSelection,
        run,
      }),
  };
}

export async function runAppPackageGeneration(
  input: RunAppPackageGenerationInput,
): Promise<RunAppPackageGenerationResult> {
  const started = await startAppPackageGenerationRun(input);

  return await started.continueGeneration();
}

export async function continueAppPackageGenerationRun(
  input: ContinueAppPackageGenerationRunInput,
): Promise<RunAppPackageGenerationResult> {
  const run = await input.repository.getAppGenerationRunById(input.generationId);

  if (run === null) {
    throw new Error(`App generation run ${input.generationId} was not found.`);
  }

  if (run.status !== 'started' && run.status !== 'initializing') {
    throw new Error(
      `App generation run ${input.generationId} cannot continue from status ${run.status}.`,
    );
  }

  const now = input.now ?? (() => new Date().toISOString());
  const contextSelection = buildContextSelectionFromRun(run);
  const continuationInput: RunAppPackageGenerationInput = {
    repository: input.repository,
    workspaceRunner: input.workspaceRunner,
    generationId: run.generationId,
    ownerId: run.ownerId,
    promptText: run.promptText,
    requestedAppId: run.requestedAppId,
    ...(input.packageSnapshotStore === undefined
      ? {}
      : { packageSnapshotStore: input.packageSnapshotStore }),
    ...(input.previewer === undefined ? {} : { previewer: input.previewer }),
    ...(input.sourceCompiler === undefined ? {} : { sourceCompiler: input.sourceCompiler }),
    ...(input.savePackage === undefined ? {} : { savePackage: input.savePackage }),
    ...(input.maxRepairAttempts === undefined
      ? {}
      : { maxRepairAttempts: input.maxRepairAttempts }),
    ...(input.now === undefined ? {} : { now: input.now }),
  };

  return await continueStartedAppPackageGeneration({
    input: continuationInput,
    now,
    createdAt: run.createdAt,
    requestedAppId: run.requestedAppId,
    contextSelection,
    run,
  });
}

async function continueStartedAppPackageGeneration(continuation: {
  input: RunAppPackageGenerationInput;
  now: () => string;
  createdAt: string;
  requestedAppId: string | null;
  contextSelection: AppWriterContextSelection;
  run: AppGenerationRunRecord;
}): Promise<RunAppPackageGenerationResult> {
  const input = continuation.input;
  const now = continuation.now;
  const createdAt = continuation.createdAt;
  const requestedAppId = continuation.requestedAppId;
  const contextSelection = continuation.contextSelection;
  let run = continuation.run;

  try {
    const initialized = await initializeAppPackageGenerationRun({
      repository: input.repository,
      workspaceRunner: input.workspaceRunner,
      ...(input.packageSnapshotStore === undefined
        ? {}
        : { packageSnapshotStore: input.packageSnapshotStore }),
      ...(input.previewer === undefined ? {} : { previewer: input.previewer }),
      ...(input.sourceCompiler === undefined ? {} : { sourceCompiler: input.sourceCompiler }),
      ...(input.savePackage === undefined ? {} : { savePackage: input.savePackage }),
      generationId: run.generationId,
      ...(input.maxRepairAttempts === undefined
        ? {}
        : { maxRepairAttempts: input.maxRepairAttempts }),
      now,
    });
    const generatorInput = buildGeneratorInputFromRun(
      {
        ...initialized.run,
        ownerId: input.ownerId,
        promptText: input.promptText,
        requestedAppId,
        createdAt,
      },
      contextSelection,
    );
    const initialGeneration = await generateInitialPackage({
      input,
      run: initialized.run,
      generatorInput,
      contextSelection,
      initializedWorkspace: initialized.initializedWorkspace,
      now,
    });
    run = initialGeneration.run;

    return await finishGeneratedPackage({
      input,
      now,
      generatorInput,
      contextSelection,
      run,
      generation: initialGeneration.generation,
      repairAttempt: 0,
    });
  } catch (error) {
    if (error instanceof AppPackageGenerationFailedError) {
      throw error;
    }

    throw await failGenerationRun({
      repository: input.repository,
      run,
      error,
      now,
    });
  }
}
