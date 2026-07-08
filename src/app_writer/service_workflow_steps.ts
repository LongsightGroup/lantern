import type { AppWriterContextSelection } from './context.ts';
import type {
  AppGenerationRunRecord,
  AppGenerationWorkspaceRecord,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
  AppPackagePreviewer,
  AppPackageSourceCompiler,
} from './types.ts';
import type { AppWriterWorkspaceRunner } from './workspace_runner.ts';
import {
  buildGenerationFromPersistedWorkspace,
  generateInitialPackageFiles,
  planInitialPackage,
} from './service_stages.ts';
import { AppPackageGenerationFailedError } from './service_failures.ts';
import { failGenerationRun } from './service_failure_runs.ts';
import { finishGeneratedPackage } from './service_finish.ts';
import { recordGenerationActivity } from './service_audit.ts';
import {
  buildContextSelectionFromRun,
  buildGeneratorInputFromRun,
  buildRevisionSourceFilesIfNeeded,
} from './service_revision.ts';
import type {
  ContinueAppPackageGenerationRunInput,
  GeneratedAppPackageFilesRun,
  InitializedAppPackageGenerationRun,
  PlannedAppPackageGenerationRun,
  RunAppPackageGenerationInput,
  RunAppPackageGenerationResult,
} from './service_run_types.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { PackageSnapshotStore } from '../package_review/snapshot_store.ts';

export async function initializeAppPackageGenerationRun(
  input: ContinueAppPackageGenerationRunInput,
): Promise<InitializedAppPackageGenerationRun> {
  const existingRun = await input.repository.getAppGenerationRunById(input.generationId);

  if (existingRun === null) {
    throw new Error(`App generation run ${input.generationId} was not found.`);
  }

  const now = input.now ?? (() => new Date().toISOString());
  const contextSelection = buildContextSelectionFromRun(existingRun);
  const generatorInput = buildGeneratorInputFromRun(existingRun, contextSelection);
  const existingWorkspace = await input.repository.getAppGenerationWorkspaceByGenerationId(
    existingRun.generationId,
  );

  if (existingWorkspace !== null && existingRun.status !== 'started') {
    return {
      run: existingRun,
      generatorInput,
      contextSelection,
      initializedWorkspace: existingWorkspace,
    };
  }

  const run = await input.repository.updateAppGenerationRun({
    ...existingRun,
    status: 'initializing',
    updatedAt: now(),
  });
  await recordGenerationActivity({
    repository: input.repository,
    run,
    eventType: 'app_generation.initializing',
    status: 'accepted',
    summary: 'Prepared Lantern app writer recipe, starter workspace, and validation contract.',
  });

  const initializedWorkspace = await input.workspaceRunner.initialize({
    generationId: run.generationId,
    contextSelection,
    initializedAt: run.updatedAt,
    ...(await buildRevisionSourceFilesIfNeeded({
      repository: input.repository,
      packageSnapshotStore: input.packageSnapshotStore,
      contextSelection,
    })),
  });
  const savedWorkspace = await input.repository.saveAppGenerationWorkspace(initializedWorkspace);

  return {
    run,
    generatorInput,
    contextSelection,
    initializedWorkspace: savedWorkspace,
  };
}

export async function planAppPackageGenerationRun(
  input: ContinueAppPackageGenerationRunInput,
): Promise<PlannedAppPackageGenerationRun> {
  const now = input.now ?? (() => new Date().toISOString());
  const initialized = await initializeAppPackageGenerationRun({
    ...input,
    now,
  });

  try {
    const planned = await planInitialPackage({
      repository: input.repository,
      workspaceRunner: input.workspaceRunner,
      run: initialized.run,
      generatorInput: initialized.generatorInput,
      contextSelection: initialized.contextSelection,
      initializedWorkspace: initialized.initializedWorkspace,
      now,
    });

    return {
      ...planned,
      generatorInput: initialized.generatorInput,
      contextSelection: initialized.contextSelection,
      initializedWorkspace: initialized.initializedWorkspace,
    };
  } catch (error) {
    if (error instanceof AppPackageGenerationFailedError) {
      throw error;
    }

    throw await failGenerationRun({
      repository: input.repository,
      run: initialized.run,
      error,
      now,
    });
  }
}

