import { deriveDeploymentHealth, formatDiagnosticItem } from "./service.ts";
import type {
  BrokerVerificationStatus,
  CertificationWorkflowStatus,
  ControlPlaneDeploymentInventoryRow,
  ControlPlaneDiagnosticItem,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
  DeploymentRecentLaunch,
  LatestOfficialCertificationEvidence,
} from "./types.ts";
import type {
  CertificationWorkflowStatusRow,
  DiagnosticRow,
  GradePublicationSnapshotRow,
  InternalBrokerVerificationRow,
  InventoryQueryRow,
  LatestOfficialCertificationEvidenceRow,
  OfficialBrokerVerificationRow,
  RecentLaunchRow,
} from "./repository_types.ts";
import {
  mapAuditActivityStatus,
  mapDeploymentBinding,
  mapDiagnosticKind,
  normalizeNumeric,
  normalizeOptionalTimestamp,
  normalizeTimestamp,
  readBoundaryDenialCategoryDetail,
  readLtiProfileIdDetail,
  readLtiProfileSourceDetail,
  readStringDetail,
} from "./repository_mapping_support.ts";

export {
  assertBrokerVerificationRunInput,
  mapDeploymentBinding,
  normalizeNumeric,
  normalizeOptionalTimestamp,
  normalizeTimestamp,
} from "./repository_mapping_support.ts";

export function mapInventoryRow(
  row: InventoryQueryRow,
  brokerVerification: BrokerVerificationStatus | null =
    mapInventoryBrokerVerification(row),
): ControlPlaneDeploymentInventoryRow {
  const binding = mapDeploymentBinding({
    lmsType: row.bindingLmsType,
    canvasEnvironment: row.bindingCanvasEnvironment,
    issuer: row.bindingIssuer,
    clientId: row.bindingClientId,
    deploymentId: row.bindingDeploymentId,
    authorizationEndpoint: row.bindingAuthorizationEndpoint,
    accessTokenUrl: row.bindingAccessTokenUrl,
    jwksUrl: row.bindingJwksUrl,
  });

  return {
    deploymentId: row.deploymentId,
    deploymentSlug: row.deploymentSlug,
    deploymentLabel: row.deploymentLabel,
    appId: row.appId,
    appTitle: row.appTitle,
    ownerId: row.ownerId,
    enabledPackageVersionId: row.enabledPackageVersionId,
    enabledPackageVersion: row.enabledPackageVersion,
    approvalStatus: row.approvalStatus,
    binding,
    installEvidence: mapInventoryInstallEvidence(row),
    updatedAt: normalizeTimestamp(row.updatedAt),
    lastLaunchAt: normalizeOptionalTimestamp(row.lastLaunchAt),
    lastLaunchStatus: row.lastLaunchStatus,
    lastGradePublishAt: normalizeOptionalTimestamp(row.lastGradePublishAt),
    lastGradePublishStatus: row.lastGradePublishStatus,
    lastNrpsReadAt: normalizeOptionalTimestamp(row.lastNrpsReadAt),
    lastNrpsReadStatus: row.lastNrpsReadStatus,
    pilotUsage: {
      deploymentRecordId: row.deploymentId,
      totalLaunches: normalizeNumeric(row.totalLaunches),
      attemptsStarted: normalizeNumeric(row.attemptsStarted),
      attemptsCompleted: normalizeNumeric(row.attemptsCompleted),
      gradePublishesSucceeded: normalizeNumeric(row.gradePublishesSucceeded),
      gradePublishesFailed: normalizeNumeric(row.gradePublishesFailed),
      recentActiveUsers: normalizeNumeric(row.recentActiveUsers),
      lastLaunchAt: normalizeOptionalTimestamp(row.usageLastLaunchAt),
      measuredAt: normalizeTimestamp(row.measuredAt),
    },
    health: deriveDeploymentHealth({
      approvalStatus: row.approvalStatus,
      reviewedAt: normalizeOptionalTimestamp(row.reviewedAt),
      enabledPackageVersionId: row.enabledPackageVersionId,
      binding,
      lastLaunchStatus: row.lastLaunchStatus,
      lastLaunchAt: normalizeOptionalTimestamp(row.lastLaunchAt),
      lastGradePublishStatus: row.lastGradePublishStatus,
      lastGradePublishAt: normalizeOptionalTimestamp(row.lastGradePublishAt),
      lastNrpsReadStatus: row.lastNrpsReadStatus,
      lastNrpsReadAt: normalizeOptionalTimestamp(row.lastNrpsReadAt),
      brokerVerificationStatus: brokerVerification?.internal?.status ?? null,
      brokerCheckedAt: brokerVerification?.internal?.checkedAt ??
        brokerVerification?.official.checkedAt ?? null,
    }),
    brokerVerification,
  };
}

