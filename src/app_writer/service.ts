import type { AppPackageGenerator } from './package_generator.ts';
import { type AppWriterContextSelection, selectAppWriterContext } from './context.ts';
import { validateGeneratedAppPackage } from './validation.ts';
import type {
  AppGenerationProgressUpdate,
  AppGenerationRunRecord,
  AppGenerationValidationFinding,
  AppPackageGenerationResult,
  AppPackagePreviewer,
  AppPackageSourceCompiler,
} from './types.ts';
import { hasTypeScriptAuthoringSource } from './source_compiler.ts';
import type { ImportedPackageVersion } from '../package_review/intake.ts';
import type { PackageSource } from '../package_review/package_source.ts';
import { createMemoryPackageSource } from '../package_review/package_source.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { AuditEventStatus, PackageVersionRecord } from '../package_review/types.ts';

export interface RunAppPackageGenerationInput {
  repository: Pick<
    PackageReviewRepository,
    | 'createAppGenerationRun'
    | 'updateAppGenerationRun'
    | 'registerPackageVersion'
    | 'recordAuditEvent'
  >;
  generator: AppPackageGenerator;
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
  maxRepairAttempts?: number;
  now?: () => string;
}

export interface RunAppPackageGenerationResult {
  run: AppGenerationRunRecord;
  generation: AppPackageGenerationResult;
  packageVersion: PackageVersionRecord | null;
}

export interface StartedAppPackageGenerationRun {
  run: AppGenerationRunRecord;
  continueGeneration: () => Promise<RunAppPackageGenerationResult>;
}

export interface ContinueAppPackageGenerationRunInput {
  repository: RunAppPackageGenerationInput['repository'] &
    Pick<PackageReviewRepository, 'getAppGenerationRunById'>;
  generator: AppPackageGenerator;
  previewer?: AppPackagePreviewer;
  sourceCompiler?: AppPackageSourceCompiler;
  savePackage?: RunAppPackageGenerationInput['savePackage'];
  generationId: string;
  maxRepairAttempts?: number;
  now?: () => string;
}

const DEFAULT_MAX_REPAIR_ATTEMPTS = 1;

export const APP_GENERATION_AUDIT_EVENT_TYPES = [
  'app_generation.started',
  'app_generation.generating',
  'app_generation.validating',
  'app_generation.repairing',
  'app_generation.previewing',
  'app_generation.saved_pending_version',
  'app_generation.failed',
] as const;

