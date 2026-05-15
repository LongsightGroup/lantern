import type { AppPackageGenerator } from './package_generator.ts';
import { AppPackageGenerationFailedError, runAppPackageGeneration } from './service.ts';
import type { AppPackagePreviewer } from './types.ts';
import type { AppWriterEvaluationPrompt } from './evaluation_corpus.ts';
import type { PackageSource } from '../package_review/package_source.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { ImportedPackageVersion } from '../package_review/intake.ts';

export interface AppWriterEvaluationResult {
  promptId: string;
  expectedStarterId: string;
  selectedStarterId: string | null;
  status: 'passed' | 'failed';
  generationStatus: string;
  repairAttemptCount: number;
  validationFindingCount: number;
  previewPassed: boolean;
  packageVersionId: number | null;
}

export async function runAppWriterEvaluationPrompt(input: {
  prompt: AppWriterEvaluationPrompt;
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
  previewer: AppPackagePreviewer;
  importPackageFromSource?: (
    source: PackageSource,
    options?: { storageRoot?: string },
  ) => Promise<ImportedPackageVersion>;
  now?: () => string;
}): Promise<AppWriterEvaluationResult> {
  try {
    const result = await runAppPackageGeneration({
      repository: input.repository,
      generator: input.generator,
      previewer: input.previewer,
      generationId: `evaluation-${input.prompt.id}`,
      ownerId: 'evaluation',
      promptText: input.prompt.promptText,
      ...(input.now === undefined ? {} : { now: input.now }),
      ...(input.importPackageFromSource === undefined
        ? {}
        : {
            savePackage: {
              importPackageFromSource: input.importPackageFromSource,
            },
          }),
    });

    return {
      promptId: input.prompt.id,
      expectedStarterId: input.prompt.expectedStarterId,
      selectedStarterId: result.run.selectedStarterId,
      status: result.run.validationFindings.length === 0 ? 'passed' : 'failed',
      generationStatus: result.run.status,
      repairAttemptCount: result.run.repairAttemptCount,
      validationFindingCount: result.run.validationFindings.length,
      previewPassed:
        result.run.status === 'previewing' || result.run.status === 'saved_pending_version',
      packageVersionId: result.run.packageVersionId,
    };
  } catch (error) {
    const run = error instanceof AppPackageGenerationFailedError ? error.run : null;

    return {
      promptId: input.prompt.id,
      expectedStarterId: input.prompt.expectedStarterId,
      selectedStarterId: run === null ? null : run.selectedStarterId,
      status: 'failed',
      generationStatus: run === null ? 'failed' : run.status,
      repairAttemptCount: run === null ? 0 : run.repairAttemptCount,
      validationFindingCount: run === null ? 1 : run.validationFindings.length,
      previewPassed: false,
      packageVersionId: run === null ? null : run.packageVersionId,
    };
  }
}
