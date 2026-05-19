import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { InMemoryRepositoryState } from './package_review_in_memory_shared.ts';
import { cloneRecord, nextId } from './package_review_in_memory_shared.ts';
import { buildPreviewEvidenceRecord } from './package_review_test_builder_preview.ts';

type PreviewRepository = Pick<
  PackageReviewRepository,
  | 'createPreviewSession'
  | 'getPreviewSessionById'
  | 'getLatestPreviewSessionByPackageVersion'
  | 'appendPreviewEvidence'
  | 'listPreviewEvidence'
>;

export function createInMemoryPreviewRepository(state: InMemoryRepositoryState): PreviewRepository {
  return {
    createPreviewSession(record) {
      const packageVersion = state.packageVersions.find(
        (candidate) => candidate.id === record.packageVersionId,
      );

      if (!packageVersion) {
        throw new Error(`Package version id ${record.packageVersionId} was not found.`);
      }

      const existing = state.previewSessions.find(
        (candidate) => candidate.sessionId === record.sessionId,
      );

      if (existing) {
        throw new Error(
          `Preview session ${record.sessionId} already exists and cannot be replaced.`,
        );
      }

      const nextRecord = cloneRecord(record);
      state.previewSessions.push(nextRecord);
      return Promise.resolve(cloneRecord(nextRecord));
    },

    getPreviewSessionById(sessionId) {
      const record = state.previewSessions.find((candidate) => candidate.sessionId === sessionId);
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    getLatestPreviewSessionByPackageVersion(packageVersionId, origin) {
      const latest = state.previewSessions
        .filter(
          (candidate) =>
            candidate.packageVersionId === packageVersionId &&
            (origin === undefined || candidate.origin === origin),
        )
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];

      return Promise.resolve(latest ? cloneRecord(latest) : null);
    },

    appendPreviewEvidence(input) {
      const session = state.previewSessions.find(
        (candidate) => candidate.sessionId === input.previewSessionId,
      );

      if (!session) {
        throw new Error(`Preview session ${input.previewSessionId} was not found.`);
      }

      const sequence = state.previewEvidence
        .filter((candidate) => candidate.previewSessionId === input.previewSessionId)
        .reduce((max, candidate) => Math.max(max, candidate.sequence), 0) + 1;
      const nextRecord = buildPreviewEvidenceRecord({
        id: nextId(state.previewEvidence),
        previewSessionId: input.previewSessionId,
        sequence,
        eventType: input.eventType,
        capability: input.capability,
        summary: input.summary,
        detail: input.detail,
        occurredAt: input.occurredAt,
      });

      state.previewEvidence.push(cloneRecord(nextRecord));
      return Promise.resolve(cloneRecord(nextRecord));
    },

    listPreviewEvidence(previewSessionId) {
      return Promise.resolve(
        state.previewEvidence
          .filter((candidate) => candidate.previewSessionId === previewSessionId)
          .sort((left, right) => left.sequence - right.sequence)
          .map(cloneRecord),
      );
    },
  };
}
