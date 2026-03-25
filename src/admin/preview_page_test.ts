import { assertStringIncludes } from "@std/assert";
import { renderPreviewPage } from "./preview_page.ts";
import {
  buildPackageVersionRecord,
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
});
