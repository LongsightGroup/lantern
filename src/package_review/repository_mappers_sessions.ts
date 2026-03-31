import type {
  DeepLinkingSessionRecord,
  DeepLinkingSessionSelection,
  RuntimeSessionRecord,
} from "../lti/types.ts";
import type { ReviewedPlacementRecord } from "./types.ts";
import type {
  DeepLinkingSessionRow,
  ReviewedPlacementRow,
  RuntimeSessionRow,
} from "./repository_row_types.ts";
import { normalizeTimestamp } from "./repository_value_support.ts";

export function mapOptionalRuntimeSession(
  row: RuntimeSessionRow | undefined,
): RuntimeSessionRecord | null {
  if (!row) {
    return null;
  }

  return mapRuntimeSessionRow(row);
}

export function mapRuntimeSessionRow(
  row: RuntimeSessionRow | undefined,
): RuntimeSessionRecord {
  if (!row) {
    throw new Error("Expected a runtime session row.");
  }

  return {
    sessionId: row.sessionId,
    sessionToken: row.sessionToken,
    attemptId: row.attemptId ?? row.sessionId,
    deploymentRecordId: row.deploymentRecordId,
    deploymentSlug: row.deploymentSlug,
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
      ...(row.launchAssignmentId === null
        ? {}
        : { assignmentId: row.launchAssignmentId }),
      activityId: row.launchActivityId,
    },
    createdAt: normalizeTimestamp(row.createdAt),
    expiresAt: normalizeTimestamp(row.expiresAt),
  };
}

export function mapOptionalDeepLinkingSession(
  row: DeepLinkingSessionRow | undefined,
): DeepLinkingSessionRecord | null {
  if (!row) {
    return null;
  }

  return mapDeepLinkingSessionRow(row);
}

export function mapDeepLinkingSessionRow(
  row: DeepLinkingSessionRow | undefined,
): DeepLinkingSessionRecord {
  if (!row) {
    throw new Error("Expected a deep linking session row.");
  }

  return {
    sessionId: row.sessionId,
    sessionToken: row.sessionToken,
    deploymentRecordId: row.deploymentRecordId,
    deploymentSlug: row.deploymentSlug,
    appId: row.appId,
    userId: row.userId,
    userRole: row.userRole,
    contextId: row.contextId,
    contextTitle: row.contextTitle,
    deepLinkReturnUrl: row.deepLinkReturnUrl,
    data: row.data,
    placement: row.placement,
    acceptTypes: row.acceptTypes,
    acceptMultiple: row.acceptMultiple,
    acceptPresentationDocumentTargets: row.acceptPresentationDocumentTargets,
    acceptLineItem: row.acceptLineItem,
    selection: mapDeepLinkingSessionSelection(row),
    createdAt: normalizeTimestamp(row.createdAt),
    expiresAt: normalizeTimestamp(row.expiresAt),
    usedAt: row.usedAt === null ? null : normalizeTimestamp(row.usedAt),
  };
}

export function mapOptionalReviewedPlacement(
  row: ReviewedPlacementRow | undefined,
): ReviewedPlacementRecord | null {
  if (!row) {
    return null;
  }

  return mapReviewedPlacementRow(row);
}

export function mapReviewedPlacementRow(
  row: ReviewedPlacementRow | undefined,
): ReviewedPlacementRecord {
  if (!row) {
    throw new Error("Expected a reviewed placement row.");
  }

  return {
    placementId: row.placementId,
    deploymentRecordId: row.deploymentRecordId,
    deploymentSlug: row.deploymentSlug,
    appId: row.appId,
    contextId: row.contextId,
    contextTitle: row.contextTitle,
    packageVersionId: row.packageVersionId,
    packageVersion: row.packageVersion,
    packageTitle: row.packageTitle,
    activityId: row.activityId,
    contentPath: row.contentPath,
    contentTitle: row.contentTitle,
    createdByUserId: row.createdByUserId,
    resourceLinkId: row.resourceLinkId,
    createdAt: normalizeTimestamp(row.createdAt),
    boundAt: row.boundAt === null ? null : normalizeTimestamp(row.boundAt),
  };
}

export function mapDeepLinkingSessionSelection(
  row: DeepLinkingSessionRow,
): DeepLinkingSessionSelection | null {
  if (row.selectedPackageVersionId === null) {
    return null;
  }

  if (
    row.selectedPackageVersion === null ||
    row.selectedActivityId === null ||
    row.selectedContentPath === null
  ) {
    throw new Error(
      `Deep Linking session ${row.sessionId} has an incomplete selection.`,
    );
  }

  return {
    packageVersionId: row.selectedPackageVersionId,
    packageVersion: row.selectedPackageVersion,
    activityId: row.selectedActivityId,
    contentPath: row.selectedContentPath,
  };
}

function mapLaunchServices(
  row: RuntimeSessionRow,
): RuntimeSessionRecord["services"] {
  const hasAgs = row.agsScope.length > 0 || row.agsLineitemsUrl !== null ||
    row.agsLineitemUrl !== null;
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
