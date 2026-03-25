import { assertStringIncludes } from "@std/assert";
import { renderPreviewPage } from "./preview_page.ts";
import {
  buildPackageVersionRecord,
  buildPreviewEvidenceRecord,
  buildPreviewSessionRecord,
} from "../test_helpers/package_review.ts";

Deno.test("renderPreviewPage shows reviewed package identity and fixture-backed launch context", () => {
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
    previewSession,
    previewEvidence: [],
  });

  assertStringIncludes(body, "Governed preview launch");
  assertStringIncludes(body, "Chapter 4 Asteroids");
  assertStringIncludes(body, "Version 0.3.0");
  assertStringIncludes(body, "preview-course-42");
  assertStringIncludes(body, "preview-activity-9");
  assertStringIncludes(
    body,
    'action="/admin/packages/chapter-4-asteroids/versions/0.3.0/preview"',
  );
  assertStringIncludes(body, "Launch preview runtime");
  assertStringIncludes(body, "Declared capabilities");
  assertStringIncludes(body, "Preview capability log");
  assertStringIncludes(
    body,
    "No preview activity has been recorded yet. Launch the preview runtime to capture governed capability evidence.",
  );
});

Deno.test("renderPreviewPage shows durable preview activity evidence in capability log timeline", () => {
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
      summary: "Launched reviewed preview runtime session.",
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
      summary: "Finalized preview attempt with fake scoring.",
      detail: {
        scoreGiven: 0,
        scoreMaximum: 100,
      },
    }),
  ];

  const body = renderPreviewPage({
    packageVersion,
    previewSession,
    previewEvidence,
  });

  assertStringIncludes(body, "Latest preview session: preview-session-123");
  assertStringIncludes(body, "preview.launch");
  assertStringIncludes(body, "preview.finalize");
  assertStringIncludes(body, "finalize_attempt");
  assertStringIncludes(body, "Finalized preview attempt with fake scoring.");
});
