import type { DeploymentBinding, LaunchServiceClaims } from "../lti/types.ts";
import type { LtiProfileId, ResolvedLtiProfile } from "../lti/profile.ts";
import type {
  ApprovalStatus,
  AuditActorType,
  AuditEventStatus,
  GradePublicationRecord,
  GradePublicationStatus,
} from "../package_review/types.ts";

export type ControlPlaneHealthStatus =
  | "healthy"
  | "attention"
  | "failed"
  | "unknown";

export type ControlPlaneHealthDimensionName =
  | "review"
  | "enablement"
  | "launch"
  | "gradePublication"
  | "nrps"
  | "brokerVerification";

export type ControlPlaneActivityStatus =
  | "succeeded"
  | "failed"
  | "pending"
  | "notRun";

export type ControlPlaneDiagnosticKind =
  | "launch"
  | "deepLinking"
  | "nrps"
  | "gradePublication"
  | "brokerVerification"
  | "reviewer";

export type ControlPlaneBoundaryDenialCategory =
  | "specInvalid"
  | "policyDenied";

export type BrokerVerificationSource = "manual" | "ci" | "1edtech";
export type BrokerVerificationRunStatus =
  | "passed"
  | "failed"
  | "pending"
  | "notRun";
export type OfficialCertificationState =
  | "notCertified"
  | "ltiAdvantageCertified"
  | "ltiAdvantageComplete";
export type BrokerVerificationSupportedPath =
  | "lti13LaunchAgsNrps"
  | "lti13LaunchAgsScore"
  | "lti13LaunchAgsScore";

export interface ControlPlaneHealthDimension {
  name: ControlPlaneHealthDimensionName;
  status: ControlPlaneHealthStatus;
  summary: string;
  checkedAt: string | null;
}

export interface ControlPlaneHealthDimensions {
  review: ControlPlaneHealthDimension;
  enablement: ControlPlaneHealthDimension;
  launch: ControlPlaneHealthDimension;
  gradePublication: ControlPlaneHealthDimension;
  nrps: ControlPlaneHealthDimension;
  brokerVerification: ControlPlaneHealthDimension;
}

export interface ControlPlaneDeploymentHealth {
  overallStatus: ControlPlaneHealthStatus;
  summary: string;
  dimensions: ControlPlaneHealthDimensions;
}

export interface PilotUsageMetrics {
  deploymentRecordId: number;
  totalLaunches: number;
  attemptsStarted: number;
  attemptsCompleted: number;
  gradePublishesSucceeded: number;
  gradePublishesFailed: number;
  recentActiveUsers: number;
  lastLaunchAt: string | null;
  measuredAt: string;
}

export interface DeploymentActivitySnapshot {
  status: ControlPlaneActivityStatus;
  occurredAt: string;
  summary: string;
  attemptId: string | null;
  contextId: string | null;
  detail: Record<string, unknown>;
}

export interface DeploymentRecentLaunch {
  occurredAt: string;
  summary: string;
  attemptId: string | null;
  userId: string | null;
  userDisplayName: string | null;
  userEmail: string | null;
  userLogin: string | null;
  contextId: string | null;
  resourceLinkId: string | null;
  ltiProfileId: LtiProfileId | null;
  ltiProfileSource: ResolvedLtiProfile["source"] | null;
}

export interface DeploymentGradePublicationSnapshot {
  attemptId: string;
  status: GradePublicationStatus;
  lineItemUrl: string;
  platformUserId: string;
  scoreGiven: number;
  scoreMaximum: number;
  activityProgress: GradePublicationRecord["activityProgress"];
  gradingProgress: GradePublicationRecord["gradingProgress"];
  publishedAt: string | null;
  updatedAt: string;
  errorCode: string | null;
  errorDetail: Record<string, unknown> | null;
}

export interface ControlPlaneDiagnosticItem {
  id: number;
  kind: ControlPlaneDiagnosticKind;
  eventType: string;
  actorType: AuditActorType;
  status: AuditEventStatus;
  deploymentRecordId: number | null;
  attemptId: string | null;
  code: string | null;
  boundaryDenialCategory: ControlPlaneBoundaryDenialCategory | null;
  summary: string;
  operatorSummary: string;
  retryable: boolean;
  detail: Record<string, unknown>;
  occurredAt: string;
}

export interface RetryRuntimeSessionLookup {
  sessionId: string;
  attemptId: string;
  deploymentRecordId: number;
  deploymentSlug: string;
  appId: string;
  packageVersionId: number;
  packageVersion: string;
  services: LaunchServiceClaims;
  createdAt: string;
  expiresAt: string;
}

export interface RetryableGradePublicationLookup {
  attemptId: string;
  deploymentRecordId: number;
  deploymentSlug: string;
  publication: DeploymentGradePublicationSnapshot;
  binding: DeploymentBinding | null;
  runtimeSession: RetryRuntimeSessionLookup | null;
}

export interface InternalBrokerVerificationStatus {
  source: BrokerVerificationSource;
  status: BrokerVerificationRunStatus;
  checkedAt: string;
  summary: string;
  evidenceUrl: string | null;
}

export interface OfficialBrokerCertificationStatus {
  state: OfficialCertificationState;
  checkedAt: string | null;
  directoryUrl: string | null;
}

export interface BrokerVerificationStatus {
  supportedPath: BrokerVerificationSupportedPath;
  internal: InternalBrokerVerificationStatus | null;
  official: OfficialBrokerCertificationStatus;
}

export interface ControlPlaneDeploymentInventoryRow {
  deploymentId: number;
  deploymentSlug: string;
  deploymentLabel: string;
  appId: string;
  appTitle: string;
  ownerId: string | null;
  enabledPackageVersionId: number | null;
  enabledPackageVersion: string | null;
  approvalStatus: ApprovalStatus | null;
  binding: DeploymentBinding | null;
  installEvidence: DeploymentActivitySnapshot | null;
  updatedAt: string;
  lastLaunchAt: string | null;
  lastLaunchStatus: ControlPlaneActivityStatus | null;
  lastGradePublishAt: string | null;
  lastGradePublishStatus: GradePublicationStatus | null;
  lastNrpsReadAt: string | null;
  lastNrpsReadStatus: ControlPlaneActivityStatus | null;
  pilotUsage: PilotUsageMetrics;
  health: ControlPlaneDeploymentHealth;
  brokerVerification: BrokerVerificationStatus | null;
}

export interface ControlPlaneDeploymentDetailSnapshot {
  inventory: ControlPlaneDeploymentInventoryRow;
  latestInstallEvidence: DeploymentActivitySnapshot | null;
  latestLaunch: DeploymentActivitySnapshot | null;
  recentLaunches: DeploymentRecentLaunch[];
  latestCompatibilityPath?: DeploymentActivitySnapshot | null;
  latestAgsSmoke: DeploymentActivitySnapshot | null;
  latestNrpsRead: DeploymentActivitySnapshot | null;
  latestGradePublish: DeploymentGradePublicationSnapshot | null;
  pilotUsage: PilotUsageMetrics;
  diagnostics: ControlPlaneDiagnosticItem[];
  retryableGradePublication: RetryableGradePublicationLookup | null;
  brokerVerification: BrokerVerificationStatus | null;
}
