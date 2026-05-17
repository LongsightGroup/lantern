import type {
  AccessibilityReview,
  ApprovalStatus,
  AttemptEventRecord,
  AttemptEvidenceArtifactRecord,
  AttemptRecord,
  AuditEventRecord,
  AuthoringDraftFileRecord,
  AuthoringDraftRecord,
  GradePublicationRecord,
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
  ReviewedRuntimeContract,
  ValidationIssue,
} from './types.ts';
import type { LtiProfileId } from '../lti/profile.ts';
import type {
  CanvasDeploymentBinding,
  CanvasEnvironment,
  DeepLinkingSessionRecord,
  DynamicRegistrationStateRecord,
  LmsType,
  PersistedDeploymentLmsType,
  RuntimeSessionRecord,
} from '../lti/types.ts';

export interface PackageVersionRow {
  id: number;
  appId: string;
  version: string;
  title: string;
  description: string | null;
  ownerType: 'user';
  ownerId: string;
  entrypoint: string;
  roles: PackageVersionRecord['roles'];
  installScope: PackageVersionRecord['installScope'];
  capabilities: PackageVersionRecord['capabilities'];
  gradingMode: PackageVersionRecord['grading']['mode'];
  gradingRubricFile: string | null;
  gradingMaxScore: number | null;
  approvalStatus: ApprovalStatus;
  reviewNotes: string | null;
  accessibilityReview: AccessibilityReview | null;
  reviewedAt: Date | string | null;
  validationIssues: ValidationIssue[];
  manifestJson: Record<string, unknown>;
  artifactRoot: string;
  artifactDigest: string;
  runtimeContract: ReviewedRuntimeContract | null;
  runtimeContractSignature: string | null;
  importedAt: Date | string;
}

export interface DeploymentRow {
  id: number;
  slug: string;
  label: string;
  appId: string;
  enabledPackageVersionId: number | null;
  enabledPackageVersion: string | null;
  lmsType: PersistedDeploymentLmsType;
  canvasEnvironment: CanvasEnvironment | null;
  issuer: string | null;
  clientId: string | null;
  deploymentId: string | null;
  authorizationEndpoint: string | null;
  accessTokenUrl: string | null;
  jwksUrl: string | null;
  ltiProfileOverride: LtiProfileId | null;
  updatedAt: Date | string;
}

export interface LanternLtiProfileSettingsRow {
  defaultLtiProfile: LtiProfileId;
  updatedAt: Date | string;
}

export interface LoginStateRow {
  lmsType: LmsType;
  state: string;
  canvasEnvironment: CanvasDeploymentBinding['canvasEnvironment'] | null;
  issuer: CanvasDeploymentBinding['issuer'];
  clientId: CanvasDeploymentBinding['clientId'];
  deploymentId: CanvasDeploymentBinding['deploymentId'];
  nonce: string;
  loginHint: string;
  targetLinkUri: string;
  ltiMessageHint: string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
  usedAt: Date | string | null;
}

export interface DynamicRegistrationStateRow {
  state: string;
  appId: string;
  lmsType: DynamicRegistrationStateRecord['lms'];
  createdAt: Date | string;
  expiresAt: Date | string;
  usedAt: Date | string | null;
}

export interface RuntimeSessionRow {
  sessionId: string;
  sessionToken: string;
  attemptId?: string | null;
  deploymentRecordId: number;
  deploymentSlug: string;
  appId: string;
  packageVersionId: number;
  packageVersion: string;
  capabilities: RuntimeSessionRecord['capabilities'];
  snapshotRoot: string;
  entrypointPath: string;
  contentPath: string;
  agsScope: string[];
  agsLineitemsUrl: string | null;
  agsLineitemUrl: string | null;
  nrpsContextMembershipsUrl: string | null;
  nrpsServiceVersions: string[];
  launchUserRole: RuntimeSessionRecord['launch']['userRole'];
  launchCourseId: string;
  launchAssignmentId: string | null;
  launchActivityId: string;
  previewSessionId: string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
}

export interface DeepLinkingSessionRow {
  sessionId: string;
  sessionToken: string;
  deploymentRecordId: number;
  deploymentSlug: string;
  appId: string;
  userId: string | null;
  userRole: DeepLinkingSessionRecord['userRole'];
  contextId: string | null;
  contextTitle: string | null;
  deepLinkReturnUrl: string;
  data: string | null;
  placement: DeepLinkingSessionRecord['placement'];
  acceptTypes: DeepLinkingSessionRecord['acceptTypes'];
  acceptMultiple: boolean;
  acceptPresentationDocumentTargets: DeepLinkingSessionRecord['acceptPresentationDocumentTargets'];
  acceptLineItem: boolean;
  selectedPackageVersionId: number | null;
  selectedPackageVersion: string | null;
  selectedActivityId: string | null;
  selectedContentPath: string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
  usedAt: Date | string | null;
}