export function mapActivitySnapshotRow(row: {
  eventType: string;
  status: string;
  summary: string;
  attemptId: string | null;
  detail: Record<string, unknown>;
  occurredAt: Date | string;
}): DeploymentActivitySnapshot {
  return {
    status: mapAuditActivityStatus(row.eventType, row.status),
    occurredAt: normalizeTimestamp(row.occurredAt),
    summary: row.summary,
    attemptId: row.attemptId,
    contextId: readStringDetail(row.detail, "contextId"),
    detail: row.detail,
  };
}

export function mapRecentLaunchRows(
  rows: RecentLaunchRow[],
): DeploymentRecentLaunch[] {
  return rows.map((row) => ({
    occurredAt: normalizeTimestamp(row.occurredAt),
    summary: row.summary,
    attemptId: row.attemptId,
    userId: row.userId ?? row.actorId,
    userDisplayName: row.userDisplayName,
    userEmail: row.userEmail,
    userLogin: row.userLogin,
    contextId: readStringDetail(row.detail, "contextId"),
    resourceLinkId: readStringDetail(row.detail, "resourceLinkId"),
    ltiProfileId: readLtiProfileIdDetail(row.detail),
    ltiProfileSource: readLtiProfileSourceDetail(row.detail),
  }));
}

export function mapGradePublicationSnapshotRow(
  row: GradePublicationSnapshotRow,
): DeploymentGradePublicationSnapshot {
  return {
    attemptId: row.attemptId,
    status: row.status,
    lineItemUrl: row.lineItemUrl,
    platformUserId: row.platformUserId,
    scoreGiven: normalizeNumeric(row.scoreGiven),
    scoreMaximum: normalizeNumeric(row.scoreMaximum),
    activityProgress: row.activityProgress,
    gradingProgress: row.gradingProgress,
    publishedAt: normalizeOptionalTimestamp(row.publishedAt),
    updatedAt: normalizeTimestamp(row.updatedAt),
    errorCode: row.errorCode,
    errorDetail: row.errorDetail,
  };
}

export function mapDiagnosticRows(
  rows: DiagnosticRow[],
  retryableAttemptId: string | null,
): ControlPlaneDiagnosticItem[] {
  return rows.map((row) =>
    formatDiagnosticItem(
      {
        id: row.id,
        kind: mapDiagnosticKind(row.eventType),
        eventType: row.eventType,
        actorType: row.actorType,
        status: row.status,
        deploymentRecordId: row.deploymentRecordId,
        attemptId: row.attemptId,
        code: readStringDetail(row.detail, "code"),
        boundaryDenialCategory: readBoundaryDenialCategoryDetail(row.detail),
        summary: row.summary,
        operatorSummary: row.summary,
        retryable: false,
        detail: row.detail,
        occurredAt: normalizeTimestamp(row.occurredAt),
      },
      {
        retryableAttemptId,
      },
    )
  );
}