export async function generateAppPackageFilesForPlannedRun(input: {
  repository: Pick<
    PackageReviewRepository,
    | 'updateAppGenerationRun'
    | 'recordAuditEvent'
    | 'saveAppGenerationWorkspace'
    | 'getAppGenerationWorkspaceByGenerationId'
    | 'getAppGenerationRunById'
  >;
  workspaceRunner: AppWriterWorkspaceRunner;
  planned: PlannedAppPackageGenerationRun;
  now?: () => string;
}): Promise<GeneratedAppPackageFilesRun> {
  const now = input.now ?? (() => new Date().toISOString());

  try {
    const generated = await generateInitialPackageFiles({
      repository: input.repository,
      workspaceRunner: input.workspaceRunner,
      run: input.planned.run,
      generatorInput: input.planned.generatorInput,
      planning: input.planned.planning,
      initializedWorkspace: input.planned.initializedWorkspace,
      now,
    });

    return {
      ...generated,
      generatorInput: input.planned.generatorInput,
      contextSelection: input.planned.contextSelection,
      initializedWorkspace: input.planned.initializedWorkspace,
    };
  } catch (error) {
    if (error instanceof AppPackageGenerationFailedError) {
      throw error;
    }

    throw await failGenerationRun({
      repository: input.repository,
      run: input.planned.run,
      error,
      now,
    });
  }
}

export async function finishGeneratedAppPackageRun(input: {
  repository:
    & RunAppPackageGenerationInput['repository']
    & Pick<PackageReviewRepository, 'getAppGenerationRunById'>;
  workspaceRunner: AppWriterWorkspaceRunner;
  packageSnapshotStore?: PackageSnapshotStore;
  previewer?: AppPackagePreviewer;
  sourceCompiler?: AppPackageSourceCompiler;
  savePackage?: RunAppPackageGenerationInput['savePackage'];
  generated: GeneratedAppPackageFilesRun;
  maxRepairAttempts?: number;
  now?: () => string;
}): Promise<RunAppPackageGenerationResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const run = (await input.repository.getAppGenerationRunById(input.generated.run.generationId)) ??
    input.generated.run;
  const workspace = await input.repository.getAppGenerationWorkspaceByGenerationId(
    run.generationId,
  );
  const generation = buildGenerationFromPersistedWorkspace({
    baseGeneration: input.generated.generation,
    run,
    workspace,
  });
  const repairAttempt = Math.max(
    input.generated.run.repairAttemptCount,
    run.repairAttemptCount,
    workspace?.repairAttemptCount ?? 0,
  );

  try {
    return await finishGeneratedPackage({
      input: {
        repository: input.repository,
        workspaceRunner: input.workspaceRunner,
        ...(input.packageSnapshotStore === undefined
          ? {}
          : { packageSnapshotStore: input.packageSnapshotStore }),
        generationId: input.generated.generatorInput.generationId,
        ownerId: input.generated.generatorInput.ownerId,
        promptText: input.generated.generatorInput.promptText,
        requestedAppId: input.generated.generatorInput.requestedAppId,
        ...(input.previewer === undefined ? {} : { previewer: input.previewer }),
        ...(input.sourceCompiler === undefined ? {} : { sourceCompiler: input.sourceCompiler }),
        ...(input.savePackage === undefined ? {} : { savePackage: input.savePackage }),
        ...(input.maxRepairAttempts === undefined
          ? {}
          : { maxRepairAttempts: input.maxRepairAttempts }),
        now,
      },
      now,
      generatorInput: input.generated.generatorInput,
      contextSelection: input.generated.contextSelection,
      run,
      generation,
      repairAttempt,
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

export async function generateInitialPackage(input: {
  input: RunAppPackageGenerationInput;
  run: AppGenerationRunRecord;
  generatorInput: AppPackageGenerationInput;
  contextSelection: AppWriterContextSelection;
  initializedWorkspace: AppGenerationWorkspaceRecord;
  now: () => string;
}): Promise<{ run: AppGenerationRunRecord; generation: AppPackageGenerationResult }> {
  const planned = await planInitialPackage({
    repository: input.input.repository,
    workspaceRunner: input.input.workspaceRunner,
    run: input.run,
    generatorInput: input.generatorInput,
    contextSelection: input.contextSelection,
    initializedWorkspace: input.initializedWorkspace,
    now: input.now,
  });
  const generated = await generateInitialPackageFiles({
    repository: input.input.repository,
    workspaceRunner: input.input.workspaceRunner,
    run: planned.run,
    generatorInput: input.generatorInput,
    planning: planned.planning,
    initializedWorkspace: input.initializedWorkspace,
    now: input.now,
  });

  return {
    run: generated.run,
    generation: generated.generation,
  };
}
