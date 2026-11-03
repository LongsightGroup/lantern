import type {
  AccessibilityReview,
  ApprovalStatus,
  AttemptEventRecord,
  AttemptEvidenceArtifactRecord,
  AttemptRecord,
  AuditEventRecord,
  AuthoringDraftFileRecord,
  AuthoringDraftRecord,
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
  ReviewedRuntimeContract,
  ValidationIssue,
} from './types.ts';
import type { RuntimeSessionRecord } from '../lti/types.ts';

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
  sandboxGradingEnabled: number;
  catalogVisibility: PackageVersionRecord['catalogVisibility'];
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

export interface RuntimeSessionRow {
  sessionId: string;
  sessionToken: string;
  ltiToolSessionId: string | null;
  attemptId?: string | null;
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
  previewSessionId: string;
  createdAt: Date | string;
  expiresAt: Date | string;
}

export interface PreviewSessionRow {
  sessionId: string;
  packageVersionId: number;
  appId: string;
  packageVersion: string;
  packageTitle: string;
  origin: PreviewSessionRecord['origin'];
  contentPath: string;
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
  previewSessionId: string;
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
  learningVerb: AttemptEventRecord['learningVerb'];
  objectId: string;
  objectType: AttemptEventRecord['objectType'];
  result: AttemptEventRecord['result'];
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

export interface AuditEventRow {
  id: number;
  eventType: string;
  actorType: AuditEventRecord['actorType'];
  actorId: string | null;
  packageVersionId: number | null;
  attemptId: string | null;
  status: AuditEventRecord['status'];
  summary: string;
  detail: Record<string, unknown>;
  occurredAt: Date | string;
}
