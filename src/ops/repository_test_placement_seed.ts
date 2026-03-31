import type { Pool } from "@db/postgres";
import {
  buildAuditEventRecord,
  buildPackageVersionRecord,
  buildPreviewEvidenceRecord,
  buildPreviewSessionRecord,
  buildReviewedPlacementRecord,
} from "../test_helpers/package_review.ts";
import { buildDeploymentBinding } from "../test_helpers/lti.ts";
import {
  insertAuditEvent,
  insertDeployment,
  insertPackageVersion,
} from "./repository_test_core_support.ts";
import {
  insertPreviewEvidence,
  insertPreviewSession,
  insertReviewedPlacement,
} from "./repository_test_preview_support.ts";

export async function seedPlacementAuditSnapshotFixtures(
  pool: Pool,
): Promise<void> {
  const packageVersion = buildPackageVersionRecord({
    id: 1,
    version: "0.8.0",
    title: "Chapter 4 Asteroids",
    description: "Placement audit fixture",
    entrypoint: "/dist/index.html",
    approvalStatus: "approved",
    reviewNotes: "Approved for ops placement audit fixture.",
    reviewedAt: "2026-03-25T04:00:00Z",
    validationIssues: [],
    artifact: {
      snapshotRoot: "var/packages/chapter-4-asteroids/0.8.0",
      manifestPath: "var/packages/chapter-4-asteroids/0.8.0/manifest.json",
      entrypointPath: "var/packages/chapter-4-asteroids/0.8.0/dist/index.html",
      digest: "sha256:fixture-0-8-0",
    },
    importedAt: "2026-03-25T03:55:00Z",
  });
  const client = await pool.connect();

  try {
    await client.queryArray("BEGIN");
    await insertPackageVersion(client, packageVersion);
    await insertDeployment(
      client,
      packageVersion.appId,
      packageVersion.id,
      buildDeploymentBinding(),
    );
    await insertReviewedPlacement(
      client,
      buildReviewedPlacementRecord({
        placementId: "placement-ops-123",
        packageVersion: "0.8.0",
        packageTitle: "Chapter 4 Asteroids",
        activityId: "/content/bonus.json",
        contentPath: "/content/bonus.json",
        contentTitle: "Bonus Activity",
        createdAt: "2026-03-25T04:02:00Z",
        boundAt: "2026-03-25T04:03:00Z",
      }),
    );
    await insertPreviewSession(
      client,
      buildPreviewSessionRecord({
        sessionId: "preview-session-ops-123",
        packageVersion: "0.8.0",
        packageTitle: "Chapter 4 Asteroids",
        capabilities: ["read_launch_context"],
        snapshotRoot: "var/packages/chapter-4-asteroids/0.8.0",
        entrypointPath:
          "var/packages/chapter-4-asteroids/0.8.0/dist/index.html",
        launch: {
          userId: "preview-user-123",
          userRole: "instructor",
          courseId: "course-42",
          assignmentId: null,
          activityId: "preview-activity-9",
        },
        fixtureData: {
          launch: {
            user_role: "instructor",
            course_id: "course-42",
            assignment_id: null,
            activity_id: "preview-activity-9",
          },
          attempt_id: "preview-attempt-123",
          local_state: null,
        },
        createdAt: "2026-03-25T04:04:00Z",
      }),
    );
    await insertPreviewEvidence(
      client,
      buildPreviewEvidenceRecord({
        previewSessionId: "preview-session-ops-123",
        eventType: "preview.launch",
        summary: "Preview launched for ops placement snapshot.",
        detail: { placementId: "placement-ops-123" },
        occurredAt: "2026-03-25T04:05:00Z",
      }),
    );
    await insertAuditEvent(
      client,
      buildAuditEventRecord({
        eventType: "reviewer.preview_viewed",
        actorType: "user",
        actorId: "reviewer-123",
        packageVersionId: 1,
        attemptId: null,
        lineItemBindingId: null,
        status: "succeeded",
        summary: "Reviewer opened placement evidence.",
        detail: { placementId: "placement-ops-123" },
        occurredAt: "2026-03-25T04:06:00Z",
      }),
    );
    await client.queryArray("COMMIT");
  } catch (error) {
    await client.queryArray("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
