import type { Pool } from "@db/postgres";
import type {
  PreviewEvidenceRecord,
  PreviewSessionRecord,
  ReviewedPlacementRecord,
} from "../package_review/types.ts";

type TestClient = Awaited<ReturnType<Pool["connect"]>>;

export async function insertReviewedPlacement(
  client: TestClient,
  record: ReviewedPlacementRecord,
): Promise<void> {
  await client.queryArray({
    text:
      "INSERT INTO reviewed_placements (placement_id, deployment_record_id, deployment_slug, app_id, context_id, context_title, package_version_id, package_version, package_title, activity_id, content_path, content_title, created_by_user_id, resource_link_id, created_at, bound_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
    args: [
      record.placementId,
      record.deploymentRecordId,
      record.deploymentSlug,
      record.appId,
      record.contextId,
      record.contextTitle,
      record.packageVersionId,
      record.packageVersion,
      record.packageTitle,
      record.activityId,
      record.contentPath,
      record.contentTitle,
      record.createdByUserId,
      record.resourceLinkId,
      record.createdAt,
      record.boundAt,
    ],
  });
}

export async function insertPreviewSession(
  client: TestClient,
  record: PreviewSessionRecord,
): Promise<void> {
  await client.queryArray({
    text:
      "INSERT INTO preview_sessions (session_id, package_version_id, app_id, package_version, package_title, capabilities, snapshot_root, entrypoint_path, launch_user_id, launch_user_role, launch_course_id, launch_assignment_id, launch_activity_id, fake_attempt_id, fake_score_maximum, fixture_data, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17)",
    args: [
      record.sessionId,
      record.packageVersionId,
      record.appId,
      record.packageVersion,
      record.packageTitle,
      record.capabilities,
      record.snapshotRoot,
      record.entrypointPath,
      record.launch.userId,
      record.launch.userRole,
      record.launch.courseId,
      record.launch.assignmentId,
      record.launch.activityId,
      record.fakeAttemptId,
      record.fakeScoreMaximum,
      JSON.stringify(record.fixtureData),
      record.createdAt,
    ],
  });
}

export async function insertPreviewEvidence(
  client: TestClient,
  record: PreviewEvidenceRecord,
): Promise<void> {
  await client.queryArray({
    text:
      "INSERT INTO preview_evidence (preview_session_id, sequence, event_type, capability, summary, detail, occurred_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)",
    args: [
      record.previewSessionId,
      record.sequence,
      record.eventType,
      record.capability,
      record.summary,
      JSON.stringify(record.detail),
      record.occurredAt,
    ],
  });
}
