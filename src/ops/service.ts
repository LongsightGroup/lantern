import type {
  PublishFinalScoreInput,
  PublishFinalScoreResult,
} from "../lti/services.ts";
import { requestCanvasServiceAccessToken } from "../lti/services.ts";
import type { DeploymentBinding } from "../lti/types.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import type {
  ApprovalStatus,
  GradePublicationStatus,
} from "../package_review/types.ts";
import { publishGovernedGradePublication } from "../runtime/gateway.ts";
import type {
  BrokerVerificationRunStatus,
  ControlPlaneActivityStatus,
  ControlPlaneDeploymentHealth,
  ControlPlaneDiagnosticItem,
  ControlPlaneHealthDimension,
  PilotUsageMetrics,
  RetryableGradePublicationLookup,
} from "./types.ts";

export interface DeploymentHealthInput {
  approvalStatus: ApprovalStatus | null;
  reviewedAt?: string | null;
  enabledPackageVersionId: number | null;
  binding: DeploymentBinding | null;
  lastLaunchStatus: ControlPlaneActivityStatus | null;
  lastLaunchAt?: string | null;
  lastGradePublishStatus: GradePublicationStatus | null;
  lastGradePublishAt?: string | null;
  lastNrpsReadStatus: ControlPlaneActivityStatus | null;
  lastNrpsReadAt?: string | null;
  brokerVerificationStatus: BrokerVerificationRunStatus | null;
  brokerCheckedAt?: string | null;
}

export interface RetryScorePublisher {
  (input: PublishFinalScoreInput): Promise<PublishFinalScoreResult>;
}

export interface RetryAccessTokenRequester {
  (input: {
    issuer: string;
    clientId: string;
    scopes: string[];
  }): Promise<{ accessToken: string }>;
}

export interface RetryLookupRepository
  extends Pick<PackageReviewRepository, "updateGradePublication"> {
  getRetryableGradePublicationLookup(
    attemptId: string,
  ): Promise<RetryableGradePublicationLookup | null>;
}

const SECRET_DETAIL_KEYS = new Set([
  "accessToken",
  "authorization",
  "bearerToken",
  "clientAssertion",
  "clientSecret",
  "idToken",
  "refreshToken",
  "secret",
  "token",
]);

export function deriveDeploymentHealth(
  input: DeploymentHealthInput,
): ControlPlaneDeploymentHealth {
  const review = buildReviewDimension(input.approvalStatus, input.reviewedAt);
  const enablement = buildEnablementDimension(
    input.enabledPackageVersionId,
    input.binding,
  );
  const launch = buildActivityDimension({
    name: "launch",
    status: input.lastLaunchStatus,
    checkedAt: input.lastLaunchAt ?? null,
    notRunSummary: "No launch has been recorded yet.",
    healthySummary: "Latest launch reached the governed runtime handoff.",
    failedSummary: "Latest launch failed and needs operator review.",
    pendingSummary: "Latest launch evidence is still pending review.",
  });
  const gradePublication = buildGradePublicationDimension(
    input.lastGradePublishStatus,
    input.lastGradePublishAt ?? null,
  );
  const nrps = buildActivityDimension({
    name: "nrps",
    status: input.lastNrpsReadStatus,
    checkedAt: input.lastNrpsReadAt ?? null,
    notRunSummary: "Roster verification has not run yet.",
    healthySummary:
      "Roster verification succeeded on the saved deployment path.",
    failedSummary: "Latest roster verification failed.",
    pendingSummary: "Roster verification is still pending review.",
  });
  const brokerVerification = buildBrokerVerificationDimension(
    input.brokerVerificationStatus,
    input.brokerCheckedAt ?? null,
  );
  const dimensions = {
    review,
    enablement,
    launch,
    gradePublication,
    nrps,
    brokerVerification,
  };
  const statuses = Object.values(dimensions).map((dimension) =>
    dimension.status
  );
  const overallStatus = review.status === "failed"
    ? "failed"
    : statuses.every((status) => status === "healthy")
    ? "healthy"
    : statuses.some((status) => status === "failed" || status === "attention")
    ? "attention"
    : "unknown";

  return {
    overallStatus,
    summary: summarizeOverallHealth(overallStatus, dimensions),
    dimensions,
  };
}

export function formatDiagnosticItem(
  item: ControlPlaneDiagnosticItem,
  options: {
    retryableAttemptId?: string | null;
  } = {},
): ControlPlaneDiagnosticItem {
  const detail = sanitizeDetailRecord(item.detail);

  return {
    ...item,
    operatorSummary: buildOperatorSummary({
      ...item,
      detail,
    }),
    retryable: isRetryableDiagnostic(
      {
        ...item,
        detail,
      },
      options.retryableAttemptId ?? null,
    ),
    detail,
  };
}

