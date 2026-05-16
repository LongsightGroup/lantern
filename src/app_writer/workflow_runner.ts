import {
  AppPackageGenerationFailedError,
  finishGeneratedAppPackageRun,
  generateAppPackageFilesForPlannedRun,
  type GeneratedAppPackageFilesRun,
  initializeAppPackageGenerationRun,
  type InitializedAppPackageGenerationRun,
  planAppPackageGenerationRun,
  type PlannedAppPackageGenerationRun,
} from './service.ts';
import type { AppGenerationWorkflowParams } from './workflow_scheduler.ts';
import { resolveWorkerServices, type WorkerBindings } from '../app_worker_services.ts';
import { createObjectEnvReader } from '../platform/env.ts';

export type { AppGenerationWorkflowParams } from './workflow_scheduler.ts';

export interface AppGenerationWorkflowResult {
  generationId: string;
  status: string;
  packageVersionId: number | null;
  errorMessage?: string;
}

export type AppGenerationWorkflowStageResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      result: AppGenerationWorkflowResult;
    };

export async function runAppGenerationWorkflow(input: {
  bindings: WorkerBindings;
  params: AppGenerationWorkflowParams;
}): Promise<AppGenerationWorkflowResult> {
  const initialized = await runAppGenerationInitializationWorkflowStep(input);

  if (!initialized.ok) {
    return initialized.result;
  }

  const planned = await runAppGenerationPlanningWorkflowStep({
    bindings: input.bindings,
    initialized: initialized.value,
  });

  if (!planned.ok) {
    return planned.result;
  }

  const generated = await runAppGenerationFileWorkflowStep({
    bindings: input.bindings,
    planned: planned.value,
  });

  if (!generated.ok) {
    return generated.result;
  }

  return await runAppGenerationFinishWorkflowStep({
    bindings: input.bindings,
    generated: generated.value,
  });
}

export async function runAppGenerationPlanningWorkflowStep(input: {
  bindings: WorkerBindings;
  initialized: InitializedAppPackageGenerationRun;
}): Promise<AppGenerationWorkflowStageResult<PlannedAppPackageGenerationRun>> {
  const services = resolveWorkerServices(input.bindings, createObjectEnvReader(input.bindings));

  try {
    return {
      ok: true,
      value: await planAppPackageGenerationRun({
        repository: services.getRepository(),
        workspaceRunner: services.appWriterWorkspaceRunner,
        generationId: input.initialized.run.generationId,
      }),
    };
  } catch (error) {
    const result = toHandledWorkflowFailure(input.initialized.run.generationId, error);

    if (result !== null) {
      return {
        ok: false,
        result,
      };
    }

    throw error;
  }
}

export async function runAppGenerationInitializationWorkflowStep(input: {
  bindings: WorkerBindings;
  params: AppGenerationWorkflowParams;
}): Promise<AppGenerationWorkflowStageResult<InitializedAppPackageGenerationRun>> {
  const generationId = validateGenerationId(input.params.generationId);
  const services = resolveWorkerServices(input.bindings, createObjectEnvReader(input.bindings));

  try {
    return {
      ok: true,
      value: await initializeAppPackageGenerationRun({
        repository: services.getRepository(),
        workspaceRunner: services.appWriterWorkspaceRunner,
        previewer: services.appPackagePreviewer,
        sourceCompiler: services.appPackageSourceCompiler,
        savePackage: {
          importPackageFromSource: services.importPackageFromSource,
        },
        generationId,
      }),
    };
  } catch (error) {
    const result = toHandledWorkflowFailure(generationId, error);

    if (result !== null) {
      return {
        ok: false,
        result,
      };
    }

    throw error;
  }
}

export async function runAppGenerationFileWorkflowStep(input: {
  bindings: WorkerBindings;
  planned: PlannedAppPackageGenerationRun;
}): Promise<AppGenerationWorkflowStageResult<GeneratedAppPackageFilesRun>> {
  const services = resolveWorkerServices(input.bindings, createObjectEnvReader(input.bindings));

  try {
    return {
      ok: true,
      value: await generateAppPackageFilesForPlannedRun({
        repository: services.getRepository(),
        workspaceRunner: services.appWriterWorkspaceRunner,
        planned: input.planned,
      }),
    };
  } catch (error) {
    const result = toHandledWorkflowFailure(input.planned.run.generationId, error);

    if (result !== null) {
      return {
        ok: false,
        result,
      };
    }

    throw error;
  }
}

export async function runAppGenerationFinishWorkflowStep(input: {
  bindings: WorkerBindings;
  generated: GeneratedAppPackageFilesRun;
}): Promise<AppGenerationWorkflowResult> {
  const services = resolveWorkerServices(input.bindings, createObjectEnvReader(input.bindings));

  try {
    const result = await finishGeneratedAppPackageRun({
      repository: services.getRepository(),
      workspaceRunner: services.appWriterWorkspaceRunner,
      previewer: services.appPackagePreviewer,
      sourceCompiler: services.appPackageSourceCompiler,
      savePackage: {
        importPackageFromSource: services.importPackageFromSource,
      },
      generated: input.generated,
    });

    return {
      generationId: result.run.generationId,
      status: result.run.status,
      packageVersionId: result.run.packageVersionId,
    };
  } catch (error) {
    const result = toHandledWorkflowFailure(input.generated.run.generationId, error);

    if (result !== null) {
      return result;
    }

    throw error;
  }
}

function toHandledWorkflowFailure(
  generationId: string,
  error: unknown,
): AppGenerationWorkflowResult | null {
  if (!(error instanceof AppPackageGenerationFailedError)) {
    return null;
  }

  return {
    generationId,
    status: error.run.status,
    packageVersionId: error.run.packageVersionId,
    errorMessage: error.message,
  };
}

function validateGenerationId(value: string): string {
  const generationId = value.trim();

  if (generationId === '') {
    throw new Error('App generation Workflow requires generationId.');
  }

  return generationId;
}
