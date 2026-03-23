import { assertEquals, assertStringIncludes } from "@std/assert";
import { renderPackageDetailPage } from "./package_detail.ts";
import { buildPackageVersionRecord } from "../test_helpers/package_review.ts";

Deno.test("renderPackageDetailPage shows status, exact version, owner, and requested capabilities above the fold", () => {
  const pendingVersion = buildPackageVersionRecord();
  const body = renderPackageDetailPage({
    packageVersion: pendingVersion,
    history: [pendingVersion],
  });

  assertStringIncludes(body, "Pending review");
  assertStringIncludes(body, "Version 0.1.0");
  assertStringIncludes(body, "Owner instructor_123");
  assertStringIncludes(body, "Requested capabilities");
  assertStringIncludes(body, "Attempt finalization");
  assertStringIncludes(body, "Declarative grading");
  assertStringIncludes(body, "Open persisted raw manifest JSON");
});

Deno.test("renderPackageDetailPage surfaces plain-language risk callouts and validation evidence", () => {
  const reviewedVersion = buildPackageVersionRecord({
    approvalStatus: "approved",
    reviewNotes: "Ready for the pilot deployment.",
    reviewedAt: "2026-03-23T18:05:00Z",
  });
  const body = renderPackageDetailPage({
    packageVersion: reviewedVersion,
    history: [reviewedVersion],
  });

  assertStringIncludes(body, "Risk callouts");
  assertStringIncludes(body, "Attempt finalization");
  assertStringIncludes(body, "Saved state write");
  assertStringIncludes(body, "Artifact snapshot");
  assertStringIncludes(body, "Ready for the pilot deployment.");
  assertEquals(body.includes("/admin/packages/1/approve"), false);
});
