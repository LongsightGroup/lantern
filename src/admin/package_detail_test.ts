import { assertEquals, assertStringIncludes } from "@std/assert";
import { renderPackageDetailPage } from "./package_detail.ts";
import { buildPackageVersionRecord } from "../test_helpers/package_review.ts";

Deno.test("renderPackageDetailPage shows status, exact version, owner, and access details above the fold", () => {
  const pendingVersion = buildPackageVersionRecord();
  const body = renderPackageDetailPage({
    packageVersion: pendingVersion,
    history: [pendingVersion],
  });

  assertStringIncludes(body, "Pending review");
  assertStringIncludes(body, "Version 0.1.0");
  assertStringIncludes(body, "instructor_123");
  assertStringIncludes(body, "What this app can access");
  assertStringIncludes(body, "Finish attempt");
  assertStringIncludes(body, "Automatic scoring");
  assertStringIncludes(body, "Show manifest JSON");
  assertStringIncludes(body, "capability-chip-basic");
  assertStringIncludes(body, "capability-chip-flagged");
});

Deno.test("renderPackageDetailPage explains the approval decision for higher-access actions and saved file details", () => {
  const reviewedVersion = buildPackageVersionRecord({
    approvalStatus: "approved",
    reviewNotes: "Ready for the pilot deployment.",
    reviewedAt: "2026-03-23T18:05:00Z",
  });
  const body = renderPackageDetailPage({
    packageVersion: reviewedVersion,
    history: [reviewedVersion],
  });

  assertStringIncludes(body, "Review before approval");
  assertStringIncludes(
    body,
    "Approve this version only if these actions match what you expect the app to do.",
  );
  assertStringIncludes(
    body,
    "Lantern will keep this version from going live, and you can leave the current approved version in place until a safer update is ready.",
  );
  assertStringIncludes(body, "Finish attempt");
  assertStringIncludes(body, "Stores learner data");
  assertStringIncludes(body, "callout-review");
  assertStringIncludes(body, "capability-risk-chip");
  assertStringIncludes(body, "Saved files");
  assertStringIncludes(body, "Ready for the pilot deployment.");
  assertEquals(body.includes("/admin/packages/1/approve"), false);
});
