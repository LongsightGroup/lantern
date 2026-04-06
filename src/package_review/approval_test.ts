import { assertEquals, assertStringIncludes } from "@std/assert";
import { renderPackageDetailPage } from "../admin/package_detail.ts";
import { buildPackageVersionRecord } from "../test_helpers/package_review.ts";

Deno.test("renderPackageDetailPage includes approve, reject, and structured accessibility controls for pending versions", () => {
  const pendingVersion = buildPackageVersionRecord();
  const body = renderPackageDetailPage({
    packageVersion: pendingVersion,
    history: [pendingVersion],
  });

  assertStringIncludes(body, "Approve or reject this version.");
  assertStringIncludes(body, "/admin/packages/1/approve");
  assertStringIncludes(body, "/admin/packages/1/reject");
  assertStringIncludes(body, "Review notes (optional)");
  assertStringIncludes(body, "Keyboard use");
  assertStringIncludes(body, "Focus visibility");
  assertStringIncludes(body, "Focus not obscured");
  assertStringIncludes(body, "Structure and semantics");
  assertStringIncludes(body, "Contrast");
  assertStringIncludes(body, "Reduced motion");
  assertStringIncludes(body, "Equivalent interaction alternatives");
  assertStringIncludes(body, 'name="accessibilityKeyboard"');
  assertStringIncludes(body, 'name="accessibilityFocusVisible"');
  assertStringIncludes(body, 'name="accessibilityFocusNotObscured"');
  assertStringIncludes(body, 'name="accessibilityStructure"');
  assertStringIncludes(body, 'name="accessibilityContrast"');
  assertStringIncludes(body, 'name="accessibilityReducedMotion"');
  assertStringIncludes(body, 'name="accessibilityEquivalentAlternatives"');
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

  assertStringIncludes(body, "Approval");
  assertStringIncludes(body, "Rejected");
  assertStringIncludes(body, "Needs a corrected scoring contract.");
  assertEquals(body.includes("/admin/packages/1/approve"), false);
});
