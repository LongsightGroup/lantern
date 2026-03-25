import type { PackageReviewRepository } from '../package_review/repository.ts';
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
  | 'listPackageVersions'
  | 'listPackageVersionsByApp'
  | 'getPackageVersionById'
  | 'getPackageVersionByAppVersion'
  | 'approvePackageVersion'
  | 'rejectPackageVersion'
>;

export function createInMemoryVersionRepository(state: InMemoryRepositoryState): VersionRepository {
  return {
    registerPackageVersion(input) {
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
        entrypoint: input.reviewData.entrypoint,
        roles: input.reviewData.roles,
        installScope: input.reviewData.installScope,
        capabilities: input.reviewData.capabilities,
        grading: input.reviewData.grading,
        validationIssues: input.reviewData.validationIssues,
        manifestJson: input.reviewData.manifestJson,
        artifact: input.artifact,
      });

      state.packageVersions.push(nextRecord);

      return Promise.resolve(cloneRecord(nextRecord));
    },

    listPackageVersions() {
      return Promise.resolve(sortPackageVersions(state.packageVersions).map(cloneRecord));
    },

    listPackageVersionsByApp(appId) {
      return Promise.resolve(
        sortPackageVersions(state.packageVersions.filter((record) => record.appId === appId)).map(
          cloneRecord,
        ),
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

    approvePackageVersion(input) {
      return Promise.resolve(
        cloneRecord(
          reviewPackageVersion(state.packageVersions, input.id, 'approved', input.reviewNotes),
        ),
      );
    },

    rejectPackageVersion(input) {
      return Promise.resolve(
        cloneRecord(
          reviewPackageVersion(state.packageVersions, input.id, 'rejected', input.reviewNotes),
        ),
      );
    },
  };
}
