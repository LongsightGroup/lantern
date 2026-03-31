import { assertStringIncludes } from "@std/assert";
import { renderPreviewPage } from "./preview_page.ts";
import {
  buildPackageVersionRecord,
  buildPreviewEvidenceRecord,
  buildPreviewSessionRecord,
} from "../test_helpers/package_review.ts";

Deno.test("renderPreviewPage shows saved defaults, editable launch fields, and empty test activity", () => {
  const packageVersion = buildPackageVersionRecord({
    id: 11,
    appId: "chapter-4-asteroids",
    version: "0.3.0",
    title: "Chapter 4 Asteroids",
    approvalStatus: "approved",
    reviewedAt: "2026-03-25T00:00:00Z",
  });
  const previewSession = buildPreviewSessionRecord({
    packageVersionId: packageVersion.id,
    appId: packageVersion.appId,
    packageVersion: packageVersion.version,
    packageTitle: packageVersion.title,
    launch: {
      userId: "preview-user-123",
      userRole: "instructor",
      courseId: "preview-course-42",
      assignmentId: "preview-assignment-7",
      activityId: "preview-activity-9",
    },
  });

  const body = renderPreviewPage({
    packageVersion,
    savedDefaults: previewSession,
    latestSession: null,
    formValues: {
      userRole: "learner",
      courseId: "course-run-7",
      assignmentId: "",
      activityId: "activity-run-9",
    },
    previewEvidence: [],
  });

  assertStringIncludes(body, "Test Launch");
  assertStringIncludes(body, "Chapter 4 Asteroids");
  assertStringIncludes(body, "Version 0.3.0");
  assertStringIncludes(body, "preview-course-42");
  assertStringIncludes(body, "preview-activity-9");
  assertStringIncludes(body, 'name="userRole"');
  assertStringIncludes(body, 'value="course-run-7"');
  assertStringIncludes(body, "Student");
  assertStringIncludes(
    body,
    'action="/admin/packages/chapter-4-asteroids/versions/0.3.0/preview"',
  );
  assertStringIncludes(body, "Start test launch");
  assertStringIncludes(body, "What this test allows");
  assertStringIncludes(body, "Recent test activity");
  assertStringIncludes(
    body,
    "No test activity has been recorded yet. Start a test launch to open the app.",
  );
});

Deno.test("renderPreviewPage shows durable test activity evidence in capability log timeline", () => {
  const packageVersion = buildPackageVersionRecord({
    id: 11,
    appId: "chapter-4-asteroids",
    version: "0.3.0",
    title: "Chapter 4 Asteroids",
    approvalStatus: "approved",
    reviewedAt: "2026-03-25T00:00:00Z",
  });
  const previewSession = buildPreviewSessionRecord({
    sessionId: "preview-session-123",
    packageVersionId: packageVersion.id,
    appId: packageVersion.appId,
    packageVersion: packageVersion.version,
    packageTitle: packageVersion.title,
  });
  const previewEvidence = [
    buildPreviewEvidenceRecord({
      previewSessionId: previewSession.sessionId,
      eventType: "preview.launch",
      summary: "Started a test launch in Lantern's runtime.",
      detail: {
        runtimeSessionId: "preview-runtime-123",
      },
    }),
    buildPreviewEvidenceRecord({
      id: 2,
      sequence: 2,
      previewSessionId: previewSession.sessionId,
      eventType: "preview.finalize",
      capability: "finalize_attempt",
      summary:
        "Finished the test attempt with simulated scoring and no LMS writes.",
      detail: {
        scoreGiven: 0,
        scoreMaximum: 100,
      },
    }),
  ];

  const body = renderPreviewPage({
    packageVersion,
    savedDefaults: previewSession,
    latestSession: previewSession,
    formValues: {
      userRole: previewSession.launch.userRole,
      courseId: previewSession.launch.courseId,
      assignmentId: previewSession.launch.assignmentId ?? "",
      activityId: previewSession.launch.activityId,
    },
    previewEvidence,
  });

  assertStringIncludes(body, "Latest session");
  assertStringIncludes(body, "preview-session-123");
  assertStringIncludes(body, "Started test launch");
  assertStringIncludes(body, "Finished test attempt");
  assertStringIncludes(body, "preview.launch");
  assertStringIncludes(body, "preview.finalize");
  assertStringIncludes(body, "finalize_attempt");
  assertStringIncludes(
    body,
    "Finished the test attempt with simulated scoring and no LMS writes.",
  );
});
