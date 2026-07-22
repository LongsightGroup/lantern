import type { PreviewEvidenceRecord, PreviewSessionRecord } from './types.ts';
import type { PreviewEvidenceRow, PreviewSessionRow } from './repository_row_types.ts';
import { normalizeNumeric, normalizeTimestamp } from './repository_value_support.ts';

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
