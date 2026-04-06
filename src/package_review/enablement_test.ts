import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildCanvasDeploymentBinding } from "../test_helpers/lti.ts";
import {
  buildAccessibilityReview,
  buildDeploymentRecord,
  buildPackageVersionRecord,
} from "../test_helpers/package_review.ts";
import { renderDeploymentDetailPage } from "../admin/deployment_detail.ts";

Deno.test("renderDeploymentDetailPage shows semver history with strong status badges and an active pin", () => {
  const approved = buildPackageVersionRecord({
    id: 7,
    approvalStatus: "approved",
    reviewNotes: "Ready for pilot.",
    accessibilityReview: buildAccessibilityReview({
      contrast: "fail",
      failureNotes: "Low-contrast score meter needs adjustment.",
      exceptionNote: "Reviewed for a short pilot with classroom support.",
    }),
    reviewedAt: "2026-03-23T18:05:00Z",
  });
  const pending = buildPackageVersionRecord({
    id: 8,
    version: "0.2.0",
    approvalStatus: "pending",
  });
  const body = renderDeploymentDetailPage({
    appId: "chapter-4-asteroids",
    appTitle: "Chapter 4 Asteroids",
    history: [pending, approved],
    deployments: [
      buildDeploymentRecord({
        enabledPackageVersionId: 7,
        enabledPackageVersion: "0.1.0",
      }),
    ],
  });

  assertStringIncludes(body, "Pinned to version 0.1.0.");
  assertStringIncludes(body, "Version 0.2.0");
  assertStringIncludes(body, "Pending review");
  assertStringIncludes(body, "Live now");
  assertStringIncludes(body, "Accessibility");
  assertStringIncludes(body, "Flagged review");
  assertStringIncludes(body, "Failed checks: Contrast.");
  assertStringIncludes(
    body,
    "Reviewed for a short pilot with classroom support.",
  );
});

Deno.test("renderDeploymentDetailPage only offers approved versions in the picker", () => {
  const approved = buildPackageVersionRecord({
    id: 7,
    approvalStatus: "approved",
    reviewNotes: "Ready for pilot.",
    accessibilityReview: buildAccessibilityReview(),
    reviewedAt: "2026-03-23T18:05:00Z",
  });
  const pending = buildPackageVersionRecord({
    id: 8,
    version: "0.2.0",
    approvalStatus: "pending",
  });
  const body = renderDeploymentDetailPage({
    appId: "chapter-4-asteroids",
    appTitle: "Chapter 4 Asteroids",
    history: [pending, approved],
    deployments: [
      buildDeploymentRecord({
        enabledPackageVersionId: null,
        enabledPackageVersion: null,
        binding: buildCanvasDeploymentBinding(),
      }),
    ],
  });

  assertStringIncludes(body, 'option value="7"');
  assertEquals(body.includes('option value="8"'), false);
  assertStringIncludes(body, "Passed review");
  assertStringIncludes(
    body,
    "Pending and rejected versions stay visible in history, but they cannot become active pins.",
  );
});
