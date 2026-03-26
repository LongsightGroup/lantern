import type {
  CanvasEnvironment,
  DeploymentBinding,
  LmsType,
} from "../lti/types.ts";
import { deriveDeploymentHealth, formatDiagnosticItem } from "./service.ts";
import type {
  BrokerVerificationStatus,
  ControlPlaneActivityStatus,
  ControlPlaneDeploymentInventoryRow,
  ControlPlaneDiagnosticItem,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
} from "./types.ts";
import type {
  DiagnosticRow,
  GradePublicationSnapshotRow,
  InternalBrokerVerificationRow,
  InventoryQueryRow,
  OfficialBrokerVerificationRow,
  RecordBrokerVerificationRunInput,
} from "./repository_types.ts";

export function mapInventoryRow(
  row: InventoryQueryRow,
  brokerVerification: BrokerVerificationStatus | null,
): ControlPlaneDeploymentInventoryRow {
  const binding = mapDeploymentBinding({
    lmsType: row.bindingLmsType,
    canvasEnvironment: row.bindingCanvasEnvironment,
    issuer: row.bindingIssuer,
    clientId: row.bindingClientId,
    deploymentId: row.bindingDeploymentId,
    moodleAuthenticationRequestUrl: row.bindingMoodleAuthenticationRequestUrl,
    moodleAccessTokenUrl: row.bindingMoodleAccessTokenUrl,
    moodleJwksUrl: row.bindingMoodleJwksUrl,
    sakaiOidcAuthenticationUrl: row.bindingSakaiOidcAuthenticationUrl,
    sakaiAccessTokenUrl: row.bindingSakaiAccessTokenUrl,
    sakaiJwksUrl: row.bindingSakaiJwksUrl,
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

export function mapGradePublicationSnapshotRow(
  row: GradePublicationSnapshotRow,
): DeploymentGradePublicationSnapshot {
  return {
    attemptId: row.attemptId,
    status: row.status,
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

export function assertBrokerVerificationRunInput(
  input: RecordBrokerVerificationRunInput,
): void {
  if (input.source === "1edtech") {
    if (input.status === "notCertified" && input.certificationState !== null) {
      throw new Error(
        "Official not-certified verification runs cannot carry a certification state.",
      );
    }

    if (input.status === "passed" && input.certificationState === null) {
      throw new Error(
        "Official passed verification runs require an explicit certification state.",
      );
    }

    return;
  }

  if (input.status === "notCertified") {
    throw new Error(
      "Only official 1EdTech verification runs can use the notCertified status.",
    );
  }

  if (input.certificationState !== null) {
    throw new Error(
      "Internal verification runs cannot carry an official certification state.",
    );
  }
}

export function mapDeploymentBinding(input: {
  lmsType?: LmsType | null;
  canvasEnvironment: string | null;
  issuer: string | null;
  clientId: string | null;
  deploymentId: string | null;
  moodleAuthenticationRequestUrl?: string | null;
  moodleAccessTokenUrl?: string | null;
  moodleJwksUrl?: string | null;
  sakaiOidcAuthenticationUrl?: string | null;
  sakaiAccessTokenUrl?: string | null;
  sakaiJwksUrl?: string | null;
}): DeploymentBinding | null {
  if (
    input.issuer === null || input.clientId === null ||
    input.deploymentId === null
  ) {
    return null;
  }

  const lmsType = input.lmsType ??
    (input.canvasEnvironment === null ? null : "canvas");

  switch (lmsType) {
    case "canvas":
      if (input.canvasEnvironment === null) {
        return null;
      }

      return {
        lms: "canvas",
        canvasEnvironment: input.canvasEnvironment as CanvasEnvironment,
        issuer: input.issuer,
        clientId: input.clientId,
        deploymentId: input.deploymentId,
      };
    case "moodle":
      if (
        input.moodleAuthenticationRequestUrl === null ||
        input.moodleAuthenticationRequestUrl === undefined ||
        input.moodleAccessTokenUrl === null ||
        input.moodleAccessTokenUrl === undefined ||
        input.moodleJwksUrl === null ||
        input.moodleJwksUrl === undefined
      ) {
        return null;
      }

      return {
        lms: "moodle",
        issuer: input.issuer,
        clientId: input.clientId,
        deploymentId: input.deploymentId,
        authenticationRequestUrl: input.moodleAuthenticationRequestUrl,
        accessTokenUrl: input.moodleAccessTokenUrl,
        jwksUrl: input.moodleJwksUrl,
      };
    case "sakai":
      if (
        input.sakaiOidcAuthenticationUrl === null ||
        input.sakaiOidcAuthenticationUrl === undefined ||
        input.sakaiAccessTokenUrl === null ||
        input.sakaiAccessTokenUrl === undefined ||
        input.sakaiJwksUrl === null ||
        input.sakaiJwksUrl === undefined
      ) {
        return null;
      }

      return {
        lms: "sakai",
        issuer: input.issuer,
        clientId: input.clientId,
        deploymentId: input.deploymentId,
        oidcAuthenticationUrl: input.sakaiOidcAuthenticationUrl,
        accessTokenUrl: input.sakaiAccessTokenUrl,
        jwksUrl: input.sakaiJwksUrl,
      };
    case null:
      return null;
  }
}

export function normalizeTimestamp(value: Date | string | null): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === null) {
    throw new Error("Expected a timestamp value.");
  }

  return value;
}

export function normalizeOptionalTimestamp(
  value: Date | string | null,
): string | null {
  if (value === null) {
    return null;
  }

  return normalizeTimestamp(value);
}

export function normalizeNumeric(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function mapAuditActivityStatus(
  eventType: string,
  status: string,
): ControlPlaneActivityStatus {
  if (eventType === "launch.rejected" || status === "failed") {
    return "failed";
  }

  if (status === "accepted" || status === "succeeded") {
    return "succeeded";
  }

  return "pending";
}

function mapDiagnosticKind(
  eventType: string,
): ControlPlaneDiagnosticItem["kind"] {
  if (eventType.startsWith("launch.")) {
    return "launch";
  }

  if (eventType === "deployment.nrps_verified") {
    return "nrps";
  }

  if (eventType.startsWith("broker_verification.")) {
    return "brokerVerification";
  }

  if (eventType.startsWith("reviewer.")) {
    return "reviewer";
  }

  return "gradePublication";
}

function readStringDetail(
  detail: Record<string, unknown>,
  key: string,
): string | null {
  const value = detail[key];
  return typeof value === "string" ? value : null;
}
