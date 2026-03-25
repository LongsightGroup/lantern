import type { LaunchServiceClaims } from '../lti/types.ts';
import type { RetryableGradePublicationLookup, RetryRuntimeSessionLookup } from './types.ts';
import type { RetryLookupRow } from './repository_types.ts';
import {
  mapDeploymentBinding,
  normalizeNumeric,
  normalizeOptionalTimestamp,
  normalizeTimestamp,
} from './repository_mapping.ts';

export function mapRetryLookupRow(row: RetryLookupRow): RetryableGradePublicationLookup {
  return {
    attemptId: row.attemptId,
    deploymentRecordId: row.deploymentRecordId,
    deploymentSlug: row.deploymentSlug,
    publication: {
      attemptId: row.attemptId,
      status: row.publicationStatus,
      lineItemUrl: row.lineItemUrl,
      canvasUserId: row.canvasUserId,
      scoreGiven: normalizeNumeric(row.scoreGiven),
      scoreMaximum: normalizeNumeric(row.scoreMaximum),
      activityProgress: row.activityProgress,
      gradingProgress: row.gradingProgress,
      publishedAt: normalizeOptionalTimestamp(row.publishedAt),
      updatedAt: normalizeTimestamp(row.updatedAt),
      errorCode: row.errorCode,
      errorDetail: row.errorDetail,
    },
    binding: mapDeploymentBinding({
      canvasEnvironment: row.bindingCanvasEnvironment,
      issuer: row.bindingIssuer,
      clientId: row.bindingClientId,
      deploymentId: row.bindingDeploymentId,
    }),
    runtimeSession: mapRetryRuntimeSession(row),
  };
}

function mapRetryRuntimeSession(row: RetryLookupRow): RetryRuntimeSessionLookup | null {
  if (
    row.sessionId === null ||
    row.runtimeDeploymentRecordId === null ||
    row.runtimeDeploymentSlug === null ||
    row.runtimeAppId === null ||
    row.runtimePackageVersionId === null ||
    row.runtimePackageVersion === null ||
    row.runtimeCreatedAt === null ||
    row.runtimeExpiresAt === null
  ) {
    return null;
  }

  return {
    sessionId: row.sessionId,
    attemptId: row.runtimeAttemptId ?? row.attemptId,
    deploymentRecordId: row.runtimeDeploymentRecordId,
    deploymentSlug: row.runtimeDeploymentSlug,
    appId: row.runtimeAppId,
    packageVersionId: row.runtimePackageVersionId,
    packageVersion: row.runtimePackageVersion,
    services: mapLaunchServices({
      agsScope: row.runtimeAgsScope ?? [],
      agsLineitemsUrl: row.runtimeAgsLineitemsUrl,
      agsLineitemUrl: row.runtimeAgsLineitemUrl,
      nrpsContextMembershipsUrl: row.runtimeNrpsContextMembershipsUrl,
      nrpsServiceVersions: row.runtimeNrpsServiceVersions ?? [],
    }),
    createdAt: normalizeTimestamp(row.runtimeCreatedAt),
    expiresAt: normalizeTimestamp(row.runtimeExpiresAt),
  };
}

function mapLaunchServices(input: {
  agsScope: string[];
  agsLineitemsUrl: string | null;
  agsLineitemUrl: string | null;
  nrpsContextMembershipsUrl: string | null;
  nrpsServiceVersions: string[];
}): LaunchServiceClaims {
  const hasAgs =
    input.agsScope.length > 0 || input.agsLineitemsUrl !== null || input.agsLineitemUrl !== null;
  const hasNrps = input.nrpsContextMembershipsUrl !== null;

  return {
    ags: hasAgs
      ? {
          scope: input.agsScope,
          lineitemsUrl: input.agsLineitemsUrl,
          lineitemUrl: input.agsLineitemUrl,
        }
      : null,
    nrps: hasNrps
      ? {
          contextMembershipsUrl: input.nrpsContextMembershipsUrl!,
          serviceVersions: input.nrpsServiceVersions,
        }
      : null,
  };
}
