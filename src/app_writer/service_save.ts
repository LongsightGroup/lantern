import type { AppGenerationRunRecord, AppPackageGenerationResult } from './types.ts';
import {
  AppPackageGenerationFailedError,
  buildPreviewNotConfiguredFinding,
} from './service_failures.ts';
import { recordGenerationActivity } from './service_audit.ts';
import type {
  RunAppPackageGenerationInput,
  RunAppPackageGenerationResult,
} from './service_core.ts';
import { updateGenerationPlanStepInWorkspace } from './service_workspace_snapshot.ts';
import type { ImportedPackageVersion } from '../package_review/intake.ts';
import { createMemoryPackageSource } from '../package_review/package_source.ts';
import type { PackageSource } from '../package_review/package_source.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import { selectPackageWorkspaceFiles } from './workspace_files.ts';

export async function saveGeneratedPackageIfRequested(input: {
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
