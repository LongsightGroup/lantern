import type { AttemptEvent, Capability, UserRole } from "../../sdk/app-sdk.ts";
import type { DeploymentBinding } from "../lti/types.ts";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type InstallScope = "course" | "assignment";
export type GradingMode = "declarative" | "manual" | "completion";
export type ValidationSeverity = "error";
export type AttemptStatus = "in_progress" | "completed" | "abandoned";
export type AttemptCompletionState = "completed" | "abandoned";
export type GradePublicationStatus = "pending" | "published" | "failed";
export type AuditActorType = "user" | "system" | "platform";
export type AuditEventStatus = "accepted" | "succeeded" | "failed";

export interface PackageOwner {
  type: "user";
  id: string;
}

export interface GradingSettings {
  mode: GradingMode;
  rubricFile: string | null;
  maxScore: number | null;
}

export interface ValidationIssue {
  field: string;
  message: string;
  keyword: string;
  severity: ValidationSeverity;
}

export interface PackageArtifactRecord {
  snapshotRoot: string;
  manifestPath: string;
  entrypointPath: string;
  digest: string;
}

export interface PackageVersionRecord {
  id: number;
  appId: string;
  version: string;
  title: string;
  description: string | null;
  owner: PackageOwner;
  entrypoint: string;
  roles: UserRole[];
  installScope: InstallScope;
  capabilities: Capability[];
  grading: GradingSettings;
  approvalStatus: ApprovalStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  validationIssues: ValidationIssue[];
  manifestJson: Record<string, unknown>;
  artifact: PackageArtifactRecord;
  importedAt: string;
}

export interface DeploymentRecord {
  id: number;
  slug: string;
  label: string;
  appId: string;
  enabledPackageVersionId: number | null;
  enabledPackageVersion: string | null;
  binding: DeploymentBinding | null;
  updatedAt: string;
}

export interface AttemptRecord {
  id: number;
  attemptId: string;
  deploymentRecordId: number;
  deploymentSlug: string;
  appId: string;
  packageVersionId: number;
  packageVersion: string;
  userId: string;
  userRole: UserRole;
  contextId: string;
  resourceLinkId: string;
  activityId: string;
  status: AttemptStatus;
  completionState: AttemptCompletionState | null;
  startedAt: string;
  finalizedAt: string | null;
}

export interface AttemptEventRecord {
  id: number;
  attemptId: string;
  sequence: number;
  eventType: AttemptEvent["type"];
  event: AttemptEvent;
  receivedAt: string;
}

export interface CanvasLineItemBindingRecord {
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
  createdAt: string;
  updatedAt: string;
}

export interface GradePublicationRecord {
  id: number;
  attemptId: string;
  lineItemBindingId: number;
  lineItemUrl: string;
  canvasUserId: string;
  scoreGiven: number;
  scoreMaximum: number;
  activityProgress: "Completed" | "InProgress" | "Initialized";
  gradingProgress: "Pending" | "PendingManual" | "FullyGraded" | "Failed";
  status: GradePublicationStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  errorCode: string | null;
  errorDetail: Record<string, unknown> | null;
}

export interface AuditEventRecord {
  id: number;
  eventType: string;
  actorType: AuditActorType;
  actorId: string | null;
  deploymentRecordId: number | null;
  packageVersionId: number | null;
  attemptId: string | null;
  lineItemBindingId: number | null;
  status: AuditEventStatus;
  summary: string;
  detail: Record<string, unknown>;
  occurredAt: string;
}