export async function startAppPackageGenerationRun(
  input: RunAppPackageGenerationInput,
): Promise<StartedAppPackageGenerationRun> {
  const now = input.now ?? (() => new Date().toISOString());
  const createdAt = now();
  const requestedAppId = input.requestedAppId ?? null;
  const contextSelection = selectAppWriterContext({
    promptText: input.promptText,
    requestedAppId,
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

  if (run.status !== 'started') {
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

  run = await input.repository.updateAppGenerationRun({
    ...run,
    status: 'generating_package',
    updatedAt: now(),
  });
  await recordGenerationActivity({
    repository: input.repository,
    run,
    eventType: 'app_generation.generating',
    status: 'accepted',
    summary: 'Asked the app package generator for package files.',
  });

  try {
    const generatorInput = {
      generationId: input.generationId,
      ownerId: input.ownerId,
      promptText: input.promptText,
      requestedAppId,
      selectedStarterId: contextSelection.starterId,
      selectedContext: contextSelection.selectedContext,
      createdAt,
    };
    const maxRepairAttempts = input.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS;
    let generation = await input.generator.generate(generatorInput);
    let repairAttempt = 0;

    while (true) {
      const starterFinding = buildStarterMismatchFinding({
        expectedStarterId: contextSelection.starterId,
        actualStarterId: generation.selectedStarterId,
      });

      if (starterFinding !== null) {
        const failedRun = await input.repository.updateAppGenerationRun({
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
          updatedAt: now(),
        });
        await recordGenerationActivity({
          repository: input.repository,
          run: failedRun,
          eventType: 'app_generation.failed',
          status: 'failed',
          summary: 'Generated package selected the wrong Lantern starter.',
        });

        throw new AppPackageGenerationFailedError(
          `Generated package starter ${generation.selectedStarterId} did not match selected starter ${contextSelection.starterId}.`,
          failedRun,
        );
      }

      await recordGenerationProgressUpdates({
        repository: input.repository,
        run,
        eventType: repairAttempt === 0 ? 'app_generation.generating' : 'app_generation.repairing',
        updates: generation.progressUpdates,
      });

      if (hasTypeScriptAuthoringSource(generation.files)) {
        const compiled = await compileTypeScriptSourceIfNeeded({
          input,
          generation,
          contextSelection,
        });
        generation = {
          ...generation,
          files: compiled.files,
          notes: [...generation.notes, ...compiled.notes],
          validationFindings: [...generation.validationFindings, ...compiled.validationFindings],
        };
      }

      const validationFindings = [
        ...generation.validationFindings,
        ...(await validateGeneratedAppPackage({
          selectedStarterId: contextSelection.starterId,
          files: generation.files,
        })),
      ];

      run = await input.repository.updateAppGenerationRun({
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
        updatedAt: now(),
      });
      await recordGenerationActivity({
        repository: input.repository,
        run,
        eventType: 'app_generation.validating',
        status: validationFindings.some((finding) => finding.severity === 'error')
          ? 'failed'
          : 'succeeded',
        summary: validationFindings.some((finding) => finding.severity === 'error')
          ? 'Generated package failed Lantern validation.'
          : 'Generated package passed Lantern validation.',
      });

      if (!validationFindings.some((finding) => finding.severity === 'error')) {
        const previewed = await previewGeneratedPackage({
          input,
          contextSelection,
          generation,
          run,
          validationFindings,
          now,
        });
        run = previewed.run;

        if (!previewed.findings.some((finding) => finding.severity === 'error')) {
          const saved = await saveGeneratedPackageIfRequested({
            input,
            generation,
            run,
            now,
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

      if (repairAttempt >= maxRepairAttempts || typeof input.generator.repair !== 'function') {
        const failedRun = await input.repository.updateAppGenerationRun({
          ...run,
          status: 'failed',
          updatedAt: now(),
        });
        await recordGenerationActivity({
          repository: input.repository,
          run: failedRun,
          eventType: 'app_generation.failed',
          status: 'failed',
          summary: 'Generated package failed after repair attempts were exhausted.',
        });

        throw new AppPackageGenerationFailedError(
          'Generated package failed validation.',
          failedRun,
        );
      }

      repairAttempt += 1;
      run = await input.repository.updateAppGenerationRun({
        ...run,
        status: 'repairing',
        repairAttemptCount: repairAttempt,
        updatedAt: now(),
      });
      await recordGenerationActivity({
        repository: input.repository,
        run,
        eventType: 'app_generation.repairing',
        status: 'accepted',
        summary: 'Asked the app package generator to repair validation or preview findings.',
      });
      generation = await input.generator.repair({
        ...generatorInput,
        repairAttempt,
        previousResult: generation,
        validationFindings: run.validationFindings,
      });
    }
  } catch (error) {
    if (error instanceof AppPackageGenerationFailedError) {
      throw error;
    }

    const failedRun = await input.repository.updateAppGenerationRun({
      ...run,
      status: 'failed',
      validationFindings: [...run.validationFindings, buildGenerationFailedFinding(error)],
      updatedAt: now(),
    });
    await recordGenerationActivity({
      repository: input.repository,
      run: failedRun,
      eventType: 'app_generation.failed',
      status: 'failed',
      summary: 'App package generation failed before a package could be saved.',
    });

    throw new AppPackageGenerationFailedError(
      error instanceof Error ? error.message : 'App package generation failed.',
      failedRun,
    );
  }
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
      files: input.generation.files,
      notes: [],
      validationFindings: [buildTypeScriptCompilerMissingFinding()],
    };
  }

  return await compiler.compile({
    generationId: input.input.generationId,
    appPlan: input.generation.appPlan,
    selectedStarterId: input.contextSelection.starterId,
    files: input.generation.files,
  });
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

    return { run, findings };
  }

  await recordGenerationActivity({
    repository: input.input.repository,
    run,
    eventType: 'app_generation.previewing',
    status: 'succeeded',
    summary: 'Generated package passed Lantern preview checks.',
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
      input.generation.files.map((file) => ({
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

  return {
    code: isTimeout ? 'generation_model_timeout' : 'generation_failed',
    severity: 'error',
    message,
    file: null,
    field: null,
    fix: isTimeout
      ? 'Retry generation or move this run onto durable staged background generation.'
      : 'Check the model configuration or retry generation.',
    detail: isTimeout ? { providerError: 'timeout' } : {},
  };
}

function isGenerationTimeoutMessage(message: string): boolean {
  const normalized = message.toLowerCase();

  return normalized.includes('timeout') || normalized.includes('timed out');
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
