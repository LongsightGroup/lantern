import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { ImportedPackageVersion } from '../package_review/intake.ts';
import type { InMemoryRepositoryState } from './package_review_in_memory_shared.ts';
import {
  cloneRecord,
  nextId,
  reviewPackageVersion,
  sortPackageVersions,
} from './package_review_in_memory_shared.ts';
import { buildPackageVersionRecord } from './package_review_test_builder_base.ts';

type VersionRepository = Pick<
  PackageReviewRepository,
  | 'registerPackageVersion'
  | 'registerPythonLabTrialPackageVersion'
  | 'listPackageVersions'
  | 'listPackageVersionsByApp'
  | 'deletePythonLabPackageVersion'
  | 'getPackageVersionById'
  | 'getPackageVersionByAppVersion'
  | 'approvePackageVersion'
  | 'rejectPackageVersion'
>;

export function createInMemoryVersionRepository(state: InMemoryRepositoryState): VersionRepository {
  return {
    registerPackageVersion(input) {
      return registerInMemoryPackageVersion(state, input, 'catalog');
    },

    registerPythonLabTrialPackageVersion(input) {
      return registerInMemoryPackageVersion(state, input, 'python_lab_trial');
    },

    listPackageVersions() {
      return Promise.resolve(
        sortPackageVersions(
          state.packageVersions.filter((record) => record.catalogVisibility === 'catalog'),
        ).map(cloneRecord),
      );
    },

    listPackageVersionsByApp(appId) {
      return Promise.resolve(
        sortPackageVersions(
          state.packageVersions.filter(
            (record) => record.appId === appId && record.catalogVisibility === 'catalog',
          ),
        ).map(cloneRecord),
      );
    },

    getPackageVersionById(id) {
      const record = state.packageVersions.find((candidate) => candidate.id === id);
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    getPackageVersionByAppVersion(appId, version) {
      const record = state.packageVersions.find(
        (candidate) => candidate.appId === appId && candidate.version === version,
      );
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    deletePythonLabPackageVersion(id) {
      const packageVersion = state.packageVersions.find((record) => record.id === id);

      if (packageVersion === undefined) {
        return Promise.resolve();
      }

      if (packageVersion.catalogVisibility !== 'python_lab_trial') {
        return Promise.reject(
          new Error(`Package version ${id} is not a Python Lab trial package.`),
        );
      }

      const attemptIds = new Set(
        state.attempts
          .filter((attempt) => attempt.packageVersionId === id)
          .map((attempt) => attempt.attemptId),
      );
      const previewSessionIds = new Set(
        state.previewSessions
          .filter((session) => session.packageVersionId === id)
          .map((session) => session.sessionId),
      );

      removeWhere(state.runtimeSessions, (session) => session.packageVersionId === id);
      removeWhere(state.attempts, (attempt) => attemptIds.has(attempt.attemptId));
      removeWhere(state.attemptEvents, (event) => attemptIds.has(event.attemptId));
      removeWhere(state.attemptEvidenceArtifacts, (artifact) => attemptIds.has(artifact.attemptId));
      removeWhere(state.previewEvidence, (evidence) =>
        previewSessionIds.has(evidence.previewSessionId),
      );
      removeWhere(state.previewSessions, (session) => previewSessionIds.has(session.sessionId));
      removeWhere(state.packageVersions, (record) => record.id === id);

      return Promise.resolve();
    },

    approvePackageVersion(input) {
      return Promise.resolve(
        cloneRecord(
          reviewPackageVersion(
            state.packageVersions,
            input.id,
            'approved',
            input.reviewNotes,
            input.accessibilityReview,
          ),
        ),
      );
    },

    rejectPackageVersion(input) {
      return Promise.resolve(
        cloneRecord(
          reviewPackageVersion(
            state.packageVersions,
            input.id,
            'rejected',
            input.reviewNotes,
            input.accessibilityReview,
          ),
        ),
      );
    },
  };
}

function registerInMemoryPackageVersion(
  state: InMemoryRepositoryState,
  input: ImportedPackageVersion,
  catalogVisibility: 'catalog' | 'python_lab_trial',
) {
  const existing = state.packageVersions.find(
    (record) =>
      record.appId === input.reviewData.appId && record.version === input.reviewData.version,
  );

  if (existing) {
    throw new Error(
      `Package version ${input.reviewData.appId}@${input.reviewData.version} already exists and cannot be replaced.`,
    );
  }

  const nextRecord = buildPackageVersionRecord({
    id: nextId(state.packageVersions),
    appId: input.reviewData.appId,
    version: input.reviewData.version,
    title: input.reviewData.title,
    description: input.reviewData.description,
    owner: input.reviewData.owner,
    roles: input.reviewData.roles,
    installScope: input.reviewData.installScope,
    capabilities: input.reviewData.capabilities,
    grading: input.reviewData.grading,
    catalogVisibility,
    validationIssues: input.reviewData.validationIssues,
    manifestJson: input.reviewData.manifestJson,
    artifact: input.artifact,
    runtimeContract: input.runtimeContract,
    runtimeContractSignature: input.runtimeContractSignature,
  });

  state.packageVersions.push(nextRecord);

  return Promise.resolve(cloneRecord(nextRecord));
}

function removeWhere<T>(items: T[], predicate: (item: T) => boolean): void {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) {
      items.splice(index, 1);
    }
  }
}
