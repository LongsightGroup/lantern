import { assertEquals, assertRejects } from "@std/assert";
import {
  buildImportedPackageVersion,
  withRepositoryTestDatabase,
} from "./repository_test_support.ts";

Deno.test("repository returns placement audit snapshots with reviewed placement identity, Canvas context, and deterministic status", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (
        await repository.registerPackageVersion(
          await buildImportedPackageVersion({ version: "0.6.0" }),
        )
      ).id,
      reviewNotes: "Approved for placement audit snapshots.",
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: "chapter-4-asteroids-pilot",
      label: "Chapter 4 Asteroids Pilot Deployment",
      appId: "chapter-4-asteroids",
      packageVersionId: approvedRecord.id,
    });

    await repository.createReviewedPlacement({
      placementId: "placement-audit-123",
      deploymentRecordId: deployment.id,
      deploymentSlug: deployment.slug,
      appId: deployment.appId,
      contextId: "course-42",
      contextTitle: "Physics 101",
      packageVersionId: approvedRecord.id,
      packageVersion: approvedRecord.version,
      packageTitle: approvedRecord.title,
      activityId: "/content/bonus.json",
      contentPath: "/content/bonus.json",
      contentTitle: "Bonus Activity",
      createdByUserId: "canvas-user-123",
      resourceLinkId: "resource-link-123",
      createdAt: "2026-03-25T02:00:00Z",
      boundAt: "2026-03-25T02:01:00Z",
    });
    await repository.createPreviewSession({
      sessionId: "preview-session-placement-audit",
      packageVersionId: approvedRecord.id,
      appId: approvedRecord.appId,
      packageVersion: approvedRecord.version,
      packageTitle: approvedRecord.title,
      capabilities: approvedRecord.capabilities,
      snapshotRoot: approvedRecord.artifact.snapshotRoot,
      entrypointPath: approvedRecord.artifact.entrypointPath,
      launch: {
        userId: "preview-user-123",
        userRole: "instructor",
        courseId: "preview-course-42",
        assignmentId: null,
        activityId: "preview-activity-9",
      },
      fakeAttemptId: "preview-attempt-123",
      fakeScoreMaximum: 100,
      fixtureData: {
        launch: {
          user_role: "instructor",
          course_id: "preview-course-42",
          assignment_id: null,
          activity_id: "preview-activity-9",
        },
        attempt_id: "preview-attempt-123",
        local_state: null,
      },
      createdAt: "2026-03-25T02:02:00Z",
    });
    await repository.appendPreviewEvidence({
      previewSessionId: "preview-session-placement-audit",
      eventType: "preview.launch",
      capability: null,
      summary: "Preview launched for placement audit context.",
      detail: { placementId: "placement-audit-123" },
      occurredAt: "2026-03-25T02:03:00Z",
    });
    await repository.recordAuditEvent({
      eventType: "deep_linking.request.accepted",
      actorType: "platform",
      actorId: "canvas-user-123",
      deploymentRecordId: deployment.id,
      packageVersionId: approvedRecord.id,
      attemptId: null,
      lineItemBindingId: null,
      status: "accepted",
      summary: "Accepted Deep Linking request.",
      detail: { contextId: "course-42" },
      occurredAt: "2026-03-25T02:00:30Z",
    });
    await repository.recordAuditEvent({
      eventType: "deep_linking.placement.created",
      actorType: "platform",
      actorId: "canvas-user-123",
      deploymentRecordId: deployment.id,
      packageVersionId: approvedRecord.id,
      attemptId: null,
      lineItemBindingId: null,
      status: "succeeded",
      summary: "Created reviewed placement.",
      detail: { placementId: "placement-audit-123" },
      occurredAt: "2026-03-25T02:01:30Z",
    });
    await repository.recordAuditEvent({
      eventType: "reviewer.preview_viewed",
      actorType: "user",
      actorId: "reviewer-123",
      deploymentRecordId: deployment.id,
      packageVersionId: approvedRecord.id,
      attemptId: null,
      lineItemBindingId: null,
      status: "succeeded",
      summary: "Reviewer opened preview evidence.",
      detail: { placementId: "placement-audit-123" },
      occurredAt: "2026-03-25T02:04:00Z",
    });

    const snapshot = await repository.requirePlacementAuditSnapshotById(
      "placement-audit-123",
    );

    assertEquals(snapshot.placement.contentPath, "/content/bonus.json");
    assertEquals(snapshot.placement.packageVersion, "0.6.0");
    assertEquals(snapshot.placement.contextId, "course-42");
    assertEquals(snapshot.placement.contextTitle, "Physics 101");
    assertEquals(snapshot.status, "reviewed");
    assertEquals(snapshot.previewEvidenceCount, 1);
    assertEquals(snapshot.evidenceSummary.deepLinkingRequestCount, 1);
    assertEquals(snapshot.evidenceSummary.placementEventCount, 1);
    assertEquals(snapshot.evidenceSummary.reviewerEventCount, 1);
  });
});

