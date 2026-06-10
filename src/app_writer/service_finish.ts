import type { AppWriterContextSelection } from './context.ts';
import {
  validateGeneratedAppPackage,
  validateGeneratedAppPackagePlanAlignment,
} from './validation.ts';
import type {
  AppGenerationRunRecord,
  AppGenerationValidationFinding,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
} from './types.ts';
import { hasTypeScriptAuthoringSource } from './source_compiler.ts';
import { APP_WRITER_DEFAULT_MAX_REPAIR_ATTEMPTS } from './recipe.ts';
import {
  appendModelRequestMetadata,
  AppPackageGenerationFailedError,
  buildStarterMismatchFinding,
} from './service_failures.ts';
import { failRepairingGenerationRun, failRunForStarterMismatch } from './service_failure_runs.ts';
import { previewGeneratedPackage } from './service_preview.ts';
import { saveGeneratedPackageIfRequested } from './service_save.ts';
import { compileTypeScriptSourceIfNeeded } from './service_typescript.ts';
import { recordGenerationActivity, recordGenerationProgressUpdates } from './service_audit.ts';
import {
  saveGenerationWorkspaceSnapshot,
  updateGenerationPlanStepInWorkspace,
} from './service_workspace_snapshot.ts';
import { targetVersionForContext, validateRevisionPackageIdentity } from './service_revision.ts';
import type {
  RunAppPackageGenerationInput,
  RunAppPackageGenerationResult,
} from './service_core.ts';

interface FinishState {
  run: AppGenerationRunRecord;
  generation: AppPackageGenerationResult;
  repairAttempt: number;
}

type FinishStageResult =
  | { kind: 'complete'; result: RunAppPackageGenerationResult }
  | { kind: 'repair'; state: FinishState };

export async function finishGeneratedPackage(input: {
  input: RunAppPackageGenerationInput;
  now: () => string;
  generatorInput: AppPackageGenerationInput;
  contextSelection: AppWriterContextSelection;
  run: AppGenerationRunRecord;
  generation: AppPackageGenerationResult;
  repairAttempt: number;
}): Promise<RunAppPackageGenerationResult> {
  const maxRepairAttempts = input.input.maxRepairAttempts ?? APP_WRITER_DEFAULT_MAX_REPAIR_ATTEMPTS;
  let state: FinishState = {
    run: input.run,
    generation: input.generation,
    repairAttempt: input.repairAttempt,
  };

  while (true) {
    const result = await runFinishValidationCycle({
      ...input,
      state,
      maxRepairAttempts,
    });

    if (result.kind === 'complete') {
      return result.result;
    }

    state = await repairGeneratedPackage({
      ...input,
      state: result.state,
    });
  }
}

async function runFinishValidationCycle(input: {
  input: RunAppPackageGenerationInput;
  now: () => string;
  contextSelection: AppWriterContextSelection;
  state: FinishState;
  maxRepairAttempts: number;
}): Promise<FinishStageResult> {
  let state = await checkStarterMismatch(input);
  state = await compileTypeScriptIfNeeded({
    ...input,
    state,
  });
  state = await validateGeneratedPackage({
    ...input,
    state,
  });

  if (hasErrorFindings(state.run.validationFindings)) {
    return resolveRepairOrFail(input, state);
  }

  return await previewAndMaybeSave({
    ...input,
    state,
  });
}

async function resolveRepairOrFail(
  input: {
    input: RunAppPackageGenerationInput;
    now: () => string;
    state: FinishState;
    maxRepairAttempts: number;
  },
  state: FinishState,
): Promise<FinishStageResult> {
  if (state.repairAttempt >= input.maxRepairAttempts) {
    await failExhaustedRepairAttempts({
      input: input.input,
      run: state.run,
      now: input.now,
    });
  }

  return { kind: 'repair', state };
}

