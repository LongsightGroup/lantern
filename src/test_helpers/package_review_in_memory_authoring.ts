import type { PackageReviewRepository } from '../package_review/repository.ts';
import {
  normalizeAuthoringDraftPath,
  readBrowserAutograderContract,
} from '../package_review/repository_authoring_contract.ts';
import type { AuthoringDraftRecord, PackageVersionRecord } from '../package_review/types.ts';
import { cloneRecord, type InMemoryRepositoryState } from './package_review_in_memory_shared.ts';

type AuthoringRepository = Pick<
  PackageReviewRepository,
  | 'createAuthoringDraftFromPackageVersion'
  | 'getAuthoringDraftById'
  | 'saveAuthoringDraftFiles'
  | 'markAuthoringDraftPreviewed'
>;

export function createInMemoryAuthoringRepository(
  state: InMemoryRepositoryState,
): AuthoringRepository {
  return {
    createAuthoringDraftFromPackageVersion(input) {
      const existing = state.authoringDrafts.find(
        (candidate) => candidate.packageVersionId === input.packageVersionId,
      );

      if (existing) {
        return Promise.resolve(hydrateDraft(state, existing.draftId));
      }

      if (state.authoringDrafts.some((candidate) => candidate.draftId === input.draftId)) {
        throw new Error(`Authoring draft ${input.draftId} already exists and cannot be replaced.`);
      }

      const packageVersion = getPackageVersionOrThrow(
        state.packageVersions,
        input.packageVersionId,
      );
      const contract = requireApprovedBrowserAutograderContract(packageVersion);
      const nextDraft: AuthoringDraftRecord = {
        draftId: input.draftId,
        packageVersionId: packageVersion.id,
        appId: packageVersion.appId,
        packageVersion: packageVersion.version,
        packageTitle: packageVersion.title,
        authoringKind: contract.kind,
        authoringPaths: [...contract.paths],
        baseSnapshotRoot: packageVersion.artifact.snapshotRoot,
        latestPromptText: null,
        latestGenerationNotes: [],
        savedSource: 'manual',
        lastPreviewedAt: null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        files: [],
      };

      state.authoringDrafts.push(cloneRecord(nextDraft));

      return Promise.resolve(hydrateDraft(state, nextDraft.draftId));
    },

    getAuthoringDraftById(draftId) {
      const draft = state.authoringDrafts.find((candidate) => candidate.draftId === draftId);

      return Promise.resolve(draft ? hydrateDraft(state, draftId) : null);
    },

    saveAuthoringDraftFiles(input) {
      const draftIndex = state.authoringDrafts.findIndex(
        (candidate) => candidate.draftId === input.draftId,
      );

      if (draftIndex < 0) {
        throw new Error(`Authoring draft ${input.draftId} was not found.`);
      }

      const draft = state.authoringDrafts[draftIndex];

      if (!draft) {
        throw new Error(`Authoring draft ${input.draftId} was not found.`);
      }

      const allowedPaths = new Set(draft.authoringPaths);
      const normalizedFiles = input.files.map((file, index) => ({
        draftId: input.draftId,
        relativePath: normalizeAuthoringDraftPath(file.relativePath),
        contents: file.contents,
        sequence: index + 1,
      }));

      for (const file of normalizedFiles) {
        if (!allowedPaths.has(file.relativePath)) {
          throw new Error(
            `Authoring draft file ${file.relativePath} is outside the approved authoring file set.`,
          );
        }
      }

      for (const file of normalizedFiles) {
        const existingFileIndex = state.authoringDraftFiles.findIndex(
          (candidate) =>
            candidate.draftId === file.draftId && candidate.relativePath === file.relativePath,
        );

        if (existingFileIndex >= 0) {
          state.authoringDraftFiles.splice(existingFileIndex, 1, cloneRecord(file));
          continue;
        }

        state.authoringDraftFiles.push(cloneRecord(file));
      }

      const nextDraft: AuthoringDraftRecord = {
        ...draft,
        latestPromptText: input.latestPromptText,
        latestGenerationNotes: [...input.latestGenerationNotes],
        savedSource: input.savedSource,
        updatedAt: input.updatedAt,
      };

      state.authoringDrafts.splice(draftIndex, 1, cloneRecord(nextDraft));

      return Promise.resolve(hydrateDraft(state, input.draftId));
    },

    markAuthoringDraftPreviewed(input) {
      const draftIndex = state.authoringDrafts.findIndex(
        (candidate) => candidate.draftId === input.draftId,
      );

      if (draftIndex < 0) {
        throw new Error(`Authoring draft ${input.draftId} was not found.`);
      }

      const draft = state.authoringDrafts[draftIndex];

      if (!draft) {
        throw new Error(`Authoring draft ${input.draftId} was not found.`);
      }

      const nextDraft: AuthoringDraftRecord = {
        ...draft,
        lastPreviewedAt: input.previewedAt,
        updatedAt: input.previewedAt,
      };

      state.authoringDrafts.splice(draftIndex, 1, cloneRecord(nextDraft));

      return Promise.resolve(hydrateDraft(state, input.draftId));
    },
  };
}

function hydrateDraft(state: InMemoryRepositoryState, draftId: string): AuthoringDraftRecord {
  const draft = state.authoringDrafts.find((candidate) => candidate.draftId === draftId);

  if (!draft) {
    throw new Error(`Authoring draft ${draftId} was not found.`);
  }

  const files = state.authoringDraftFiles
    .filter((candidate) => candidate.draftId === draftId)
    .sort(
      (left, right) =>
        left.sequence - right.sequence || left.relativePath.localeCompare(right.relativePath),
    )
    .map(cloneRecord);

  return cloneRecord({
    ...draft,
    authoringPaths: [...draft.authoringPaths],
    latestGenerationNotes: [...draft.latestGenerationNotes],
    files,
  });
}

function getPackageVersionOrThrow(
  packageVersions: PackageVersionRecord[],
  packageVersionId: number,
): PackageVersionRecord {
  const packageVersion = packageVersions.find((candidate) => candidate.id === packageVersionId);

  if (!packageVersion) {
    throw new Error(`Package version id ${packageVersionId} was not found.`);
  }

  return packageVersion;
}

function requireApprovedBrowserAutograderContract(
  packageVersion: PackageVersionRecord,
): ReturnType<typeof readBrowserAutograderContract> {
  if (packageVersion.approvalStatus !== 'approved') {
    throw new Error(
      `Authoring draft requires an approved package version. Found ${packageVersion.appId}@${packageVersion.version} in ${packageVersion.approvalStatus} state.`,
    );
  }

  return readBrowserAutograderContract(packageVersion.manifestJson);
}