Deno.test("repository placement audit snapshots remain stable with and without preview evidence", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (
        await repository.registerPackageVersion(
          await buildImportedPackageVersion({ version: "0.7.0" }),
        )
      ).id,
      reviewNotes: "Approved for preview/no-preview snapshot status.",
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: "chapter-4-asteroids-pilot",
      label: "Chapter 4 Asteroids Pilot Deployment",
      appId: "chapter-4-asteroids",
      packageVersionId: approvedRecord.id,
    });

    await repository.createReviewedPlacement({
      placementId: "placement-stable-123",
      deploymentRecordId: deployment.id,
      deploymentSlug: deployment.slug,
      appId: deployment.appId,
      contextId: "course-42",
      contextTitle: "Physics 101",
      packageVersionId: approvedRecord.id,
      packageVersion: approvedRecord.version,
      packageTitle: approvedRecord.title,
      activityId: "/content/bonus.json",
      contentPath: "/content/bonus.json",
      contentTitle: "Bonus Activity",
      createdByUserId: "canvas-user-123",
      resourceLinkId: "resource-link-123",
      createdAt: "2026-03-25T03:00:00Z",
      boundAt: "2026-03-25T03:01:00Z",
    });

    const withoutPreview = await repository.requirePlacementAuditSnapshotById(
      "placement-stable-123",
    );
    assertEquals(withoutPreview.status, "bound_no_preview");
    assertEquals(withoutPreview.previewEvidenceCount, 0);
    assertEquals(withoutPreview.latestPreviewSessionId, null);

    await repository.createPreviewSession({
      sessionId: "preview-session-stable",
      packageVersionId: approvedRecord.id,
      appId: approvedRecord.appId,
      packageVersion: approvedRecord.version,
      packageTitle: approvedRecord.title,
      capabilities: approvedRecord.capabilities,
      snapshotRoot: approvedRecord.artifact.snapshotRoot,
      entrypointPath: approvedRecord.artifact.entrypointPath,
      launch: {
        userId: "preview-user-123",
        userRole: "instructor",
        courseId: "preview-course-42",
        assignmentId: null,
        activityId: "preview-activity-9",
      },
      fakeAttemptId: "preview-attempt-stable",
      fakeScoreMaximum: 100,
      fixtureData: {
        launch: {
          user_role: "instructor",
          course_id: "preview-course-42",
          assignment_id: null,
          activity_id: "preview-activity-9",
        },
        attempt_id: "preview-attempt-stable",
        local_state: null,
      },
      createdAt: "2026-03-25T03:02:00Z",
    });
    await repository.appendPreviewEvidence({
      previewSessionId: "preview-session-stable",
      eventType: "preview.launch",
      capability: null,
      summary: "Preview launched for stable status test.",
      detail: { placementId: "placement-stable-123" },
      occurredAt: "2026-03-25T03:03:00Z",
    });

    const withPreview = await repository.requirePlacementAuditSnapshotById(
      "placement-stable-123",
    );
    assertEquals(withPreview.status, "bound_with_preview");
    assertEquals(withPreview.previewEvidenceCount, 1);
    assertEquals(withPreview.latestPreviewSessionId, "preview-session-stable");
  });
});

Deno.test("repository placement audit snapshot fails clearly for unknown placement ids", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    await assertRejects(
      () => repository.requirePlacementAuditSnapshotById("placement-missing"),
      Error,
      "Reviewed placement placement-missing was not found.",
    );
  });
});