async function checkStarterMismatch(input: {
  input: RunAppPackageGenerationInput;
  now: () => string;
  contextSelection: AppWriterContextSelection;
  state: FinishState;
}): Promise<FinishState> {
  const starterFinding = buildStarterMismatchFinding({
    expectedStarterId: input.contextSelection.starterId,
    actualStarterId: input.state.generation.selectedStarterId,
  });

  if (starterFinding === null) {
    await recordGenerationProgressUpdates({
      repository: input.input.repository,
      run: input.state.run,
      eventType: input.state.repairAttempt === 0
        ? 'app_generation.generating'
        : 'app_generation.repairing',
      updates: input.state.generation.progressUpdates,
    });
    return input.state;
  }

  return await failRunForStarterMismatch({
    repository: input.input.repository,
    run: input.state.run,
    contextSelection: input.contextSelection,
    starterFinding,
    packageSnapshot: {
      normalizedRequest: input.state.generation.normalizedRequest,
      appPlan: input.state.generation.appPlan,
      selectedStarterId: input.state.generation.selectedStarterId,
      notes: [...input.state.generation.notes],
      validationFindings: [
        starterFinding,
        ...input.state.generation.validationFindings,
      ],
    },
    generation: input.state.generation,
    repairAttemptCount: input.state.repairAttempt,
    now: input.now,
    activitySummary: 'Generated package selected the wrong Lantern starter.',
    errorMessage:
      `Generated package starter ${input.state.generation.selectedStarterId} did not match selected starter ${input.contextSelection.starterId}.`,
  });
}

async function compileTypeScriptIfNeeded(input: {
  input: RunAppPackageGenerationInput;
  state: FinishState;
}): Promise<FinishState> {
  if (!hasTypeScriptAuthoringSource(input.state.generation.files)) {
    await updateGenerationPlanStepInWorkspace({
      repository: input.input.repository,
      run: input.state.run,
      id: 'typecheck_source',
      status: 'skipped',
      now: input.state.run.updatedAt,
      summary: 'No TypeScript source files were present for compilation.',
    });
    await saveGenerationWorkspaceSnapshot({
      repository: input.input.repository,
      run: input.state.run,
      generation: input.state.generation,
      validationFindings: input.state.generation.validationFindings,
    });
    return input.state;
  }

  await updateGenerationPlanStepInWorkspace({
    repository: input.input.repository,
    run: input.state.run,
    id: 'typecheck_source',
    status: 'running',
    now: input.state.run.updatedAt,
  });
  const compiled = await compileTypeScriptSourceIfNeeded({
    input: input.input,
    generation: input.state.generation,
  });
  const generation = {
    ...input.state.generation,
    files: compiled.files,
    notes: [...input.state.generation.notes, ...compiled.notes],
    validationFindings: [
      ...input.state.generation.validationFindings,
      ...compiled.validationFindings,
    ],
  };
  await updateGenerationPlanStepInWorkspace({
    repository: input.input.repository,
    run: input.state.run,
    id: 'typecheck_source',
    status: hasErrorFindings(compiled.validationFindings) ? 'failed' : 'succeeded',
    now: input.state.run.updatedAt,
    diagnosticCount: compiled.validationFindings.length,
  });
  await saveGenerationWorkspaceSnapshot({
    repository: input.input.repository,
    run: input.state.run,
    generation,
    validationFindings: generation.validationFindings,
  });

  return {
    ...input.state,
    generation,
  };
}

async function validateGeneratedPackage(input: {
  input: RunAppPackageGenerationInput;
  now: () => string;
  contextSelection: AppWriterContextSelection;
  state: FinishState;
}): Promise<FinishState> {
  const validationFindings = [
    ...input.state.generation.validationFindings,
    ...validateRevisionPackageIdentity({
      contextSelection: input.contextSelection,
      files: input.state.generation.files,
    }),
    ...validateGeneratedAppPackagePlanAlignment({
      appPlan: input.state.generation.appPlan,
      files: input.state.generation.files,
    }),
    ...(await validateGeneratedAppPackage({
      selectedStarterId: input.contextSelection.starterId,
      files: input.state.generation.files,
    })),
  ];
  await updateGenerationPlanStepInWorkspace({
    repository: input.input.repository,
    run: input.state.run,
    id: 'validate_package',
    status: hasErrorFindings(validationFindings) ? 'failed' : 'succeeded',
    now: input.state.run.updatedAt,
    diagnosticCount: validationFindings.length,
  });

  const run = await input.input.repository.updateAppGenerationRun({
    ...input.state.run,
    status: 'validating',
    normalizedRequest: input.state.generation.normalizedRequest,
    appPlan: input.state.generation.appPlan,
    selectedStarterId: input.state.generation.selectedStarterId,
    generatedAppId: input.state.generation.appPlan.appId,
    generatedVersion: targetVersionForContext(input.contextSelection),
    modelRequestMetadata: appendModelRequestMetadata(input.state.run, input.state.generation),
    generationNotes: [...input.state.generation.notes],
    validationFindings,
    repairAttemptCount: input.state.repairAttempt,
    updatedAt: input.now(),
  });
  await recordGenerationActivity({
    repository: input.input.repository,
    run,
    eventType: 'app_generation.validating',
    status: hasErrorFindings(validationFindings) ? 'failed' : 'succeeded',
    summary: hasErrorFindings(validationFindings)
      ? 'Generated package failed Lantern validation.'
      : 'Generated package passed Lantern validation.',
  });
  await saveGenerationWorkspaceSnapshot({
    repository: input.input.repository,
    run,
    generation: input.state.generation,
    validationFindings,
  });

  return {
    ...input.state,
    run,
  };
}

