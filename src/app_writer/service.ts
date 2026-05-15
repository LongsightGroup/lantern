import type { AppPackageGenerator } from './package_generator.ts';
import { type AppWriterContextSelection, selectAppWriterContext } from './context.ts';
import {
  validateGeneratedAppPackage,
  validateGeneratedAppPackagePlanAlignment,
} from './validation.ts';
import type {
  AppGenerationPlanningResult,
  AppGenerationPlanStepId,
  AppGenerationPlanStepStatus,
  AppGenerationProgressUpdate,
  AppGenerationRunRecord,
  AppGenerationValidationFinding,
  AppGenerationWorkspaceRecord,
  AppPackageFileGenerationResult,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
  AppPackagePreviewer,
  AppPackageSourceCompiler,
  AppWriterAuthoringMode,
  AppWriterWorkspaceFile,
} from './types.ts';
import { hasTypeScriptAuthoringSource } from './source_compiler.ts';
import { APP_WRITER_DEFAULT_MAX_REPAIR_ATTEMPTS } from './recipe.ts';
import { normalizeGenerationPlan, updateGenerationPlanStep } from './generation_plan.ts';
import {
  type AppWriterWorkspaceRunner,
  createAppPackageGeneratorWorkspaceRunner,
} from './workspace_runner.ts';
import {
  mergeWorkspaceFiles,
  selectNonPackageWorkspaceFiles,
  selectPackageWorkspaceFiles,
} from './workspace_files.ts';
import type { ImportedPackageVersion } from '../package_review/intake.ts';
import type { PackageSource } from '../package_review/package_source.ts';
import { createMemoryPackageSource } from '../package_review/package_source.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { AuditEventStatus, PackageVersionRecord } from '../package_review/types.ts';

const TYPESCRIPT_AUTHORING_SOURCE_PATHS = new Set(['source/app.ts', 'source/content_model.ts']);

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
  generator: AppPackageGenerator;
  workspaceRunner?: AppWriterWorkspaceRunner;
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
  repository: RunAppPackageGenerationInput['repository'] &
    Pick<PackageReviewRepository, 'getAppGenerationRunById'>;
  generator: AppPackageGenerator;
  workspaceRunner?: AppWriterWorkspaceRunner;
  previewer?: AppPackagePreviewer;
  sourceCompiler?: AppPackageSourceCompiler;
  savePackage?: RunAppPackageGenerationInput['savePackage'];
  generationId: string;
  maxRepairAttempts?: number;
  now?: () => string;
}

export const APP_GENERATION_AUDIT_EVENT_TYPES = [
  'app_generation.started',
  'app_generation.initializing',
  'app_generation.planning',
  'app_generation.generating',
  'app_generation.validating',
  'app_generation.repairing',
  'app_generation.previewing',
  'app_generation.saved_pending_version',
  'app_generation.failed',
] as const;

function resolveWorkspaceRunner(input: {
  generator: AppPackageGenerator;
  workspaceRunner?: AppWriterWorkspaceRunner;
}): AppWriterWorkspaceRunner {
  return input.workspaceRunner ?? createAppPackageGeneratorWorkspaceRunner(input.generator);
}

