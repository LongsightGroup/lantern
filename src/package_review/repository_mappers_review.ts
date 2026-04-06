import type { PlacementAuditStatus } from './types.ts';
import type {
  PlacementAuditSnapshot,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
} from './types.ts';
import type {
  PlacementAuditSnapshotRow,
  PreviewEvidenceRow,
  PreviewSessionRow,
} from './repository_row_types.ts';
import { mapReviewedPlacementRow } from './repository_mappers_sessions.ts';
import {
  normalizeNumeric,
  normalizeOptionalTimestamp,
  normalizeTimestamp,
} from './repository_value_support.ts';

export function mapOptionalPlacementAuditSnapshot(
  row: PlacementAuditSnapshotRow | undefined,
): PlacementAuditSnapshot | null {
  if (!row) {
    return null;
  }

  return mapPlacementAuditSnapshotRow(row);
}

export function mapPlacementAuditSnapshotRow(
  row: PlacementAuditSnapshotRow | undefined,
): PlacementAuditSnapshot {
  if (!row) {
    throw new Error('Expected a placement audit snapshot row.');
  }

  const previewEvidenceCount = normalizeNumeric(row.previewEvidenceCount);
  const reviewerEventCount = normalizeNumeric(row.reviewerEventCount);

  return {
    placement: mapReviewedPlacementRow(row),
    status: derivePlacementAuditStatus({
      resourceLinkId: row.resourceLinkId,
      previewEvidenceCount,
      reviewerEventCount,
    }),
    latestPreviewSessionId: row.latestPreviewSessionId,
    latestPreviewOccurredAt: normalizeOptionalTimestamp(row.latestPreviewOccurredAt),
    previewEvidenceCount,
    evidenceSummary: {
      deepLinkingRequestCount: normalizeNumeric(row.deepLinkingRequestCount),
      placementEventCount: normalizeNumeric(row.placementEventCount),
      reviewerEventCount,
      latestOccurredAt: normalizeOptionalTimestamp(row.latestAuditOccurredAt),
    },
  };
}

export function derivePlacementAuditStatus(input: {
  resourceLinkId: string | null;
  previewEvidenceCount: number;
  reviewerEventCount: number;
}): PlacementAuditStatus {
  if (input.reviewerEventCount > 0) {
    return 'reviewed';
  }

  if (input.resourceLinkId === null) {
    return 'awaiting_canvas_binding';
  }

  if (input.previewEvidenceCount > 0) {
    return 'bound_with_preview';
  }

  return 'bound_no_preview';
}

export function mapOptionalPreviewSession(
  row: PreviewSessionRow | undefined,
): PreviewSessionRecord | null {
  if (!row) {
    return null;
  }

  return mapPreviewSessionRow(row);
}

export function mapPreviewSessionRow(row: PreviewSessionRow | undefined): PreviewSessionRecord {
  if (!row) {
    throw new Error('Expected a preview session row.');
  }

  return {
    sessionId: row.sessionId,
    packageVersionId: row.packageVersionId,
    appId: row.appId,
    packageVersion: row.packageVersion,
    packageTitle: row.packageTitle,
    origin: row.origin,
    contentPath: row.contentPath,
    deepLinkingSessionId: row.deepLinkingSessionId,
    capabilities: row.capabilities,
    snapshotRoot: row.snapshotRoot,
    entrypointPath: row.entrypointPath,
    launch: {
      userId: row.launchUserId,
      userRole: row.launchUserRole,
      courseId: row.launchCourseId,
      assignmentId: row.launchAssignmentId,
      activityId: row.launchActivityId,
    },
    fakeAttemptId: row.fakeAttemptId,
    fakeScoreMaximum: normalizeNumeric(row.fakeScoreMaximum),
    fixtureData: row.fixtureData,
    createdAt: normalizeTimestamp(row.createdAt),
  };
}

export function mapPreviewEvidenceRow(row: PreviewEvidenceRow | undefined): PreviewEvidenceRecord {
  if (!row) {
    throw new Error('Expected a preview evidence row.');
  }

  return {
    id: row.id,
    previewSessionId: row.previewSessionId,
    sequence: row.sequence,
    eventType: row.eventType,
    capability: row.capability,
    summary: row.summary,
    detail: row.detail,
    occurredAt: normalizeTimestamp(row.occurredAt),
  };
}