async function previewAndMaybeSave(input: {
  input: RunAppPackageGenerationInput;
  now: () => string;
  contextSelection: AppWriterContextSelection;
  state: FinishState;
}): Promise<FinishStageResult> {
  const previewed = await previewGeneratedPackage({
    input: input.input,
    contextSelection: input.contextSelection,
    generation: input.state.generation,
    run: input.state.run,
    validationFindings: input.state.run.validationFindings,
    now: input.now,
  });
  const state = {
    ...input.state,
    run: previewed.run,
  };
  await saveGenerationWorkspaceSnapshot({
    repository: input.input.repository,
    run: state.run,
    generation: state.generation,
    validationFindings: previewed.findings,
  });

  if (hasErrorFindings(previewed.findings)) {
    return {
      kind: 'repair',
      state: {
        ...state,
        run: {
          ...state.run,
          validationFindings: previewed.findings,
        },
      },
    };
  }

  const saved = await saveGeneratedPackageIfRequested({
    input: input.input,
    generation: state.generation,
    run: state.run,
    now: input.now,
  });

  return {
    kind: 'complete',
    result: saved ?? {
      run: state.run,
      generation: state.generation,
      packageVersion: null,
    },
  };
}

async function failExhaustedRepairAttempts(input: {
  input: RunAppPackageGenerationInput;
  run: AppGenerationRunRecord;
  now: () => string;
}): Promise<never> {
  const failedRun = await input.input.repository.updateAppGenerationRun({
    ...input.run,
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

async function repairGeneratedPackage(input: {
  input: RunAppPackageGenerationInput;
  now: () => string;
  generatorInput: AppPackageGenerationInput;
  state: FinishState;
}): Promise<FinishState> {
  const repairAttempt = input.state.repairAttempt + 1;
  const run = await input.input.repository.updateAppGenerationRun({
    ...input.state.run,
    status: 'repairing',
    repairAttemptCount: repairAttempt,
    updatedAt: input.now(),
  });
  await recordGenerationActivity({
    repository: input.input.repository,
    run,
    eventType: 'app_generation.repairing',
    status: 'accepted',
    summary: 'Asked the app writer workspace harness to repair validation or preview findings.',
  });
  await updateGenerationPlanStepInWorkspace({
    repository: input.input.repository,
    run,
    id: 'repair_if_needed',
    status: 'running',
    now: run.updatedAt,
    diagnosticCount: run.validationFindings.length,
  });

  let generation: AppPackageGenerationResult;

  try {
    generation = await input.input.workspaceRunner.repair({
      ...input.generatorInput,
      repairAttempt,
      previousResult: input.state.generation,
      validationFindings: run.validationFindings,
      currentWorkspace: await input.input.repository.getAppGenerationWorkspaceByGenerationId(
        run.generationId,
      ),
    });
  } catch (error) {
    const failedRun = await failRepairingGenerationRun({
      repository: input.input.repository,
      run,
      generation: input.state.generation,
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
    status: hasErrorFindings(generation.validationFindings) ? 'failed' : 'succeeded',
    now: run.updatedAt,
    diagnosticCount: generation.validationFindings.length,
  });
  await saveGenerationWorkspaceSnapshot({
    repository: input.input.repository,
    run,
    generation,
    validationFindings: generation.validationFindings,
  });

  return {
    run,
    generation,
    repairAttempt,
  };
}

function hasErrorFindings(findings: readonly AppGenerationValidationFinding[]): boolean {
  return findings.some((finding) => finding.severity === 'error');
}
