import { AppPackageGenerationFailedError, continueAppPackageGenerationRun } from './service.ts';
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

export async function runAppGenerationWorkflow(input: {
  bindings: WorkerBindings;
  params: AppGenerationWorkflowParams;
}): Promise<AppGenerationWorkflowResult> {
  const generationId = validateGenerationId(input.params.generationId);
  const services = resolveWorkerServices(input.bindings, createObjectEnvReader(input.bindings));
  const repository = services.getRepository();

  try {
    const result = await continueAppPackageGenerationRun({
      repository,
      generator: services.appPackageGenerator,
      previewer: services.appPackagePreviewer,
      sourceCompiler: services.appPackageSourceCompiler,
      savePackage: {
        importPackageFromSource: services.importPackageFromSource,
      },
      generationId,
    });

    return {
      generationId,
      status: result.run.status,
      packageVersionId: result.run.packageVersionId,
    };
  } catch (error) {
    if (error instanceof AppPackageGenerationFailedError) {
      return {
        generationId,
        status: error.run.status,
        packageVersionId: error.run.packageVersionId,
        errorMessage: error.message,
      };
    }

    throw error;
  }
}

function validateGenerationId(value: string): string {
  const generationId = value.trim();

  if (generationId === '') {
    throw new Error('App generation Workflow requires generationId.');
  }

  return generationId;
}
