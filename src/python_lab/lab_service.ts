import type { ImportedPackageVersion } from '../package_review/intake.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { PackageSource } from '../package_review/package_source.ts';
import { combinePythonAssignmentDraft, parsePythonAssignmentPublicDraft } from './contract.ts';
import type { PythonLabArtifactStore } from './artifact_store.ts';
import {
  createPythonLabPackageSource,
  PYTHON_LAB_PACKAGE_RELATIVE_PATHS,
} from './package_source.ts';
import type { PythonLabRecord, PythonLabRepository } from './repository.ts';
import type { PythonGraderSandboxFactory } from './runner.ts';
import {
  evaluatePythonSubmission,
  generateAndValidatePythonAssignment,
  type PythonTestVectorGenerator,
} from './service.ts';

export async function generatePythonLab(input: {
  readonly lab: PythonLabRecord;
  readonly repository: PackageReviewRepository;
  readonly pythonLabRepository: PythonLabRepository;
  readonly pythonLabArtifactStore: PythonLabArtifactStore;
  readonly sandboxFactory: PythonGraderSandboxFactory;
  readonly testVectorGenerator: PythonTestVectorGenerator;
  readonly importPackageFromSource: (
    source: PackageSource,
    options: { storageRoot: string },
  ) => Promise<
    ImportedPackageVersion
  >;
  readonly createId: () => string;
  readonly now?: () => Date;
}): Promise<PythonLabRecord> {
  const now = input.now ?? (() => new Date());
  let packageVersionId: number | undefined;
  let packageSnapshotRoot: string | null = null;

  try {
    if (input.lab.state !== 'generating' || input.lab.privateArtifactKey === null) {
      return input.lab;
    }

    const pendingDraft = await input.pythonLabArtifactStore.readPendingDraft(
      input.lab.privateArtifactKey,
    );
    const draft = combinePythonAssignmentDraft({
      publicDraft: parsePythonAssignmentPublicDraft({
        ...input.lab.authorDraft,
        functionName: input.lab.authorDraft.functionName,
      }),
      referenceCode: pendingDraft.referenceCode,
    });
    const assignment = await generateAndValidatePythonAssignment({
      draft,
      generator: input.testVectorGenerator,
      sandboxFactory: input.sandboxFactory,
      createOneTimeId: input.createId,
    });
    await input.pythonLabArtifactStore.writePrivateAssignment(input.lab.privateArtifactKey, {
      kind: 'assignment',
      functionName: draft.contract.functionName,
      referenceCode: draft.referenceCode,
      cases: assignment.privateCases,
    });
    const imported = await input.importPackageFromSource(
      createPythonLabPackageSource({
        labId: input.lab.labId,
        content: assignment.publicContent,
      }),
      { storageRoot: 'var/python-lab-packages' },
    );
    const packageVersion = await input.repository.registerPythonLabTrialPackageVersion(imported);
    packageVersionId = packageVersion.id;
    packageSnapshotRoot = packageVersion.artifact.snapshotRoot;
    await input.pythonLabRepository.createCodeAssignmentDefinition({
      packageVersionId: packageVersion.id,
      functionName: draft.contract.functionName,
      privateArtifactKey: input.lab.privateArtifactKey,
      createdAt: now().toISOString(),
    });

    return await input.pythonLabRepository.markLabReady({
      labId: input.lab.labId,
      packageVersionId: packageVersion.id,
      privateArtifactKey: input.lab.privateArtifactKey,
      updatedAt: now().toISOString(),
    });
  } catch {
    const failureMessage = `Python Lab generation failed. Reference: ${input.lab.labId}.`;
    const failedLab = await input.pythonLabRepository.markLabFailed({
      labId: input.lab.labId,
      failureMessage,
      ...(packageVersionId === undefined ? {} : { packageVersionId }),
      updatedAt: now().toISOString(),
    });
    const cleanupErrors = await cleanFailedPythonLabMaterialization({
      repository: input.repository,
      pythonLabArtifactStore: input.pythonLabArtifactStore,
      privateArtifactKey: failedLab.privateArtifactKey,
      packageVersionId,
      packageSnapshotRoot,
    });

    if (cleanupErrors.length === 0) {
      return failedLab;
    }

    return await input.pythonLabRepository.markLabFailed({
      labId: input.lab.labId,
      failureMessage,
      updatedAt: now().toISOString(),
    });
  }
}

export async function verifyPythonLabCandidate(input: {
  readonly lab: PythonLabRecord;
  readonly source: string;
  readonly pythonLabArtifactStore: PythonLabArtifactStore;
  readonly sandboxFactory: PythonGraderSandboxFactory;
  readonly createId: () => string;
}) {
  if (input.lab.state !== 'ready' || input.lab.privateArtifactKey === null) {
    throw new Error('Python Lab is not ready for candidate verification.');
  }

  const artifact = await input.pythonLabArtifactStore.readPrivateAssignment(
    input.lab.privateArtifactKey,
  );

  const evaluation = await evaluatePythonSubmission({
    source: input.source,
    contract: { functionName: artifact.functionName, maxScore: 10 },
    cases: artifact.cases,
    phase: 'candidate',
    sandboxFactory: input.sandboxFactory,
    createOneTimeId: input.createId,
  });

  if (evaluation.runnerFailed) {
    throw new Error('Python execution infrastructure did not finish candidate verification.');
  }

  return evaluation;
}

async function cleanFailedPythonLabMaterialization(input: {
  readonly repository: PackageReviewRepository;
  readonly pythonLabArtifactStore: PythonLabArtifactStore;
  readonly privateArtifactKey: string | null;
  readonly packageVersionId: number | undefined;
  readonly packageSnapshotRoot: string | null;
}): Promise<unknown[]> {
  const cleanup = [] as Promise<void>[];

  if (input.privateArtifactKey !== null) {
    cleanup.push(input.pythonLabArtifactStore.delete(input.privateArtifactKey));
  }

  if (input.packageSnapshotRoot !== null) {
    for (const relativePath of PYTHON_LAB_PACKAGE_RELATIVE_PATHS) {
      cleanup.push(
        input.pythonLabArtifactStore.delete(`${input.packageSnapshotRoot}/${relativePath}`),
      );
    }
  }

  if (input.packageVersionId !== undefined) {
    cleanup.push(input.repository.deletePythonLabPackageVersion(input.packageVersionId));
  }

  return (await Promise.allSettled(cleanup)).flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  );
}
