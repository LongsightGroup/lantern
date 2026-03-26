import type {
  ApprovalStatus,
  AuditActorType,
  AuditEventStatus,
  GradePublicationStatus,
  PlacementAuditSnapshot,
} from '../package_review/types.ts';
import type { LmsType } from '../lti/types.ts';
import type {
  BrokerVerificationRunStatus,
  BrokerVerificationSource,
  BrokerVerificationStatus,
  ControlPlaneActivityStatus,
  ControlPlaneDeploymentDetailSnapshot,
  ControlPlaneDeploymentInventoryRow,
  DeploymentGradePublicationSnapshot,
  OfficialCertificationState,
  RetryableGradePublicationLookup,
} from './types.ts';

export interface InventoryQueryRow {
  deploymentId: number;
  deploymentSlug: string;
  deploymentLabel: string;
  appId: string;
  appTitle: string;
  ownerId: string | null;
  enabledPackageVersionId: number | null;
  enabledPackageVersion: string | null;
  approvalStatus: ApprovalStatus | null;
  reviewedAt: Date | string | null;
  bindingLmsType: LmsType | null;
  bindingCanvasEnvironment: string | null;
  bindingIssuer: string | null;
  bindingClientId: string | null;
  bindingDeploymentId: string | null;
  bindingMoodleAuthenticationRequestUrl: string | null;
  bindingMoodleAccessTokenUrl: string | null;
  bindingMoodleJwksUrl: string | null;
  bindingSakaiOidcAuthenticationUrl: string | null;
  bindingSakaiAccessTokenUrl: string | null;
  bindingSakaiJwksUrl: string | null;
  updatedAt: Date | string;
  lastLaunchAt: Date | string | null;
  lastLaunchStatus: ControlPlaneActivityStatus | null;
  lastNrpsReadAt: Date | string | null;
  lastNrpsReadStatus: ControlPlaneActivityStatus | null;
  lastGradePublishAt: Date | string | null;
  lastGradePublishStatus: GradePublicationStatus | null;
  totalLaunches: number | string;
  attemptsStarted: number | string;
  attemptsCompleted: number | string;
  gradePublishesSucceeded: number | string;
  gradePublishesFailed: number | string;
  recentActiveUsers: number | string;
  usageLastLaunchAt: Date | string | null;
  measuredAt: Date | string;
}

export interface ActivitySnapshotRow {
  eventType: string;
  status: AuditEventStatus;
  summary: string;
  attemptId: string | null;
  detail: Record<string, unknown>;
  occurredAt: Date | string;
}

export interface GradePublicationSnapshotRow {
  attemptId: string;
  status: GradePublicationStatus;
  lineItemUrl: string;
  canvasUserId: string;
  scoreGiven: number | string;
  scoreMaximum: number | string;
  activityProgress: DeploymentGradePublicationSnapshot['activityProgress'];
  gradingProgress: DeploymentGradePublicationSnapshot['gradingProgress'];
  publishedAt: Date | string | null;
  updatedAt: Date | string;
  errorCode: string | null;
  errorDetail: Record<string, unknown> | null;
}

export interface DiagnosticRow {
  id: number;
  eventType: string;
  actorType: AuditActorType;
  status: AuditEventStatus;
  deploymentRecordId: number | null;
  attemptId: string | null;
  summary: string;
  detail: Record<string, unknown>;
  occurredAt: Date | string;
}

export type PersistedBrokerVerificationRunStatus = BrokerVerificationRunStatus | 'notCertified';

export interface RecordBrokerVerificationRunInput {
  source: BrokerVerificationSource;
  scope: BrokerVerificationStatus['supportedPath'];
  status: PersistedBrokerVerificationRunStatus;
  certificationState: Exclude<OfficialCertificationState, 'notCertified'> | null;
  summary: string;
  detailUrl: string | null;
  checkedAt: string;
}

export interface InternalBrokerVerificationRow {
  scope: BrokerVerificationStatus['supportedPath'];
  source: BrokerVerificationSource;
  status: BrokerVerificationRunStatus;
  summary: string;
  detailUrl: string | null;
  checkedAt: Date | string;
}

export interface OfficialBrokerVerificationRow {
  scope: BrokerVerificationStatus['supportedPath'];
  status: PersistedBrokerVerificationRunStatus;
  certificationState: Exclude<OfficialCertificationState, 'notCertified'> | null;
  summary: string;
  detailUrl: string | null;
  checkedAt: Date | string;
}

export interface RetryLookupRow {
  attemptId: string;
  deploymentRecordId: number;
  deploymentSlug: string;
  publicationStatus: GradePublicationStatus;
  lineItemUrl: string;
  canvasUserId: string;
  scoreGiven: number | string;
  scoreMaximum: number | string;
  activityProgress: DeploymentGradePublicationSnapshot['activityProgress'];
  gradingProgress: DeploymentGradePublicationSnapshot['gradingProgress'];
  publishedAt: Date | string | null;
  updatedAt: Date | string;
  errorCode: string | null;
  errorDetail: Record<string, unknown> | null;
  bindingCanvasEnvironment: string | null;
  bindingIssuer: string | null;
  bindingClientId: string | null;
  bindingDeploymentId: string | null;
  sessionId: string | null;
  runtimeAttemptId: string | null;
  runtimeDeploymentRecordId: number | null;
  runtimeDeploymentSlug: string | null;
  runtimeAppId: string | null;
  runtimePackageVersionId: number | null;
  runtimePackageVersion: string | null;
  runtimeAgsScope: string[] | null;
  runtimeAgsLineitemsUrl: string | null;
  runtimeAgsLineitemUrl: string | null;
  runtimeNrpsContextMembershipsUrl: string | null;
  runtimeNrpsServiceVersions: string[] | null;
  runtimeCreatedAt: Date | string | null;
  runtimeExpiresAt: Date | string | null;
}

export interface OpsRepository {
  listControlPlaneDeployments(): Promise<ControlPlaneDeploymentInventoryRow[]>;
  getControlPlaneDeploymentDetail(
    deploymentRecordId: number,
  ): Promise<ControlPlaneDeploymentDetailSnapshot | null>;
  getLatestBrokerVerification(): Promise<BrokerVerificationStatus | null>;
  getLatestBrokerVerificationStatus(): Promise<BrokerVerificationStatus | null>;
  recordBrokerVerificationRun(input: RecordBrokerVerificationRunInput): Promise<void>;
  getRetryableGradePublicationLookup(
    attemptId: string,
  ): Promise<RetryableGradePublicationLookup | null>;
  getPlacementAuditSnapshot(placementId: string): Promise<PlacementAuditSnapshot>;
}
