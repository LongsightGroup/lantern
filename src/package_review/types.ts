import type { AttemptEvent, Capability, UserRole } from "../../sdk/app-sdk.ts";
import type { LtiProfileId } from "../lti/profile.ts";
import type {
  DeploymentBinding,
  PersistedDeploymentLmsType,
} from "../lti/types.ts";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type InstallScope = "course" | "assignment";
export type GradingMode = "declarative" | "manual" | "completion" | "browser";
export type ValidationSeverity = "error";
export type AttemptStatus = "in_progress" | "completed" | "abandoned";
export type AttemptCompletionState = "completed" | "abandoned";
export type AttemptLocalState = Record<string, unknown> | null;
export type AttemptEvidenceArtifactKind = "screenshot_png" | "structured_json";
export type GradePublicationStatus = "pending" | "published" | "failed";
export type AuditActorType = "user" | "system" | "platform";
export type AuditEventStatus = "accepted" | "succeeded" | "failed";
export const ACCESSIBILITY_REVIEW_STATUSES = [
  "pass",
  "fail",
  "not_applicable",
] as const;
export type AccessibilityReviewStatus =
  (typeof ACCESSIBILITY_REVIEW_STATUSES)[number];

export interface AccessibilityReview {
  keyboard: AccessibilityReviewStatus;
  focusVisible: AccessibilityReviewStatus;
  focusNotObscured: AccessibilityReviewStatus;
  structure: AccessibilityReviewStatus;
  contrast: AccessibilityReviewStatus;
  reducedMotion: AccessibilityReviewStatus;
  equivalentAlternatives: AccessibilityReviewStatus;
  failureNotes: string | null;
  exceptionNote: string | null;
}

export const ACCESSIBILITY_REVIEW_FIELDS = [
  {
    key: "keyboard",
    formName: "accessibilityKeyboard",
    label: "Keyboard use",
  },
  {
    key: "focusVisible",
    formName: "accessibilityFocusVisible",
    label: "Focus visibility",
  },
  {
    key: "focusNotObscured",
    formName: "accessibilityFocusNotObscured",
    label: "Focus not obscured",
  },
  {
    key: "structure",
    formName: "accessibilityStructure",
    label: "Structure and semantics",
  },
  {
    key: "contrast",
    formName: "accessibilityContrast",
    label: "Contrast",
  },
  {
    key: "reducedMotion",
    formName: "accessibilityReducedMotion",
    label: "Reduced motion",
  },
  {
    key: "equivalentAlternatives",
    formName: "accessibilityEquivalentAlternatives",
    label: "Equivalent interaction alternatives",
  },
] as const satisfies ReadonlyArray<{
  key: keyof Omit<AccessibilityReview, "failureNotes" | "exceptionNote">;
  formName: string;
  label: string;
}>;

export type AccessibilityReviewCriterionKey =
  (typeof ACCESSIBILITY_REVIEW_FIELDS)[number]["key"];

const ACCESSIBILITY_REVIEW_STATUS_SET = new Set<string>(
  ACCESSIBILITY_REVIEW_STATUSES,
);

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

export interface ReviewedRuntimeContract {
  appId: string;
  packageVersion: string;
  artifactDigest: string;
  entrypoint: string;
  capabilities: Capability[];
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
  accessibilityReview: AccessibilityReview | null;
  reviewedAt: string | null;
  validationIssues: ValidationIssue[];
  manifestJson: Record<string, unknown>;
  artifact: PackageArtifactRecord;
  runtimeContract: ReviewedRuntimeContract;
  runtimeContractSignature: string;
  importedAt: string;
}

export interface ReviewedResource {
  packageVersionId: number;
  appId: string;
  packageVersion: string;
  packageTitle: string;
  packageDescription: string | null;
  reviewedAt: string;
  contentPath: string;
}

export interface ReviewedResourceSelection {
  packageVersionId: number;
  appId: string;
  packageVersion: string;
  packageTitle: string;
  contentPath: string;
}

export interface DeploymentRecord {
  id: number;
  slug: string;
  label: string;
  appId: string;
  enabledPackageVersionId: number | null;
  enabledPackageVersion: string | null;
  lmsType: PersistedDeploymentLmsType;
  binding: DeploymentBinding | null;
  ltiProfileOverride: LtiProfileId | null;
  updatedAt: string;
}