export function summarizePilotUsage(metrics: PilotUsageMetrics): Array<{
  label: string;
  value: string;
}> {
  return [
    {
      label: "Launches recorded",
      value: String(metrics.totalLaunches),
    },
    {
      label: "Attempts completed",
      value: String(metrics.attemptsCompleted),
    },
    {
      label: "Grade publishes",
      value:
        `${metrics.gradePublishesSucceeded} passed / ${metrics.gradePublishesFailed} failed`,
    },
    {
      label: "Recent active users",
      value: String(metrics.recentActiveUsers),
    },
  ];
}

export async function retryFailedGradePublication(input: {
  repository: RetryLookupRepository;
  attemptId: string;
  now?: () => Date;
  requestAccessToken?: RetryAccessTokenRequester;
  publishScore?: RetryScorePublisher;
}): Promise<RetryableGradePublicationLookup> {
  const lookup = await input.repository.getRetryableGradePublicationLookup(
    input.attemptId,
  );

  if (lookup === null) {
    throw new Error(
      `Retry blocked: Lantern could not find a failed grade publication for attempt ${input.attemptId}.`,
    );
  }

  if (lookup.runtimeSession === null) {
    throw new Error(
      "Retry blocked: Lantern no longer has the attempt-scoped runtime session for this grade publication.",
    );
  }

  if (lookup.runtimeSession.services.ags === null) {
    throw new Error(
      "Retry blocked: the saved runtime session does not include AGS service context.",
    );
  }

  if (lookup.binding === null) {
    throw new Error(
      "Retry blocked: Lantern no longer has the saved Canvas binding for this grade publication.",
    );
  }

  const requestAccessToken = input.requestAccessToken ??
    requestCanvasServiceAccessToken;
  const now = input.now ?? (() => new Date());
  const token = await requestAccessToken({
    issuer: lookup.binding.issuer,
    clientId: lookup.binding.clientId,
    scopes: lookup.runtimeSession.services.ags.scope,
  });
  const published = await publishGovernedGradePublication({
    repository: input.repository,
    attemptId: lookup.attemptId,
    publication: lookup.publication,
    accessToken: token.accessToken,
    now,
    ...(input.publishScore === undefined
      ? {}
      : { publishScore: input.publishScore }),
  });

  return {
    ...lookup,
    publication: {
      ...lookup.publication,
      status: published.gradePublication.status,
      publishedAt: published.gradePublication.publishedAt,
      updatedAt: published.gradePublication.updatedAt,
      errorCode: published.gradePublication.errorCode,
      errorDetail: published.gradePublication.errorDetail,
    },
  };
}

function buildReviewDimension(
  approvalStatus: ApprovalStatus | null,
  reviewedAt: string | null | undefined,
): ControlPlaneHealthDimension {
  if (approvalStatus === "approved") {
    return {
      name: "review",
      status: "healthy",
      summary: "Reviewed version is approved.",
      checkedAt: reviewedAt ?? null,
    };
  }

  if (approvalStatus === "rejected") {
    return {
      name: "review",
      status: "failed",
      summary: "Pinned version is rejected and cannot be launched.",
      checkedAt: reviewedAt ?? null,
    };
  }

  if (approvalStatus === "pending") {
    return {
      name: "review",
      status: "attention",
      summary: "Pinned version is still awaiting approval.",
      checkedAt: reviewedAt ?? null,
    };
  }

  return {
    name: "review",
    status: "unknown",
    summary: "No reviewed version is pinned yet.",
    checkedAt: reviewedAt ?? null,
  };
}

function buildEnablementDimension(
  enabledPackageVersionId: number | null,
  binding: DeploymentBinding | null,
): ControlPlaneHealthDimension {
  if (enabledPackageVersionId !== null && binding !== null) {
    return {
      name: "enablement",
      status: "healthy",
      summary: "Deployment pin and Canvas binding are present.",
      checkedAt: null,
    };
  }

  if (enabledPackageVersionId !== null) {
    return {
      name: "enablement",
      status: "attention",
      summary:
        "Exact version is pinned, but the Canvas binding is still missing.",
      checkedAt: null,
    };
  }

  if (binding !== null) {
    return {
      name: "enablement",
      status: "attention",
      summary:
        "Canvas binding is saved, but no exact reviewed version is pinned.",
      checkedAt: null,
    };
  }

  return {
    name: "enablement",
    status: "unknown",
    summary:
      "Deployment still needs an exact version pin and a Canvas binding.",
    checkedAt: null,
  };
}

function buildActivityDimension(input: {
  name: "launch" | "nrps";
  status: ControlPlaneActivityStatus | null;
  checkedAt: string | null;
  notRunSummary: string;
  healthySummary: string;
  failedSummary: string;
  pendingSummary: string;
}): ControlPlaneHealthDimension {
  switch (input.status) {
    case "succeeded":
      return {
        name: input.name,
        status: "healthy",
        summary: input.healthySummary,
        checkedAt: input.checkedAt,
      };
    case "failed":
      return {
        name: input.name,
        status: "failed",
        summary: input.failedSummary,
        checkedAt: input.checkedAt,
      };
    case "pending":
      return {
        name: input.name,
        status: "attention",
        summary: input.pendingSummary,
        checkedAt: input.checkedAt,
      };
    case "notRun":
    case null:
      return {
        name: input.name,
        status: "unknown",
        summary: input.notRunSummary,
        checkedAt: input.checkedAt,
      };
  }
}

