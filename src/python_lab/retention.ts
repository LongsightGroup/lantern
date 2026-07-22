import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { PythonLabArtifactStore } from './artifact_store.ts';
import { PYTHON_LAB_PACKAGE_RELATIVE_PATHS } from './package_source.ts';
import type { PythonLabRepository } from './repository.ts';

export async function purgeExpiredPythonLabs(input: {
  readonly repository: PackageReviewRepository;
  readonly pythonLabRepository: PythonLabRepository;
  readonly pythonLabArtifactStore: PythonLabArtifactStore;
  readonly now?: () => Date;
}): Promise<{ readonly deletedLabs: number; readonly deletedAccessRequests: number }> {
  const now = (input.now ?? (() => new Date()))().toISOString();
  const expiredLabs = await input.pythonLabRepository.listExpiredLabs(now);

  for (const lab of expiredLabs) {
    await purgeExpiredLab(input, lab);
  }

  const expiredRequests = await input.pythonLabRepository.listExpiredAccessRequests(now);

  for (const request of expiredRequests) {
    await input.pythonLabRepository.deleteAccessRequest(request.requestId);
  }

  return { deletedLabs: expiredLabs.length, deletedAccessRequests: expiredRequests.length };
}

async function purgeExpiredLab(
  input: {
    readonly repository: PackageReviewRepository;
    readonly pythonLabRepository: PythonLabRepository;
    readonly pythonLabArtifactStore: PythonLabArtifactStore;
  },
  lab: Awaited<ReturnType<PythonLabRepository['listExpiredLabs']>>[number],
): Promise<void> {
  const privateKeys = new Set<string>();

  if (lab.privateArtifactKey !== null) {
    privateKeys.add(lab.privateArtifactKey);
  }

  if (lab.packageVersionId !== null) {
    const packageVersion = await input.repository.getPackageVersionById(lab.packageVersionId);
    const sourceKeys = await input.pythonLabRepository
      .listSubmissionArtifactKeysByPackageVersionId(lab.packageVersionId);

    for (const sourceKey of sourceKeys) {
      privateKeys.add(sourceKey);
    }

    if (packageVersion !== null) {
      for (const relativePath of PYTHON_LAB_PACKAGE_RELATIVE_PATHS) {
        privateKeys.add(`${packageVersion.artifact.snapshotRoot}/${relativePath}`);
      }
    }
  }

  for (const key of privateKeys) {
    await input.pythonLabArtifactStore.delete(key);
  }

  if (lab.packageVersionId !== null) {
    await input.repository.deletePythonLabPackageVersion(lab.packageVersionId);
  }

  await input.pythonLabRepository.deleteLab(lab.labId);
}