export async function startAppPackageGenerationRun(
  input: RunAppPackageGenerationInput,
): Promise<StartedAppPackageGenerationRun> {
  const now = input.now ?? (() => new Date().toISOString());
  const createdAt = now();
  const requestedAppId = input.requestedAppId ?? null;
  const maxRepairAttempts = input.maxRepairAttempts ?? APP_WRITER_DEFAULT_MAX_REPAIR_ATTEMPTS;
  const authoringMode =
    input.authoringMode ?? selectAuthoringModeForGeneration(input.sourceCompiler);
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
  const workspaceRunner = resolveWorkspaceRunner(input);
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

  const initializedWorkspace = await workspaceRunner.initialize({
    generationId: run.generationId,
    contextSelection,
    initializedAt: run.updatedAt,
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

  if (run.selectedStarterId === null) {
    throw new Error(`App generation run ${input.generationId} has no selected starter.`);
  }

  const now = input.now ?? (() => new Date().toISOString());
  const contextSelection: AppWriterContextSelection = {
    starterId: run.selectedStarterId,
    selectedContext: run.selectedContext as AppWriterContextSelection['selectedContext'],
  };
  const continuationInput: RunAppPackageGenerationInput = {
    repository: input.repository,
    generator: input.generator,
    ...(input.workspaceRunner === undefined ? {} : { workspaceRunner: input.workspaceRunner }),
    generationId: run.generationId,
    ownerId: run.ownerId,
    promptText: run.promptText,
    requestedAppId: run.requestedAppId,
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
  const workspaceRunner = resolveWorkspaceRunner(input);

  try {
    const planned = await planInitialPackage({
      repository: input.repository,
      workspaceRunner,
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
  >;
  generator: AppPackageGenerator;
  workspaceRunner?: AppWriterWorkspaceRunner;
  planned: PlannedAppPackageGenerationRun;
  now?: () => string;
}): Promise<GeneratedAppPackageFilesRun> {
  const now = input.now ?? (() => new Date().toISOString());
  const workspaceRunner = resolveWorkspaceRunner(input);

  try {
    const generated = await generateInitialPackageFiles({
      repository: input.repository,
      workspaceRunner,
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
  repository: RunAppPackageGenerationInput['repository'] &
    Pick<PackageReviewRepository, 'getAppGenerationRunById'>;
  generator: AppPackageGenerator;
  workspaceRunner?: AppWriterWorkspaceRunner;
  previewer?: AppPackagePreviewer;
  sourceCompiler?: AppPackageSourceCompiler;
  savePackage?: RunAppPackageGenerationInput['savePackage'];
  generated: GeneratedAppPackageFilesRun;
  maxRepairAttempts?: number;
  now?: () => string;
}): Promise<RunAppPackageGenerationResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const run =
    (await input.repository.getAppGenerationRunById(input.generated.run.generationId)) ??
    input.generated.run;

  try {
    return await finishGeneratedPackage({
      input: {
        repository: input.repository,
        generator: input.generator,
        ...(input.workspaceRunner === undefined ? {} : { workspaceRunner: input.workspaceRunner }),
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
      generation: input.generated.generation,
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
      generator: input.generator,
      ...(input.workspaceRunner === undefined ? {} : { workspaceRunner: input.workspaceRunner }),
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
  const workspaceRunner = resolveWorkspaceRunner(input.input);

  if (
    input.input.workspaceRunner !== undefined ||
    supportsStagedPackageGeneration(input.input.generator)
  ) {
    const planned = await planInitialPackage({
      repository: input.input.repository,
      workspaceRunner,
      run: input.run,
      generatorInput: input.generatorInput,
      contextSelection: input.contextSelection,
      initializedWorkspace: input.initializedWorkspace,
      now: input.now,
    });
    const generated = await generateInitialPackageFiles({
      repository: input.input.repository,
      workspaceRunner,
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

  const run = await input.input.repository.updateAppGenerationRun({
    ...input.run,
    status: 'generating_package',
    updatedAt: input.now(),
  });
  await recordGenerationActivity({
    repository: input.input.repository,
    run,
    eventType: 'app_generation.generating',
    status: 'accepted',
    summary: 'Asked the app package generator for package files.',
  });

  const generation = await input.input.generator.generate(input.generatorInput);
  await saveGenerationWorkspaceSnapshot({
    repository: input.input.repository,
    run,
    generation,
    validationFindings: generation.validationFindings,
  });

  return {
    run,
    generation,
  };
}

async function planInitialPackage(input: {
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
    summary: 'Asked the app package generator for a Lantern app plan.',
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
    const failedRun = await input.repository.updateAppGenerationRun({
      ...run,
      status: 'failed',
      normalizedRequest: planning.normalizedRequest,
      appPlan: planning.appPlan,
      selectedStarterId: planning.selectedStarterId,
      generatedAppId: planning.appPlan.appId,
      generatedVersion: '0.1.0',
      modelRequestMetadata: [...run.modelRequestMetadata, ...(planning.modelRequestMetadata ?? [])],
      generationNotes: [...planning.notes],
      validationFindings: [starterFinding],
      updatedAt: input.now(),
    });
    await recordGenerationActivity({
      repository: input.repository,
      run: failedRun,
      eventType: 'app_generation.failed',
      status: 'failed',
      summary: 'Generated package plan selected the wrong Lantern starter.',
    });
    await updateGenerationPlanStepInWorkspace({
      repository: input.repository,
      run: failedRun,
      id: 'create_app_plan',
      status: 'failed',
      now: failedRun.updatedAt,
      diagnosticCount: 1,
      result: {
        expectedStarterId: input.contextSelection.starterId,
        actualStarterId: planning.selectedStarterId,
      },
    });

    throw new AppPackageGenerationFailedError(
      `Generated package starter ${planning.selectedStarterId} did not match selected starter ${input.contextSelection.starterId}.`,
      failedRun,
    );
  }

  run = await input.repository.updateAppGenerationRun({
    ...run,
    status: 'planning',
    normalizedRequest: planning.normalizedRequest,
    appPlan: planning.appPlan,
    selectedStarterId: planning.selectedStarterId,
    generatedAppId: planning.appPlan.appId,
    generatedVersion: '0.1.0',
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

async function generateInitialPackageFiles(input: {
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
  planning: AppGenerationPlanningResult;
  initializedWorkspace: AppGenerationWorkspaceRecord;
  now: () => string;
}): Promise<{ run: AppGenerationRunRecord; generation: AppPackageGenerationResult }> {
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
    summary: 'Asked the app package generator for scaffold file edits.',
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

function assembleGenerationFromStages(
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

function supportsStagedPackageGeneration(
  generator: AppPackageGenerator,
): generator is AppPackageGenerator & {
  plan: NonNullable<AppPackageGenerator['plan']>;
  generateFiles: NonNullable<AppPackageGenerator['generateFiles']>;
} {
  return typeof generator.plan === 'function' && typeof generator.generateFiles === 'function';
}

async function finishGeneratedPackage(input: {
  input: RunAppPackageGenerationInput;
  now: () => string;
  generatorInput: AppPackageGenerationInput;
  contextSelection: AppWriterContextSelection;
  run: AppGenerationRunRecord;
  generation: AppPackageGenerationResult;
  repairAttempt: number;
}): Promise<RunAppPackageGenerationResult> {
  const maxRepairAttempts = input.input.maxRepairAttempts ?? APP_WRITER_DEFAULT_MAX_REPAIR_ATTEMPTS;
  let run = input.run;
  let generation = input.generation;
  let repairAttempt = input.repairAttempt;

  while (true) {
    const starterFinding = buildStarterMismatchFinding({
      expectedStarterId: input.contextSelection.starterId,
      actualStarterId: generation.selectedStarterId,
    });

    if (starterFinding !== null) {
      const failedRun = await input.input.repository.updateAppGenerationRun({
        ...run,
        status: 'failed',
        normalizedRequest: generation.normalizedRequest,
        appPlan: generation.appPlan,
        selectedStarterId: generation.selectedStarterId,
        generatedAppId: generation.appPlan.appId,
        generatedVersion: '0.1.0',
        modelRequestMetadata: appendModelRequestMetadata(run, generation),
        generationNotes: [...generation.notes],
        validationFindings: [starterFinding, ...generation.validationFindings],
        repairAttemptCount: repairAttempt,
        updatedAt: input.now(),
      });
      await recordGenerationActivity({
        repository: input.input.repository,
        run: failedRun,
        eventType: 'app_generation.failed',
        status: 'failed',
        summary: 'Generated package selected the wrong Lantern starter.',
      });
      await saveGenerationWorkspaceSnapshot({
        repository: input.input.repository,
        run: failedRun,
        generation,
        validationFindings: [starterFinding, ...generation.validationFindings],
      });

      throw new AppPackageGenerationFailedError(
        `Generated package starter ${generation.selectedStarterId} did not match selected starter ${input.contextSelection.starterId}.`,
        failedRun,
      );
    }

    await recordGenerationProgressUpdates({
      repository: input.input.repository,
      run,
      eventType: repairAttempt === 0 ? 'app_generation.generating' : 'app_generation.repairing',
      updates: generation.progressUpdates,
    });

    if (hasTypeScriptAuthoringSource(generation.files)) {
      await updateGenerationPlanStepInWorkspace({
        repository: input.input.repository,
        run,
        id: 'typecheck_source',
        status: 'running',
        now: run.updatedAt,
      });
      const compiled = await compileTypeScriptSourceIfNeeded({
        input: input.input,
        generation,
        contextSelection: input.contextSelection,
      });
      generation = {
        ...generation,
        files: compiled.files,
        notes: [...generation.notes, ...compiled.notes],
        validationFindings: [...generation.validationFindings, ...compiled.validationFindings],
      };
      await updateGenerationPlanStepInWorkspace({
        repository: input.input.repository,
        run,
        id: 'typecheck_source',
        status: compiled.validationFindings.some((finding) => finding.severity === 'error')
          ? 'failed'
          : 'succeeded',
        now: run.updatedAt,
        diagnosticCount: compiled.validationFindings.length,
      });
    } else {
      await updateGenerationPlanStepInWorkspace({
        repository: input.input.repository,
        run,
        id: 'typecheck_source',
        status: 'skipped',
        now: run.updatedAt,
        summary: 'No TypeScript source files were present for compilation.',
      });
    }
    await saveGenerationWorkspaceSnapshot({
      repository: input.input.repository,
      run,
      generation,
      validationFindings: generation.validationFindings,
    });

    const validationFindings = [
      ...generation.validationFindings,
      ...validateGeneratedAppPackagePlanAlignment({
        appPlan: generation.appPlan,
        files: generation.files,
      }),
      ...(await validateGeneratedAppPackage({
        selectedStarterId: input.contextSelection.starterId,
        files: generation.files,
      })),
    ];
    await updateGenerationPlanStepInWorkspace({
      repository: input.input.repository,
      run,
      id: 'validate_package',
      status: validationFindings.some((finding) => finding.severity === 'error')
        ? 'failed'
        : 'succeeded',
      now: run.updatedAt,
      diagnosticCount: validationFindings.length,
    });

    run = await input.input.repository.updateAppGenerationRun({
      ...run,
      status: 'validating',
      normalizedRequest: generation.normalizedRequest,
      appPlan: generation.appPlan,
      selectedStarterId: generation.selectedStarterId,
      generatedAppId: generation.appPlan.appId,
      generatedVersion: '0.1.0',
      modelRequestMetadata: appendModelRequestMetadata(run, generation),
      generationNotes: [...generation.notes],
      validationFindings,
      repairAttemptCount: repairAttempt,
      updatedAt: input.now(),
    });
    await recordGenerationActivity({
      repository: input.input.repository,
      run,
      eventType: 'app_generation.validating',
      status: validationFindings.some((finding) => finding.severity === 'error')
        ? 'failed'
        : 'succeeded',
      summary: validationFindings.some((finding) => finding.severity === 'error')
        ? 'Generated package failed Lantern validation.'
        : 'Generated package passed Lantern validation.',
    });
    await saveGenerationWorkspaceSnapshot({
      repository: input.input.repository,
      run,
      generation,
      validationFindings,
    });

    if (!validationFindings.some((finding) => finding.severity === 'error')) {
      const previewed = await previewGeneratedPackage({
        input: input.input,
        contextSelection: input.contextSelection,
        generation,
        run,
        validationFindings,
        now: input.now,
      });
      run = previewed.run;
      await saveGenerationWorkspaceSnapshot({
        repository: input.input.repository,
        run,
        generation,
        validationFindings: previewed.findings,
      });

      if (!previewed.findings.some((finding) => finding.severity === 'error')) {
        const saved = await saveGeneratedPackageIfRequested({
          input: input.input,
          generation,
          run,
          now: input.now,
        });

        return (
          saved ?? {
            run,
            generation,
            packageVersion: null,
          }
        );
      }

      run = {
        ...run,
        validationFindings: previewed.findings,
      };
    }

    if (!run.validationFindings.some((finding) => finding.severity === 'error')) {
      return {
        run,
        generation,
        packageVersion: null,
      };
    }

    if (
      repairAttempt >= maxRepairAttempts ||
      (input.input.workspaceRunner === undefined &&
        typeof input.input.generator.repair !== 'function')
    ) {
      const failedRun = await input.input.repository.updateAppGenerationRun({
        ...run,
        status: 'failed',
        updatedAt: input.now(),
      });
      await recordGenerationActivity({
        repository: input.input.repository,
        run: failedRun,
        eventType: 'app_generation.failed',
        status: 'failed',
        summary: 'Generated package failed after repair attempts were exhausted.',
      });
      await updateGenerationPlanStepInWorkspace({
        repository: input.input.repository,
        run: failedRun,
        id: 'repair_if_needed',
        status: 'failed',
        now: failedRun.updatedAt,
        diagnosticCount: failedRun.validationFindings.length,
      });

      throw new AppPackageGenerationFailedError('Generated package failed validation.', failedRun);
    }

    repairAttempt += 1;
    run = await input.input.repository.updateAppGenerationRun({
      ...run,
      status: 'repairing',
      repairAttemptCount: repairAttempt,
      updatedAt: input.now(),
    });
    await recordGenerationActivity({
      repository: input.input.repository,
      run,
      eventType: 'app_generation.repairing',
      status: 'accepted',
      summary: 'Asked the app package generator to repair validation or preview findings.',
    });
    await updateGenerationPlanStepInWorkspace({
      repository: input.input.repository,
      run,
      id: 'repair_if_needed',
      status: 'running',
      now: run.updatedAt,
      diagnosticCount: run.validationFindings.length,
    });
    try {
      generation = await resolveWorkspaceRunner(input.input).repair({
        ...input.generatorInput,
        repairAttempt,
        previousResult: generation,
        validationFindings: run.validationFindings,
        currentWorkspace: await input.input.repository.getAppGenerationWorkspaceByGenerationId(
          run.generationId,
        ),
      });
    } catch (error) {
      const failedRun = await failRepairingGenerationRun({
        repository: input.input.repository,
        run,
        generation,
        error,
        now: input.now,
      });

      throw new AppPackageGenerationFailedError(
        error instanceof Error ? error.message : 'App package generation failed.',
        failedRun,
      );
    }
    await updateGenerationPlanStepInWorkspace({
      repository: input.input.repository,
      run,
      id: 'repair_if_needed',
      status: generation.validationFindings.some((finding) => finding.severity === 'error')
        ? 'failed'
        : 'succeeded',
      now: run.updatedAt,
      diagnosticCount: generation.validationFindings.length,
    });
    await saveGenerationWorkspaceSnapshot({
      repository: input.input.repository,
      run,
      generation,
      validationFindings: generation.validationFindings,
    });
  }
}

function buildContextSelectionFromRun(run: AppGenerationRunRecord): AppWriterContextSelection {
  if (run.selectedStarterId === null) {
    throw new Error(`App generation run ${run.generationId} has no selected starter.`);
  }

  return {
    starterId: run.selectedStarterId,
    selectedContext: {
      ...(run.selectedContext as AppWriterContextSelection['selectedContext']),
      authoringMode: readAuthoringModeFromContext(run.selectedContext),
    },
  };
}

function buildGeneratorInputFromRun(
  run: Pick<
    AppGenerationRunRecord,
    | 'generationId'
    | 'ownerId'
    | 'promptText'
    | 'requestedAppId'
    | 'selectedStarterId'
    | 'selectedContext'
    | 'createdAt'
  >,
  contextSelection: AppWriterContextSelection,
): AppPackageGenerationInput {
  return {
    generationId: run.generationId,
    ownerId: run.ownerId,
    promptText: run.promptText,
    requestedAppId: run.requestedAppId,
    selectedStarterId: contextSelection.starterId,
    selectedContext: contextSelection.selectedContext,
    authoringMode: contextSelection.selectedContext.authoringMode,
    createdAt: run.createdAt,
  };
}

function selectAuthoringModeForGeneration(
  sourceCompiler: AppPackageSourceCompiler | undefined,
): AppWriterAuthoringMode {
  return sourceCompiler?.supportsTypeScriptAuthoring === true ? 'typescript' : 'javascript';
}

function readAuthoringModeFromContext(
  selectedContext: Record<string, unknown>,
): AppWriterAuthoringMode {
  return selectedContext.authoringMode === 'typescript' ? 'typescript' : 'javascript';
}

function readPlanningFromRun(run: AppGenerationRunRecord): AppGenerationPlanningResult | null {
  if (
    run.normalizedRequest === null ||
    run.appPlan === null ||
    run.selectedStarterId === null ||
    run.status === 'failed'
  ) {
    return null;
  }

  return {
    normalizedRequest: run.normalizedRequest,
    appPlan: run.appPlan,
    selectedStarterId: run.selectedStarterId,
    progressUpdates: [
      {
        stage: 'planning_app',
        message: 'Using the existing Lantern app plan.',
      },
    ],
    notes: [...run.generationNotes],
  };
}

async function failGenerationRun(input: {
  repository: Pick<PackageReviewRepository, 'updateAppGenerationRun' | 'recordAuditEvent'>;
  run: AppGenerationRunRecord;
  error: unknown;
  now: () => string;
}): Promise<AppPackageGenerationFailedError> {
  const failedRun = await input.repository.updateAppGenerationRun({
    ...input.run,
    status: 'failed',
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

async function recordGenerationActivity(input: {
  repository: Pick<PackageReviewRepository, 'recordAuditEvent'>;
  run: AppGenerationRunRecord;
  eventType: (typeof APP_GENERATION_AUDIT_EVENT_TYPES)[number];
  status: AuditEventStatus;
  summary: string;
  packageVersionId?: number | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await input.repository.recordAuditEvent({
    eventType: input.eventType,
    actorType: 'user',
    actorId: input.run.ownerId,
    deploymentRecordId: null,
    packageVersionId: input.packageVersionId ?? input.run.packageVersionId,
    attemptId: null,
    lineItemBindingId: null,
    status: input.status,
    summary: input.summary,
    detail: {
      generationId: input.run.generationId,
      generationStatus: input.run.status,
      requestedAppId: input.run.requestedAppId,
      generatedAppId: input.run.generatedAppId,
      selectedStarterId: input.run.selectedStarterId,
      repairAttemptCount: input.run.repairAttemptCount,
      findingCount: input.run.validationFindings.length,
      ...input.detail,
    },
    occurredAt: input.run.updatedAt,
  });
}

async function recordGenerationProgressUpdates(input: {
  repository: Pick<PackageReviewRepository, 'recordAuditEvent'>;
  run: AppGenerationRunRecord;
  eventType: (typeof APP_GENERATION_AUDIT_EVENT_TYPES)[number];
  updates: AppGenerationProgressUpdate[];
}): Promise<void> {
  for (const update of input.updates) {
    await recordGenerationActivity({
      repository: input.repository,
      run: input.run,
      eventType: input.eventType,
      status: 'succeeded',
      summary: update.message,
      detail: {
        modelProgress: true,
        modelProgressStage: update.stage,
      },
    });
  }
}

async function saveGenerationWorkspaceSnapshot(input: {
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
    files:
      existing === null
        ? input.generation.files
        : mergeWorkspaceFiles(
            selectNonPackageWorkspaceFiles(existing.files),
            input.generation.files,
          ),
    generationPlan: input.generationPlan ?? existing?.generationPlan ?? [],
    validationFindings: input.validationFindings,
    repairAttemptCount: input.run.repairAttemptCount,
    updatedAt: input.run.updatedAt,
  });
}

async function updateGenerationPlanStepInWorkspace(input: {
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
}): Promise<AppGenerationWorkspaceRecord | null> {
  const workspace = await input.repository.getAppGenerationWorkspaceByGenerationId(
    input.run.generationId,
  );

  if (workspace === null) {
    return null;
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

async function runPreviewIfConfigured(
  input: RunAppPackageGenerationInput,
  contextSelection: AppWriterContextSelection,
  generation: AppPackageGenerationResult,
): Promise<AppGenerationValidationFinding[]> {
  if (input.previewer === undefined) {
    return [];
  }

  return await input.previewer.preview({
    generationId: input.generationId,
    selectedStarterId: contextSelection.starterId,
    files: generation.files,
  });
}

async function compileTypeScriptSourceIfNeeded(input: {
  input: RunAppPackageGenerationInput;
  generation: AppPackageGenerationResult;
  contextSelection: AppWriterContextSelection;
}) {
  const compiler = input.input.sourceCompiler;

  if (compiler === undefined) {
    return {
      files: projectTypeScriptAuthoringWorkspaceFiles({
        baseFiles: input.generation.files,
        compiledFiles: input.generation.files,
      }),
      notes: [],
      validationFindings: [buildTypeScriptCompilerMissingFinding()],
    };
  }

  return await compiler
    .compile({
      generationId: input.input.generationId,
      appPlan: input.generation.appPlan,
      selectedStarterId: input.contextSelection.starterId,
      files: selectTypeScriptCompilerInputFiles(input.generation.files),
    })
    .then((compiled) => ({
      ...compiled,
      files: projectTypeScriptAuthoringWorkspaceFiles({
        baseFiles: input.generation.files,
        compiledFiles: compiled.files,
      }),
    }));
}

async function failRepairingGenerationRun(input: {
  repository: Pick<
    PackageReviewRepository,
    | 'updateAppGenerationRun'
    | 'recordAuditEvent'
    | 'saveAppGenerationWorkspace'
    | 'getAppGenerationWorkspaceByGenerationId'
  >;
  run: AppGenerationRunRecord;
  generation: AppPackageGenerationResult;
  error: unknown;
  now: () => string;
}): Promise<AppGenerationRunRecord> {
  const failedFinding = buildGenerationFailedFinding(input.error);
  const failedRun = await input.repository.updateAppGenerationRun({
    ...input.run,
    status: 'failed',
    validationFindings: [...input.run.validationFindings, failedFinding],
    updatedAt: input.now(),
  });
  await updateGenerationPlanStepInWorkspace({
    repository: input.repository,
    run: failedRun,
    id: 'repair_if_needed',
    status: 'failed',
    now: failedRun.updatedAt,
    diagnosticCount: failedRun.validationFindings.length,
  });
  await saveGenerationWorkspaceSnapshot({
    repository: input.repository,
    run: failedRun,
    generation: input.generation,
    validationFindings: failedRun.validationFindings,
  });
  await recordGenerationActivity({
    repository: input.repository,
    run: failedRun,
    eventType: 'app_generation.failed',
    status: 'failed',
    summary: 'App package generation failed before a package could be saved.',
  });

  return failedRun;
}

async function failAuthoringGenerationRun(input: {
  repository: Pick<
    PackageReviewRepository,
    | 'updateAppGenerationRun'
    | 'recordAuditEvent'
    | 'saveAppGenerationWorkspace'
    | 'getAppGenerationWorkspaceByGenerationId'
  >;
  run: AppGenerationRunRecord;
  error: unknown;
  now: () => string;
}): Promise<AppGenerationRunRecord> {
  const failedFinding = buildGenerationFailedFinding(input.error);
  const failedRun = await input.repository.updateAppGenerationRun({
    ...input.run,
    status: 'failed',
    validationFindings: [...input.run.validationFindings, failedFinding],
    updatedAt: input.now(),
  });
  await updateGenerationPlanStepInWorkspace({
    repository: input.repository,
    run: failedRun,
    id: 'author_workspace',
    status: 'failed',
    now: failedRun.updatedAt,
    diagnosticCount: failedRun.validationFindings.length,
  });
  await saveGenerationWorkspaceFindings({
    repository: input.repository,
    run: failedRun,
    validationFindings: failedRun.validationFindings,
  });
  await recordGenerationActivity({
    repository: input.repository,
    run: failedRun,
    eventType: 'app_generation.failed',
    status: 'failed',
    summary: 'App package generation failed before a package could be saved.',
  });

  return failedRun;
}

async function saveGenerationWorkspaceFindings(input: {
  repository: Pick<
    PackageReviewRepository,
    'saveAppGenerationWorkspace' | 'getAppGenerationWorkspaceByGenerationId'
  >;
  run: AppGenerationRunRecord;
  validationFindings: AppGenerationValidationFinding[];
}): Promise<AppGenerationWorkspaceRecord | null> {
  const workspace = await input.repository.getAppGenerationWorkspaceByGenerationId(
    input.run.generationId,
  );

  if (workspace === null) {
    return null;
  }

  return await input.repository.saveAppGenerationWorkspace({
    ...workspace,
    validationFindings: input.validationFindings,
    repairAttemptCount: input.run.repairAttemptCount,
    updatedAt: input.run.updatedAt,
  });
}

function selectTypeScriptCompilerInputFiles(
  files: readonly AppWriterWorkspaceFile[],
): AppWriterWorkspaceFile[] {
  const selectedFiles = new Map<string, AppWriterWorkspaceFile>();

  for (const file of selectPackageWorkspaceFiles(files)) {
    selectedFiles.set(file.path, file);
  }

  for (const file of files) {
    if (isTypeScriptAuthoringSourcePath(file.path)) {
      selectedFiles.set(file.path, {
        ...file,
        role: 'package',
      });
    }
  }

  return [...selectedFiles.values()];
}

function projectTypeScriptAuthoringWorkspaceFiles(input: {
  baseFiles: readonly AppWriterWorkspaceFile[];
  compiledFiles: readonly AppWriterWorkspaceFile[];
}): AppWriterWorkspaceFile[] {
  const nonPackageFiles = selectNonPackageWorkspaceFiles(input.baseFiles);
  const authoringSourceFiles = [...input.baseFiles, ...input.compiledFiles]
    .filter((file) => isTypeScriptAuthoringSourcePath(file.path))
    .map(
      (file): AppWriterWorkspaceFile => ({
        ...file,
        role: 'evidence',
      }),
    );
  const packageFiles = input.compiledFiles.filter(
    (file) => !isTypeScriptAuthoringSourcePath(file.path),
  );

  return mergeWorkspaceFiles([...nonPackageFiles, ...authoringSourceFiles], packageFiles);
}

function isTypeScriptAuthoringSourcePath(path: string): boolean {
  return TYPESCRIPT_AUTHORING_SOURCE_PATHS.has(path);
}

async function previewGeneratedPackage(input: {
  input: RunAppPackageGenerationInput;
  contextSelection: AppWriterContextSelection;
  generation: AppPackageGenerationResult;
  run: AppGenerationRunRecord;
  validationFindings: AppGenerationValidationFinding[];
  now: () => string;
}): Promise<{
  run: AppGenerationRunRecord;
  findings: AppGenerationValidationFinding[];
}> {
  if (input.input.previewer === undefined) {
    await updateGenerationPlanStepInWorkspace({
      repository: input.input.repository,
      run: input.run,
      id: 'preview_runtime',
      status: 'skipped',
      now: input.run.updatedAt,
      summary: 'Preview is not configured for this generation run.',
    });
    return {
      run: input.run,
      findings: input.validationFindings,
    };
  }

  let run = await input.input.repository.updateAppGenerationRun({
    ...input.run,
    status: 'previewing',
    updatedAt: input.now(),
  });
  await updateGenerationPlanStepInWorkspace({
    repository: input.input.repository,
    run,
    id: 'preview_runtime',
    status: 'running',
    now: run.updatedAt,
  });
  await recordGenerationActivity({
    repository: input.input.repository,
    run,
    eventType: 'app_generation.previewing',
    status: 'accepted',
    summary: 'Started Lantern preview checks for the generated package.',
  });

  const previewFindings = await runPreviewIfConfigured(
    input.input,
    input.contextSelection,
    input.generation,
  );
  const findings = [...input.validationFindings, ...previewFindings];

  if (previewFindings.length > 0) {
    run = await input.input.repository.updateAppGenerationRun({
      ...run,
      validationFindings: findings,
      updatedAt: input.now(),
    });
    await recordGenerationActivity({
      repository: input.input.repository,
      run,
      eventType: 'app_generation.previewing',
      status: 'failed',
      summary: 'Generated package failed Lantern preview checks.',
    });
    await updateGenerationPlanStepInWorkspace({
      repository: input.input.repository,
      run,
      id: 'preview_runtime',
      status: 'failed',
      now: run.updatedAt,
      diagnosticCount: previewFindings.length,
    });

    return { run, findings };
  }

  await recordGenerationActivity({
    repository: input.input.repository,
    run,
    eventType: 'app_generation.previewing',
    status: 'succeeded',
    summary: 'Generated package passed Lantern preview checks.',
  });
  await updateGenerationPlanStepInWorkspace({
    repository: input.input.repository,
    run,
    id: 'preview_runtime',
    status: 'succeeded',
    now: run.updatedAt,
  });

  return { run, findings };
}

async function saveGeneratedPackageIfRequested(input: {
  input: RunAppPackageGenerationInput;
  generation: AppPackageGenerationResult;
  run: AppGenerationRunRecord;
  now: () => string;
}): Promise<RunAppPackageGenerationResult | null> {
  if (input.input.savePackage === undefined) {
    await updateGenerationPlanStepInWorkspace({
      repository: input.input.repository,
      run: input.run,
      id: 'save_pending_version',
      status: 'skipped',
      now: input.run.updatedAt,
      summary: 'Saving a pending package version is not configured for this generation run.',
    });
    return null;
  }

  if (input.input.previewer === undefined) {
    const failedRun = await input.input.repository.updateAppGenerationRun({
      ...input.run,
      status: 'failed',
      validationFindings: [...input.run.validationFindings, buildPreviewNotConfiguredFinding()],
      updatedAt: input.now(),
    });
    await recordGenerationActivity({
      repository: input.input.repository,
      run: failedRun,
      eventType: 'app_generation.failed',
      status: 'failed',
      summary: 'Generated package could not be saved because preview is not configured.',
    });

    throw new AppPackageGenerationFailedError(
      'Generated package preview is not configured.',
      failedRun,
    );
  }

  const packageVersion = await savePendingGeneratedPackageVersion({
    repository: input.input.repository,
    importPackageFromSource: input.input.savePackage.importPackageFromSource,
    generation: input.generation,
    ...(input.input.savePackage.storageRoot === undefined
      ? {}
      : { storageRoot: input.input.savePackage.storageRoot }),
  });
  await updateGenerationPlanStepInWorkspace({
    repository: input.input.repository,
    run: input.run,
    id: 'save_pending_version',
    status: 'succeeded',
    now: input.run.updatedAt,
    result: {
      packageVersionId: packageVersion.id,
      appId: packageVersion.appId,
      version: packageVersion.version,
    },
  });
  const run = await input.input.repository.updateAppGenerationRun({
    ...input.run,
    status: 'saved_pending_version',
    packageVersionId: packageVersion.id,
    updatedAt: input.now(),
  });
  await recordGenerationActivity({
    repository: input.input.repository,
    run,
    eventType: 'app_generation.saved_pending_version',
    status: 'succeeded',
    summary: 'Saved generated package as a pending package version.',
    packageVersionId: packageVersion.id,
  });

  return {
    run,
    generation: input.generation,
    packageVersion,
  };
}

async function savePendingGeneratedPackageVersion(input: {
  repository: Pick<PackageReviewRepository, 'registerPackageVersion'>;
  importPackageFromSource: (
    source: PackageSource,
    options?: { storageRoot?: string },
  ) => Promise<ImportedPackageVersion>;
  storageRoot?: string;
  generation: AppPackageGenerationResult;
}): Promise<PackageVersionRecord> {
  const imported = await input.importPackageFromSource(
    createMemoryPackageSource(
      selectPackageWorkspaceFiles(input.generation.files).map((file) => ({
        relativePath: file.path,
        bytes: file.contents,
      })),
    ),
    input.storageRoot === undefined ? {} : { storageRoot: input.storageRoot },
  );

  return await input.repository.registerPackageVersion(imported);
}

export class AppPackageGenerationFailedError extends Error {
  readonly run: AppGenerationRunRecord;

  constructor(message: string, run: AppGenerationRunRecord) {
    super(message);
    this.name = 'AppPackageGenerationFailedError';
    this.run = run;
  }
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

function appendModelRequestMetadata(
  run: AppGenerationRunRecord,
  generation: AppPackageGenerationResult,
): AppGenerationRunRecord['modelRequestMetadata'] {
  return [...run.modelRequestMetadata, ...(generation.modelRequestMetadata ?? [])];
}

function buildStarterMismatchFinding(input: {
  expectedStarterId: string;
  actualStarterId: string;
}): AppGenerationValidationFinding | null {
  if (input.expectedStarterId === input.actualStarterId) {
    return null;
  }

  return {
    code: 'starter_mismatch',
    severity: 'error',
    message: `Generated package selected starter ${input.actualStarterId}, but Lantern selected ${input.expectedStarterId}.`,
    file: null,
    field: '/selected_starter_id',
    fix: 'Regenerate package files against the Lantern-selected starter.',
    detail: {
      expectedStarterId: input.expectedStarterId,
      actualStarterId: input.actualStarterId,
    },
  };
}

function buildGenerationFailedFinding(error: unknown): AppGenerationValidationFinding {
  const message = error instanceof Error ? error.message : 'App package generation failed.';
  const isTimeout = isGenerationTimeoutMessage(message);
  const isModelOutputContractError = isModelOutputContractMessage(message);
  const isProviderInternalError = isGenerationProviderInternalErrorMessage(message);
  const isProviderCapacityError = isGenerationProviderCapacityErrorMessage(message);

  return {
    code: isTimeout
      ? 'generation_model_timeout'
      : isProviderCapacityError
        ? 'generation_model_capacity_exceeded'
        : 'generation_failed',
    severity: 'error',
    message,
    file: null,
    field: null,
    fix: isTimeout
      ? 'Retry generation. Lantern runs generation in durable staged background work; repeated timeouts point to model/provider latency for the current stage.'
      : isModelOutputContractError
        ? 'Retry generation. Lantern rejects model output unless the current generation stage returns valid JSON for its contract.'
        : isProviderInternalError
          ? 'Retry generation. The model provider returned an internal error during the current app writer stage.'
          : isProviderCapacityError
            ? 'Retry generation. The model provider reported temporary capacity exhaustion after Lantern used its bounded retry attempts.'
            : 'Check the model configuration or retry generation.',
    detail: isTimeout
      ? { providerError: 'timeout' }
      : isModelOutputContractError
        ? { providerError: 'model_output_contract' }
        : isProviderInternalError
          ? { providerError: 'internal_server_error' }
          : isProviderCapacityError
            ? { providerError: 'capacity_exceeded' }
            : {},
  };
}

function isGenerationTimeoutMessage(message: string): boolean {
  const normalized = message.toLowerCase();

  return normalized.includes('timeout') || normalized.includes('timed out');
}

function isModelOutputContractMessage(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes('invalid json') ||
    normalized.includes('normalizedrequest') ||
    normalized.includes('appplan') ||
    normalized.includes('fileedits') ||
    normalized.includes('selectedstarterid') ||
    normalized.includes('progressupdates')
  );
}

function isGenerationProviderInternalErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();

  return normalized.includes('internal server error') || normalized.includes('8008');
}

function isGenerationProviderCapacityErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes('3040') ||
    normalized.includes('capacity temporarily exceeded') ||
    normalized.includes('temporarily overloaded')
  );
}

function buildPreviewNotConfiguredFinding(): AppGenerationValidationFinding {
  return {
    code: 'preview_not_configured',
    severity: 'error',
    message: 'Generated packages must pass Lantern preview before they can be saved.',
    file: null,
    field: null,
    fix: 'Configure an app package previewer for this generation environment.',
    detail: {},
  };
}

function buildTypeScriptCompilerMissingFinding(): AppGenerationValidationFinding {
  return {
    code: 'typescript_compiler_unavailable',
    severity: 'error',
    message: 'Generated package returned TypeScript source, but no source compiler is configured.',
    file: null,
    field: null,
    fix: 'Configure the Lantern TypeScript source compiler or regenerate browser-ready package files.',
    detail: {},
  };
}
