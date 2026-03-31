import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import { EXAMPLE_SNAPSHOT_ROOT } from "./app_test_support.ts";
import {
  buildPackageVersionRecord,
  buildPreviewSessionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";

Deno.test("test-launch activity log shows durable launch, content-read, attempt, and finalize evidence after reload", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 46,
        appId: "chapter-4-asteroids",
        version: "0.1.0",
        approvalStatus: "approved",
        reviewedAt: "2026-03-25T01:10:00Z",
        manifestJson: {
          app_id: "chapter-4-asteroids",
          version: "0.1.0",
          title: "Chapter 4 Asteroids",
          preview: {
            fixtures_file: "/preview/fixtures.json",
            tests_file: "/preview/tests.json",
          },
        },
        artifact: {
          snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
          manifestPath: `${EXAMPLE_SNAPSHOT_ROOT}/manifest.json`,
          entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
          digest: "sha256:example-approved-preview-capability-log",
        },
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();
  formData.set("userRole", "learner");
  formData.set("courseId", "course_demo");
  formData.set("assignmentId", "assignment_demo");
  formData.set("activityId", "chapter-4-asteroids");

  const launchResponse = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/versions/0.1.0/preview",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );
  const location = launchResponse.headers.get("location") ?? "";
  const runtimeLocation = new URL(`http://localhost${location}`);
  const runtimeSessionId = runtimeLocation.pathname.split("/").at(-1) ?? "";
  const runtimeToken = runtimeLocation.searchParams.get("token") ?? "";
  const runtimeSession = await repository.getRuntimeSessionById(
    runtimeSessionId,
  );

  await app.request(
    `http://localhost/runtime/sessions/${runtimeSessionId}/content`,
    {
      headers: { Authorization: `Bearer ${runtimeToken}` },
    },
  );
  await app.request(
    `http://localhost/runtime/sessions/${runtimeSessionId}/attempt-events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtimeToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "progress",
        checkpoint: "preview-wave",
        value: 1,
        timestamp: "2026-03-25T01:12:00Z",
      }),
    },
  );
  await app.request(
    `http://localhost/runtime/sessions/${runtimeSessionId}/finalize`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtimeToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ completionState: "completed" }),
    },
  );

  const previewPageResponse = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/versions/0.1.0/preview",
  );
  const previewBody = await previewPageResponse.text();
  const auditEvents = await repository.listAuditEventsByEventType(
    "preview.launch",
  );
  const previewSessionId = String(
    auditEvents.find((event) =>
      String(event.detail.runtimeSessionId ?? "") === runtimeSessionId
    )
      ?.detail.previewSessionId ?? "",
  );
  const previewEvidence = await repository.listPreviewEvidence(
    previewSessionId,
  );

  assertEquals(launchResponse.status, 303);
  assertEquals(runtimeSession?.preview?.previewSessionId, previewSessionId);
  assertEquals(previewPageResponse.status, 200);
  assertStringIncludes(previewBody, "Recent test activity");
  assertStringIncludes(previewBody, "Started test launch");
  assertStringIncludes(previewBody, "preview.launch");
  assertStringIncludes(previewBody, "preview.content_read");
  assertStringIncludes(previewBody, "preview.attempt_event");
  assertStringIncludes(previewBody, "preview.finalize");
  assertEquals(
    previewEvidence.map((record) => record.eventType),
    [
      "preview.launch",
      "preview.content_read",
      "preview.attempt_event",
      "preview.finalize",
    ],
  );
});

Deno.test("GET /admin/packages/:appId/versions/:version/preview records a reviewer action with bounded detail", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 47,
        appId: "chapter-4-asteroids",
        version: "0.3.0",
        approvalStatus: "approved",
        reviewedAt: "2026-03-25T01:10:00Z",
        manifestJson: {
          app_id: "chapter-4-asteroids",
          version: "0.3.0",
          title: "Chapter 4 Asteroids",
          preview: {
            fixtures_file: "/preview/fixtures.json",
            tests_file: "/preview/tests.json",
          },
        },
        artifact: {
          snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
          manifestPath: `${EXAMPLE_SNAPSHOT_ROOT}/manifest.json`,
          entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
          digest: "sha256:example-approved-preview-reviewer-action",
        },
      }),
    ],
    previewSessions: [
      buildPreviewSessionRecord({
        sessionId: "preview-session-reviewer-action",
        packageVersionId: 47,
        appId: "chapter-4-asteroids",
        packageVersion: "0.3.0",
        packageTitle: "Chapter 4 Asteroids",
        capabilities: ["read_launch_context"],
        snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
        entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
        launch: {
          userId: "preview-user-123",
          userRole: "instructor",
          courseId: "preview-course-42",
          assignmentId: null,
          activityId: "preview-activity-9",
        },
        fakeAttemptId: "preview-attempt-reviewer-action",
        fakeScoreMaximum: 100,
        fixtureData: {
          launch: {
            user_role: "instructor",
            course_id: "preview-course-42",
            assignment_id: null,
            activity_id: "preview-activity-9",
          },
          attempt_id: "preview-attempt-reviewer-action",
          local_state: null,
        },
        createdAt: "2026-03-25T01:40:00Z",
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });

  const response = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/versions/0.3.0/preview",
  );
  const auditEvents = await repository.listAuditEventsByEventType(
    "reviewer.preview_viewed",
  );

  assertEquals(response.status, 200);
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.packageVersionId, 47);
  assertEquals(
    String(auditEvents[0]?.detail.previewSessionId ?? ""),
    "preview-session-reviewer-action",
  );
  assertEquals("runtimeSessionId" in (auditEvents[0]?.detail ?? {}), false);
});