export interface ReviewedPlacementRow {
  placementId: string;
  deploymentRecordId: number;
  deploymentSlug: string;
  appId: string;
  contextId: string | null;
  contextTitle: string | null;
  packageVersionId: number;
  packageVersion: string;
  packageTitle: string;
  activityId: string;
  contentPath: string;
  contentTitle: string | null;
  createdByUserId: string | null;
  resourceLinkId: string | null;
  createdAt: Date | string;
  boundAt: Date | string | null;
}

export interface PreviewSessionRow {
  sessionId: string;
  packageVersionId: number;
  appId: string;
  packageVersion: string;
  packageTitle: string;
  origin: PreviewSessionRecord['origin'];
  contentPath: string;
  deepLinkingSessionId: string | null;
  capabilities: PreviewSessionRecord['capabilities'];
  snapshotRoot: string;
  entrypointPath: string;
  launchUserId: string;
  launchUserRole: PreviewSessionRecord['launch']['userRole'];
  launchCourseId: string;
  launchAssignmentId: string | null;
  launchActivityId: string;
  fakeAttemptId: string;
  fakeScoreMaximum: number | string;
  fixtureData: PreviewSessionRecord['fixtureData'];
  createdAt: Date | string;
}

export interface AuthoringDraftRow {
  draftId: string;
  packageVersionId: number;
  appId: string;
  packageVersion: string;
  packageTitle: string;
  authoringKind: AuthoringDraftRecord['authoringKind'];
  authoringPaths: unknown;
  baseSnapshotRoot: string;
  latestPromptText: string | null;
  latestGenerationNotes: unknown;
  savedSource: AuthoringDraftRecord['savedSource'];
  lastPreviewedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface AuthoringDraftFileRow {
  draftId: string;
  relativePath: string;
  contents: string;
  sequence: AuthoringDraftFileRecord['sequence'];
}

export interface PlacementAuditSnapshotRow extends ReviewedPlacementRow {
  latestPreviewSessionId: string | null;
  latestPreviewOccurredAt: Date | string | null;
  previewEvidenceCount: number | string;
  deepLinkingRequestCount: number | string;
  placementEventCount: number | string;
  reviewerEventCount: number | string;
  latestAuditOccurredAt: Date | string | null;
}

export interface PreviewEvidenceRow {
  id: number;
  previewSessionId: string;
  sequence: number;
  eventType: string;
  capability: PreviewEvidenceRecord['capability'];
  summary: string;
  detail: PreviewEvidenceRecord['detail'];
  occurredAt: Date | string;
}

export interface AttemptRow {
  id: number;
  attemptId: string;
  deploymentRecordId: number;
  deploymentSlug: string;
  appId: string;
  packageVersionId: number;
  packageVersion: string;
  userId: string;
  userDisplayName: string | null;
  userEmail: string | null;
  userLogin: string | null;
  userRole: AttemptRecord['userRole'];
  contextId: string;
  resourceLinkId: string;
  activityId: string;
  status: AttemptRecord['status'];
  completionState: AttemptRecord['completionState'];
  localState: AttemptRecord['localState'];
  startedAt: Date | string;
  finalizedAt: Date | string | null;
}

export interface AttemptEventRow {
  id: number;
  attemptId: string;
  sequence: number;
  eventType: AttemptEventRecord['eventType'];
  event: AttemptEventRecord['event'];
  receivedAt: Date | string;
}

export interface AttemptEvidenceArtifactRow {
  artifactId: string;
  attemptId: string;
  sequence: number;
  kind: AttemptEvidenceArtifactRecord['kind'];
  contentType: string;
  fileName: string;
  storageKey: string;
  byteSize: number | string;
  sha256: string;
  createdAt: Date | string;
}

export interface LineItemBindingRow {
  id: number;
  deploymentRecordId: number;
  packageVersionId: number;
  contextId: string;
  resourceLinkId: string;
  activityId: string;
  lineItemsUrl: string;
  lineItemUrl: string;
  resourceId: string;
  tag: string;
  label: string;
  scoreMaximum: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface GradePublicationRow {
  id: number;
  attemptId: string;
  lineItemBindingId: number;
  lineItemUrl: string;
  platformUserId: string;
  scoreGiven: number | string;
  scoreMaximum: number | string;
  activityProgress: GradePublicationRecord['activityProgress'];
  gradingProgress: GradePublicationRecord['gradingProgress'];
  status: GradePublicationRecord['status'];
  createdAt: Date | string;
  updatedAt: Date | string;
  publishedAt: Date | string | null;
  errorCode: string | null;
  errorDetail: Record<string, unknown> | null;
}

export interface AuditEventRow {
  id: number;
  eventType: string;
  actorType: AuditEventRecord['actorType'];
  actorId: string | null;
  deploymentRecordId: number | null;
  packageVersionId: number | null;
  attemptId: string | null;
  lineItemBindingId: number | null;
  status: AuditEventRecord['status'];
  summary: string;
  detail: Record<string, unknown>;
  occurredAt: Date | string;
}