function buildGradePublicationDimension(
  status: GradePublicationStatus | null,
  checkedAt: string | null,
): ControlPlaneHealthDimension {
  switch (status) {
    case "published":
      return {
        name: "gradePublication",
        status: "healthy",
        summary: "Latest grade publish succeeded.",
        checkedAt,
      };
    case "failed":
      return {
        name: "gradePublication",
        status: "failed",
        summary: "Latest grade publish failed and may need retry.",
        checkedAt,
      };
    case "pending":
      return {
        name: "gradePublication",
        status: "attention",
        summary: "Latest grade publish is still pending.",
        checkedAt,
      };
    case null:
      return {
        name: "gradePublication",
        status: "unknown",
        summary: "No grade publish has been recorded yet.",
        checkedAt,
      };
  }
}

function buildBrokerVerificationDimension(
  status: BrokerVerificationRunStatus | null,
  checkedAt: string | null,
): ControlPlaneHealthDimension {
  switch (status) {
    case "passed":
      return {
        name: "brokerVerification",
        status: "healthy",
        summary: "Latest broker verification evidence passed.",
        checkedAt,
      };
    case "failed":
      return {
        name: "brokerVerification",
        status: "failed",
        summary: "Latest broker verification evidence failed.",
        checkedAt,
      };
    case "pending":
      return {
        name: "brokerVerification",
        status: "attention",
        summary: "Broker verification is still pending.",
        checkedAt,
      };
    case "notRun":
    case null:
      return {
        name: "brokerVerification",
        status: "unknown",
        summary: "No broker verification evidence has been recorded yet.",
        checkedAt,
      };
  }
}

function summarizeOverallHealth(
  overallStatus: ControlPlaneDeploymentHealth["overallStatus"],
  dimensions: ControlPlaneDeploymentHealth["dimensions"],
): string {
  if (overallStatus === "healthy") {
    return "Deployment is healthy across review, launch, grading, and verification.";
  }

  if (overallStatus === "failed") {
    return dimensions.review.status === "failed"
      ? "Deployment is blocked by review state."
      : "Deployment has a failing control-plane signal that needs operator action.";
  }

  if (overallStatus === "attention") {
    if (dimensions.gradePublication.status === "failed") {
      return "Deployment is readable in the control plane and needs a retry or grading follow-up.";
    }

    return "Deployment is readable in the control plane and needs one operator follow-up.";
  }

  return "Deployment does not have enough evidence yet to determine health.";
}

function buildOperatorSummary(item: ControlPlaneDiagnosticItem): string {
  if (item.kind === "launch") {
    if (item.code === "deployment_mismatch") {
      return "Launch rejected because the incoming Canvas deployment did not match the saved deployment binding.";
    }

    if (item.code === "signature_validation_failed") {
      return "Launch rejected because Lantern could not verify the signed id_token against the saved Canvas login.";
    }

    return item.status === "failed"
      ? "Launch failed before Lantern could hand the learner into the governed runtime."
      : "Launch evidence was recorded for this deployment.";
  }

  if (item.kind === "nrps") {
    return item.status === "failed"
      ? "Roster verification failed for the saved deployment path."
      : "Roster verification evidence was recorded for this deployment.";
  }

  if (item.kind === "brokerVerification") {
    return item.status === "failed"
      ? "Broker verification failed for the supported Canvas path."
      : "Broker verification evidence was recorded for the supported Canvas path.";
  }

  if (item.kind === "reviewer") {
    return item.status === "failed"
      ? "Reviewer activity ended in a failed state and needs follow-up."
      : "Reviewer evidence was recorded for this reviewed placement.";
  }

  if (item.code === "token_request_failed") {
    return "Lantern could not get a Canvas service token for this attempt from the control plane.";
  }

  return item.status === "failed"
    ? "Grade publish failed and can be retried from the control plane."
    : "Grade publication evidence was recorded for this deployment.";
}

function isRetryableDiagnostic(
  item: ControlPlaneDiagnosticItem,
  retryableAttemptId: string | null,
): boolean {
  if (
    item.kind !== "gradePublication" ||
    item.status !== "failed" ||
    item.attemptId === null ||
    item.attemptId !== retryableAttemptId
  ) {
    return false;
  }

  return !NON_RETRYABLE_GRADE_FAILURE_CODES.has(item.code ?? "");
}

function sanitizeDetailRecord(
  detail: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(detail)) {
    if (SECRET_DETAIL_KEYS.has(key)) {
      continue;
    }

    sanitized[key] = sanitizeDetailValue(value);
  }

  return sanitized;
}

function sanitizeDetailValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeDetailValue(entry));
  }

  if (isRecord(value)) {
    return sanitizeDetailRecord(value);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const NON_RETRYABLE_GRADE_FAILURE_CODES = new Set([
  "line_item_failed",
  "missing_ags_context",
  "missing_ags_scope",
  "missing_binding",
]);