export function mapBrokerVerificationStatusRows(
  internalRow: InternalBrokerVerificationRow | null,
  officialRow: OfficialBrokerVerificationRow | null,
): BrokerVerificationStatus | null {
  const supportedPath = internalRow?.scope ?? officialRow?.scope ?? null;

  if (supportedPath === null) {
    return null;
  }

  return {
    supportedPath,
    internal: internalRow === null ? null : {
      source: internalRow.source,
      status: internalRow.status,
      checkedAt: normalizeTimestamp(internalRow.checkedAt),
      summary: internalRow.summary,
      evidenceUrl: internalRow.detailUrl,
    },
    official: officialRow === null
      ? {
        state: "notCertified",
        checkedAt: null,
        directoryUrl: null,
      }
      : {
        state: officialRow.certificationState ?? "notCertified",
        checkedAt: normalizeTimestamp(officialRow.checkedAt),
        directoryUrl: officialRow.detailUrl,
      },
  };
}

export function mapCertificationWorkflowStatusRow(
  row: CertificationWorkflowStatusRow,
): CertificationWorkflowStatus {
  return {
    workflowKey: row.workflowKey,
    latestInternal: row.deploymentRecordId === null ||
        row.deploymentLabel === null || row.status === null ||
        row.summary === null || row.checkedAt === null
      ? null
      : {
        deploymentRecordId: normalizeNumeric(row.deploymentRecordId),
        deploymentLabel: row.deploymentLabel,
        status: row.status,
        checkedAt: normalizeTimestamp(row.checkedAt),
        summary: row.summary,
        evidenceUrl: row.detailUrl,
      },
  };
}

export function mapLatestOfficialCertificationEvidenceRow(
  row: LatestOfficialCertificationEvidenceRow | null,
): LatestOfficialCertificationEvidence | null {
  if (row === null) {
    return null;
  }

  return {
    workflowKey: row.workflowKey,
    state: row.certificationState ?? "notCertified",
    checkedAt: normalizeTimestamp(row.checkedAt),
    summary: row.summary,
    directoryUrl: row.detailUrl,
  };
}

function mapInventoryInstallEvidence(
  row: InventoryQueryRow,
): DeploymentActivitySnapshot | null {
  if (
    row.installEvidenceStatus === null ||
    row.installEvidenceSummary === null ||
    row.installEvidenceDetail === null ||
    row.installEvidenceOccurredAt === null
  ) {
    return null;
  }

  return mapActivitySnapshotRow({
    eventType: "deployment.binding_saved",
    status: row.installEvidenceStatus,
    summary: row.installEvidenceSummary,
    attemptId: null,
    detail: row.installEvidenceDetail,
    occurredAt: row.installEvidenceOccurredAt,
  });
}

function mapInventoryBrokerVerification(
  row: InventoryQueryRow,
): BrokerVerificationStatus | null {
  return mapBrokerVerificationStatusRows(
    row.internalBrokerVerificationScope === null ||
      row.internalBrokerVerificationSource === null ||
      row.internalBrokerVerificationStatus === null ||
      row.internalBrokerVerificationSummary === null ||
      row.internalBrokerVerificationCheckedAt === null
      ? null
      : {
        scope: row.internalBrokerVerificationScope,
        source: row.internalBrokerVerificationSource,
        status: row.internalBrokerVerificationStatus,
        summary: row.internalBrokerVerificationSummary,
        detailUrl: row.internalBrokerVerificationDetailUrl,
        checkedAt: row.internalBrokerVerificationCheckedAt,
      },
    row.officialBrokerVerificationScope === null ||
      row.officialBrokerVerificationStatus === null ||
      row.officialBrokerVerificationCheckedAt === null
      ? null
      : {
        scope: row.officialBrokerVerificationScope,
        status: row.officialBrokerVerificationStatus,
        certificationState: row.officialBrokerVerificationCertificationState,
        detailUrl: row.officialBrokerVerificationDetailUrl,
        checkedAt: row.officialBrokerVerificationCheckedAt,
      },
  );
}
