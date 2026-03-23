import { assertEquals, assertStringIncludes } from "@std/assert";
import { renderPackageDetailPage } from "../admin/package_detail.ts";
import { buildPackageVersionRecord } from "../test_helpers/package_review.ts";

Deno.test("renderPackageDetailPage includes approve and reject controls for pending versions", () => {
  const pendingVersion = buildPackageVersionRecord();
  const body = renderPackageDetailPage({
    packageVersion: pendingVersion,
    history: [pendingVersion],
  });

  assertStringIncludes(body, "Approve or reject this exact version once.");
  assertStringIncludes(body, "/admin/packages/1/approve");
  assertStringIncludes(body, "/admin/packages/1/reject");
  assertStringIncludes(body, "Review notes (optional)");
});

Deno.test("renderPackageDetailPage shows immutable decision history after review", () => {
  const rejectedVersion = buildPackageVersionRecord({
    approvalStatus: "rejected",
    reviewNotes: "Needs a corrected scoring contract.",
    reviewedAt: "2026-03-23T18:05:00Z",
  });
  const body = renderPackageDetailPage({
    packageVersion: rejectedVersion,
    history: [rejectedVersion],
  });

  assertStringIncludes(body, "Decision record");
  assertStringIncludes(body, "Rejected");
  assertStringIncludes(body, "Needs a corrected scoring contract.");
  assertEquals(body.includes("/admin/packages/1/approve"), false);
});
