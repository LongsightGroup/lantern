import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { InMemoryRepositoryState } from './package_review_in_memory_shared.ts';
import { cloneRecord } from './package_review_in_memory_shared.ts';

type PlacementRepository = Pick<
  PackageReviewRepository,
  | 'createReviewedPlacement'
  | 'getReviewedPlacementById'
  | 'getPlacementAuditSnapshotById'
  | 'requirePlacementAuditSnapshotById'
  | 'bindReviewedPlacementResourceLink'
>;

export function createInMemoryPlacementRepository(
  state: InMemoryRepositoryState,
): PlacementRepository {
  return {
    createReviewedPlacement(record) {
      const existing = state.reviewedPlacements.find(
        (candidate) => candidate.placementId === record.placementId,
      );

      if (existing) {
        throw new Error(
          `Reviewed placement ${record.placementId} already exists and cannot be replaced.`,
        );
      }

      state.reviewedPlacements.push(cloneRecord(record));
      return Promise.resolve(cloneRecord(record));
    },

    getReviewedPlacementById(placementId) {
      const record = state.reviewedPlacements.find(
        (candidate) => candidate.placementId === placementId,
      );
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    getPlacementAuditSnapshotById(placementId) {
      const placement = state.reviewedPlacements.find(
        (candidate) => candidate.placementId === placementId,
      );

      if (!placement) {
        return Promise.resolve(null);
      }

      const latestPreviewSession =
        state.previewSessions
          .filter((candidate) => candidate.packageVersionId === placement.packageVersionId)
          .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ??
        null;
      const previewRows =
        latestPreviewSession === null
          ? []
          : state.previewEvidence
              .filter((candidate) => candidate.previewSessionId === latestPreviewSession.sessionId)
              .sort((left, right) => left.sequence - right.sequence);
      const deepLinkingRequestCount = state.auditEvents.filter(
        (candidate) =>
          candidate.deploymentRecordId === placement.deploymentRecordId &&
          candidate.packageVersionId === placement.packageVersionId &&
          candidate.eventType.startsWith('deep_linking.request.'),
      ).length;
      const placementEventCount = state.auditEvents.filter(
        (candidate) =>
          candidate.deploymentRecordId === placement.deploymentRecordId &&
          candidate.packageVersionId === placement.packageVersionId &&
          candidate.eventType.startsWith('deep_linking.placement.') &&
          candidate.detail.placementId === placement.placementId,
      ).length;
      const reviewerEventCount = state.auditEvents.filter(
        (candidate) =>
          candidate.deploymentRecordId === placement.deploymentRecordId &&
          candidate.packageVersionId === placement.packageVersionId &&
          candidate.eventType.startsWith('reviewer.') &&
          candidate.detail.placementId === placement.placementId,
      ).length;
      const latestOccurredAt =
        state.auditEvents
          .filter(
            (candidate) =>
              candidate.deploymentRecordId === placement.deploymentRecordId &&
              candidate.packageVersionId === placement.packageVersionId &&
              (candidate.eventType.startsWith('deep_linking.request.') ||
                candidate.eventType.startsWith('deep_linking.placement.') ||
                candidate.eventType.startsWith('reviewer.')),
          )
          .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0]
          ?.occurredAt ?? null;
      const previewEvidenceCount = previewRows.length;
      const status =
        reviewerEventCount > 0
          ? 'reviewed'
          : placement.resourceLinkId === null
            ? 'awaiting_canvas_binding'
            : previewEvidenceCount > 0
              ? 'bound_with_preview'
              : 'bound_no_preview';

      return Promise.resolve({
        placement: cloneRecord(placement),
        status,
        latestPreviewSessionId: latestPreviewSession?.sessionId ?? null,
        latestPreviewOccurredAt: previewRows[previewRows.length - 1]?.occurredAt ?? null,
        previewEvidenceCount,
        evidenceSummary: {
          deepLinkingRequestCount,
          placementEventCount,
          reviewerEventCount,
          latestOccurredAt,
        },
      });
    },

    requirePlacementAuditSnapshotById(placementId) {
      return this.getPlacementAuditSnapshotById(placementId).then((snapshot) => {
        if (snapshot === null) {
          throw new Error(`Reviewed placement ${placementId} was not found.`);
        }

        return snapshot;
      });
    },

    bindReviewedPlacementResourceLink(input) {
      const index = state.reviewedPlacements.findIndex(
        (candidate) => candidate.placementId === input.placementId,
      );

      if (index < 0) {
        throw new Error(`Reviewed placement ${input.placementId} was not found.`);
      }

      const existing = state.reviewedPlacements[index];

      if (!existing) {
        throw new Error(`Reviewed placement ${input.placementId} was not found.`);
      }

      if (existing.resourceLinkId !== null && existing.resourceLinkId !== input.resourceLinkId) {
        throw new Error(
          `Reviewed placement ${input.placementId} is already bound to Canvas resource link ${existing.resourceLinkId}.`,
        );
      }

      const conflictingPlacement = state.reviewedPlacements.find(
        (candidate) =>
          candidate.placementId !== input.placementId &&
          candidate.deploymentRecordId === existing.deploymentRecordId &&
          candidate.resourceLinkId === input.resourceLinkId,
      );

      if (conflictingPlacement) {
        throw new Error(
          `Canvas resource link ${input.resourceLinkId} is already bound to another reviewed placement in deployment ${existing.deploymentSlug}.`,
        );
      }

      if (existing.resourceLinkId === input.resourceLinkId) {
        return Promise.resolve(cloneRecord(existing));
      }

      const nextRecord = cloneRecord({
        ...existing,
        resourceLinkId: input.resourceLinkId,
        boundAt: input.boundAt,
      });
      state.reviewedPlacements.splice(index, 1, nextRecord);
      return Promise.resolve(cloneRecord(nextRecord));
    },
  };
}