export interface LanternLtiProfileSettingsRecord {
  defaultLtiProfile: LtiProfileId;
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
  userDisplayName: string | null;
  userEmail: string | null;
  userLogin: string | null;
  userRole: UserRole;
  contextId: string;
  resourceLinkId: string;
  activityId: string;
  status: AttemptStatus;
  completionState: AttemptCompletionState | null;
  localState: AttemptLocalState;
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

export interface AttemptEvidenceArtifactRecord {
  artifactId: string;
  attemptId: string;
  sequence: number;
  kind: AttemptEvidenceArtifactKind;
  contentType: string;
  fileName: string;
  storageKey: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
}

export interface LineItemBindingRecord {
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
  platformUserId: string;
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

export interface DeepLinkingResourceOption {
  packageVersionId: number;
  appId: string;
  packageVersion: string;
  packageTitle: string;
  ownerId: string;
  installScope: InstallScope;
  approvalStatus: "approved";
  reviewedAt: string | null;
  activityId: string;
  contentPath: string;
  contentTitle: string | null;
}

export interface DeepLinkingResourceSelection {
  packageVersionId: number;
  packageVersion: string;
  packageTitle: string;
  activityId: string;
  contentPath: string;
  contentTitle: string | null;
}

export interface ReviewedPlacementRecord {
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
  createdAt: string;
  boundAt: string | null;
}

export type PlacementAuditStatus =
  | "awaiting_canvas_binding"
  | "bound_no_preview"
  | "bound_with_preview"
  | "reviewed";

export function parseAccessibilityReview(value: unknown): AccessibilityReview {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Accessibility review must include structured criteria.");
  }

  const review = value as Record<string, unknown>;

  return {
    keyboard: parseAccessibilityReviewStatus(review, "keyboard"),
    focusVisible: parseAccessibilityReviewStatus(review, "focusVisible"),
    focusNotObscured: parseAccessibilityReviewStatus(
      review,
      "focusNotObscured",
    ),
    structure: parseAccessibilityReviewStatus(review, "structure"),
    contrast: parseAccessibilityReviewStatus(review, "contrast"),
    reducedMotion: parseAccessibilityReviewStatus(review, "reducedMotion"),
    equivalentAlternatives: parseAccessibilityReviewStatus(
      review,
      "equivalentAlternatives",
    ),
    failureNotes: parseAccessibilityReviewText(review, "failureNotes"),
    exceptionNote: parseAccessibilityReviewText(review, "exceptionNote"),
  };
}

function parseAccessibilityReviewStatus(
  review: Record<string, unknown>,
  field: AccessibilityReviewCriterionKey,
): AccessibilityReviewStatus {
  const value = review[field];

  if (
    typeof value !== "string" || !ACCESSIBILITY_REVIEW_STATUS_SET.has(value)
  ) {
    throw new Error(
      `Accessibility review field "${field}" must be pass, fail, or not_applicable.`,
    );
  }

  return value as AccessibilityReviewStatus;
}

function parseAccessibilityReviewText(
  review: Record<string, unknown>,
  field: "failureNotes" | "exceptionNote",
): string | null {
  const value = review[field];

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new TypeError(`Accessibility review field "${field}" must be text.`);
  }

  return value;
}

export interface PlacementAuditEvidenceSummary {
  deepLinkingRequestCount: number;
  placementEventCount: number;
  reviewerEventCount: number;
  latestOccurredAt: string | null;
}

export interface PlacementAuditSnapshot {
  placement: ReviewedPlacementRecord;
  status: PlacementAuditStatus;
  latestPreviewSessionId: string | null;
  latestPreviewOccurredAt: string | null;
  previewEvidenceCount: number;
  evidenceSummary: PlacementAuditEvidenceSummary;
}

export interface PreviewFixtureData {
  launch: {
    user_role: UserRole;
    course_id: string;
    assignment_id: string | null;
    activity_id: string;
  };
  attempt_id: string;
  local_state: AttemptLocalState;
}

export type AuthoringDraftSavedSource = "manual" | "ai";

export interface AuthoringDraftFileRecord {
  draftId: string;
  relativePath: string;
  contents: string;
  sequence: number;
}

export interface AuthoringDraftRecord {
  draftId: string;
  packageVersionId: number;
  appId: string;
  packageVersion: string;
  packageTitle: string;
  authoringKind: "browser_autograder";
  authoringPaths: string[];
  baseSnapshotRoot: string;
  latestPromptText: string | null;
  latestGenerationNotes: string[];
  savedSource: AuthoringDraftSavedSource;
  lastPreviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  files: AuthoringDraftFileRecord[];
}

export type PreviewSessionOrigin =
  | "adminTestLaunch"
  | "deepLinkingAuthoring"
  | "adminAuthoringDraft";

export interface PreviewSessionRecord {
  sessionId: string;
  packageVersionId: number;
  appId: string;
  packageVersion: string;
  packageTitle: string;
  origin: PreviewSessionOrigin;
  contentPath: string;
  deepLinkingSessionId: string | null;
  capabilities: Capability[];
  snapshotRoot: string;
  entrypointPath: string;
  launch: {
    userId: string;
    userRole: UserRole;
    courseId: string;
    assignmentId: string | null;
    activityId: string;
  };
  fakeAttemptId: string;
  fakeScoreMaximum: number;
  fixtureData: PreviewFixtureData;
  createdAt: string;
}

export interface PreviewEvidenceRecord {
  id: number;
  previewSessionId: string;
  sequence: number;
  eventType: string;
  capability: Capability | null;
  summary: string;
  detail: Record<string, unknown>;
  occurredAt: string;
}
