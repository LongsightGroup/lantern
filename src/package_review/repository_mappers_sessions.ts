import { resolveSubmissionMode } from '../../sdk/app-sdk.ts';
import type { RuntimeSessionRecord } from '../lti/types.ts';
import type { RuntimeSessionRow } from './repository_row_types.ts';
import { normalizeTimestamp } from './repository_value_support.ts';

export function mapOptionalRuntimeSession(
  row: RuntimeSessionRow | undefined,
): RuntimeSessionRecord | null {
  if (!row) {
    return null;
  }

  return mapRuntimeSessionRow(row);
}

export function mapRuntimeSessionRow(row: RuntimeSessionRow | undefined): RuntimeSessionRecord {
  if (!row) {
    throw new Error('Expected a runtime session row.');
  }

  return {
    sessionId: row.sessionId,
    sessionToken: row.sessionToken,
    ltiToolSessionId: row.ltiToolSessionId,
    attemptId: row.attemptId ?? row.sessionId,
    appId: row.appId,
    packageVersionId: row.packageVersionId,
    packageVersion: row.packageVersion,
    capabilities: row.capabilities,
    snapshotRoot: row.snapshotRoot,
    entrypointPath: row.entrypointPath,
    contentPath: row.contentPath,
    services: mapLaunchServices(row),
    launch: {
      userRole: row.launchUserRole,
      courseId: row.launchCourseId,
      ...(row.launchAssignmentId === null ? {} : { assignmentId: row.launchAssignmentId }),
      activityId: row.launchActivityId,
      submissionMode: resolveSubmissionMode(row.capabilities),
    },
    preview: {
      previewSessionId: row.previewSessionId,
    },
    createdAt: normalizeTimestamp(row.createdAt),
    expiresAt: normalizeTimestamp(row.expiresAt),
  };
}

function mapLaunchServices(row: RuntimeSessionRow): RuntimeSessionRecord['services'] {
  const hasAgs =
    row.agsScope.length > 0 || row.agsLineitemsUrl !== null || row.agsLineitemUrl !== null;
  const hasNrps = row.nrpsContextMembershipsUrl !== null;

  return {
    ags: hasAgs
      ? {
          scope: row.agsScope,
          lineitemsUrl: row.agsLineitemsUrl,
          lineitemUrl: row.agsLineitemUrl,
        }
      : null,
    nrps: hasNrps
      ? {
          contextMembershipsUrl: row.nrpsContextMembershipsUrl!,
          serviceVersions: row.nrpsServiceVersions,
        }
      : null,
  };
}
