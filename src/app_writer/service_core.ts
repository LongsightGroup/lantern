import {
  type AppWriterContextSelection,
  selectAppWriterContext,
  selectAppWriterRevisionContext,
} from './context.ts';
import type {
  AppGenerationPlanningResult,
  AppGenerationRunRecord,
  AppGenerationWorkspaceRecord,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
  AppPackagePreviewer,
  AppPackageSourceCompiler,
  AppWriterAuthoringMode,
} from './types.ts';
import { APP_WRITER_DEFAULT_MAX_REPAIR_ATTEMPTS } from './recipe.ts';
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
  selectAuthoringModeForGeneration,
} from './service_revision.ts';
import { APP_GENERATION_AUDIT_EVENT_TYPES } from './service_constants.ts';
import type { ImportedPackageVersion } from '../package_review/intake.ts';
import type { PackageSource } from '../package_review/package_source.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { PackageSnapshotStore } from '../package_review/snapshot_store.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';

export interface RunAppPackageGenerationInput {
  repository: Pick<
    PackageReviewRepository,
    | 'createAppGenerationRun'
    | 'updateAppGenerationRun'
    | 'registerPackageVersion'
    | 'recordAuditEvent'
    | 'saveAppGenerationWorkspace'
    | 'getAppGenerationWorkspaceByGenerationId'
    | 'getAppGenerationRunById'
  >;
  workspaceRunner: AppWriterWorkspaceRunner;
  packageSnapshotStore?: PackageSnapshotStore;
  previewer?: AppPackagePreviewer;
  sourceCompiler?: AppPackageSourceCompiler;
  savePackage?: {
    importPackageFromSource: (
      source: PackageSource,
      options?: { storageRoot?: string },
    ) => Promise<ImportedPackageVersion>;
    storageRoot?: string;
  };
  generationId: string;
  ownerId: string;
  promptText: string;
  requestedAppId?: string | null;
  authoringMode?: AppWriterAuthoringMode;
  maxRepairAttempts?: number;
  now?: () => string;
}

export interface RunAppPackageGenerationResult {
  run: AppGenerationRunRecord;
  generation: AppPackageGenerationResult;
  packageVersion: PackageVersionRecord | null;
}

export interface PlannedAppPackageGenerationRun {
  run: AppGenerationRunRecord;
  generatorInput: AppPackageGenerationInput;
  contextSelection: AppWriterContextSelection;
  initializedWorkspace: AppGenerationWorkspaceRecord;
  planning: AppGenerationPlanningResult;
}

export interface InitializedAppPackageGenerationRun {
  run: AppGenerationRunRecord;
  generatorInput: AppPackageGenerationInput;
  contextSelection: AppWriterContextSelection;
  initializedWorkspace: AppGenerationWorkspaceRecord;
}

export interface GeneratedAppPackageFilesRun {
  run: AppGenerationRunRecord;
  generatorInput: AppPackageGenerationInput;
  contextSelection: AppWriterContextSelection;
  initializedWorkspace: AppGenerationWorkspaceRecord;
  generation: AppPackageGenerationResult;
}

export interface StartedAppPackageGenerationRun {
  run: AppGenerationRunRecord;
  continueGeneration: () => Promise<RunAppPackageGenerationResult>;
}

export interface ContinueAppPackageGenerationRunInput {
  repository:
    & RunAppPackageGenerationInput['repository']
    & Pick<PackageReviewRepository, 'getAppGenerationRunById'>
    & Partial<Pick<PackageReviewRepository, 'getPackageVersionById'>>;
  workspaceRunner: AppWriterWorkspaceRunner;
  packageSnapshotStore?: PackageSnapshotStore;
  previewer?: AppPackagePreviewer;
  sourceCompiler?: AppPackageSourceCompiler;
  savePackage?: RunAppPackageGenerationInput['savePackage'];
  generationId: string;
  maxRepairAttempts?: number;
  now?: () => string;
}

export { APP_GENERATION_AUDIT_EVENT_TYPES };

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

async function generateInitialPackage(input: {
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

function buildInitialGenerationRun(input: {
  generationId: string;
  ownerId: string;
  promptText: string;
  requestedAppId: string | null;
  contextSelection: AppWriterContextSelection;
  createdAt: string;
}): AppGenerationRunRecord {
  return {
    generationId: input.generationId,
    ownerId: input.ownerId,
    status: 'started',
    requestedAppId: input.requestedAppId,
    generatedAppId: null,
    generatedVersion: null,
    packageVersionId: null,
    promptText: input.promptText,
    normalizedRequest: null,
    appPlan: null,
    selectedStarterId: input.contextSelection.starterId,
    selectedContext: input.contextSelection.selectedContext,
    modelRequestMetadata: [],
    generationNotes: [],
    validationFindings: [],
    repairAttemptCount: 0,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function formatRevisionPromptText(input: {
  promptText: string;
  sourcePackageVersion: PackageVersionRecord;
  targetVersion: string;
}): string {
  return [
    `Revision request for ${input.sourcePackageVersion.appId}@${input.sourcePackageVersion.version}.`,
    `Target version: ${input.targetVersion}.`,
    `Preserve manifest app_id: ${input.sourcePackageVersion.appId}.`,
    'Start from the existing package snapshot and make only the requested refinement.',
    '',
    'Instructor refinement prompt:',
    input.promptText,
  ].join('\n');
}
