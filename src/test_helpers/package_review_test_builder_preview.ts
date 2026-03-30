import type {
  DeepLinkingResourceOption,
  DeepLinkingResourceSelection,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
  ReviewedPlacementRecord,
} from "../package_review/types.ts";
import {
  DEFAULT_PHASE4_AT,
  DEFAULT_REVIEWED_AT,
} from "./package_review_test_defaults.ts";

export function buildDeepLinkingResourceOption(
  overrides: Partial<DeepLinkingResourceOption> = {},
): DeepLinkingResourceOption {
  return {
    packageVersionId: overrides.packageVersionId ?? 1,
    appId: overrides.appId ?? "chapter-4-asteroids",
    packageVersion: overrides.packageVersion ?? "0.1.0",
    packageTitle: overrides.packageTitle ?? "Chapter 4 Asteroids",
    ownerId: overrides.ownerId ?? "instructor_123",
    installScope: overrides.installScope ?? "assignment",
    approvalStatus: "approved",
    reviewedAt: overrides.reviewedAt ?? DEFAULT_REVIEWED_AT,
    activityId: overrides.activityId ?? "/content/activity.json",
    contentPath: overrides.contentPath ?? "/content/activity.json",
    contentTitle: overrides.contentTitle ?? "Activity",
  };
}

export function buildDeepLinkingResourceSelection(
  overrides: Partial<DeepLinkingResourceSelection> = {},
): DeepLinkingResourceSelection {
  return {
    packageVersionId: overrides.packageVersionId ?? 1,
    packageVersion: overrides.packageVersion ?? "0.1.0",
    packageTitle: overrides.packageTitle ?? "Chapter 4 Asteroids",
    activityId: overrides.activityId ?? "/content/activity.json",
    contentPath: overrides.contentPath ?? "/content/activity.json",
    contentTitle: overrides.contentTitle ?? "Activity",
  };
}

export function buildReviewedPlacementRecord(
  overrides: Partial<ReviewedPlacementRecord> = {},
): ReviewedPlacementRecord {
  return {
    placementId: overrides.placementId ?? "placement-123",
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    deploymentSlug: overrides.deploymentSlug ?? "chapter-4-asteroids-pilot",
    appId: overrides.appId ?? "chapter-4-asteroids",
    contextId: overrides.contextId ?? "course-42",
    contextTitle: overrides.contextTitle ?? "Physics 101",
    packageVersionId: overrides.packageVersionId ?? 1,
    packageVersion: overrides.packageVersion ?? "0.1.0",
    packageTitle: overrides.packageTitle ?? "Chapter 4 Asteroids",
    activityId: overrides.activityId ?? "/content/activity.json",
    contentPath: overrides.contentPath ?? "/content/activity.json",
    contentTitle: overrides.contentTitle ?? "Activity",
    createdByUserId: overrides.createdByUserId ?? "canvas-user-123",
    resourceLinkId: overrides.resourceLinkId ?? null,
    createdAt: overrides.createdAt ?? DEFAULT_PHASE4_AT,
    boundAt: overrides.boundAt ?? null,
  };
}

export function buildPreviewSessionRecord(
  overrides: Partial<PreviewSessionRecord> = {},
): PreviewSessionRecord {
  return {
    sessionId: overrides.sessionId ?? "preview-session-123",
    packageVersionId: overrides.packageVersionId ?? 1,
    appId: overrides.appId ?? "chapter-4-asteroids",
    packageVersion: overrides.packageVersion ?? "0.1.0",
    packageTitle: overrides.packageTitle ?? "Chapter 4 Asteroids",
    capabilities: overrides.capabilities ?? [
      "read_launch_context",
      "read_activity_content",
      "submit_attempt_event",
      "finalize_attempt",
    ],
    snapshotRoot: overrides.snapshotRoot ??
      "var/packages/chapter-4-asteroids/0.1.0",
    entrypointPath: overrides.entrypointPath ??
      "var/packages/chapter-4-asteroids/0.1.0/dist/index.html",
    launch: overrides.launch ?? {
      userId: "preview-user-123",
      userRole: "instructor",
      courseId: "preview-course-42",
      assignmentId: "preview-assignment-7",
      activityId: "preview-activity-9",
    },
    fakeAttemptId: overrides.fakeAttemptId ?? "preview-attempt-123",
    fakeScoreMaximum: overrides.fakeScoreMaximum ?? 100,
    fixtureData: overrides.fixtureData ?? {
      launch: {
        user_role: "instructor",
        course_id: "preview-course-42",
        assignment_id: "preview-assignment-7",
        activity_id: "preview-activity-9",
      },
      attempt_id: "preview-attempt-123",
      local_state: null,
    },
    createdAt: overrides.createdAt ?? DEFAULT_PHASE4_AT,
  };
}

export function buildPreviewEvidenceRecord(
  overrides: Partial<PreviewEvidenceRecord> = {},
): PreviewEvidenceRecord {
  return {
    id: overrides.id ?? 1,
    previewSessionId: overrides.previewSessionId ?? "preview-session-123",
    sequence: overrides.sequence ?? 1,
    eventType: overrides.eventType ?? "preview.launch",
    capability: overrides.capability ?? null,
    summary: overrides.summary ?? "Preview session launched.",
    detail: overrides.detail ?? {
      route: "/admin/packages/chapter-4-asteroids/versions/0.1.0/preview",
    },
    occurredAt: overrides.occurredAt ?? DEFAULT_PHASE4_AT,
  };
}
