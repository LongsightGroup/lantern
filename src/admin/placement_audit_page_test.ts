import { assertStringIncludes } from "@std/assert";
import { renderPlacementAuditPage } from "./placement_audit_page.ts";
import {
  buildAuditEventRecord,
  buildReviewedPlacementRecord,
} from "../test_helpers/package_review.ts";

Deno.test("renderPlacementAuditPage shows selected content, reviewed package identity, Canvas context, and placement status", () => {
  const html = renderPlacementAuditPage({
    snapshot: {
      placement: buildReviewedPlacementRecord({
        placementId: "placement-audit-123",
        appId: "chapter-4-asteroids",
        packageVersion: "0.8.0",
        packageTitle: "Chapter 4 Asteroids",
        contentPath: "/content/bonus.json",
        contentTitle: "Bonus Activity",
        contextId: "course-42",
        contextTitle: "Physics 101",
        resourceLinkId: "resource-link-123",
      }),
      status: "bound_with_preview",
      latestPreviewSessionId: "preview-session-123",
      latestPreviewOccurredAt: "2026-03-25T12:00:00Z",
      previewEvidenceCount: 3,
      evidenceSummary: {
        deepLinkingRequestCount: 1,
        placementEventCount: 2,
        reviewerEventCount: 1,
        latestOccurredAt: "2026-03-25T12:05:00Z",
      },
    },
    timeline: [],
  });

  assertStringIncludes(html, "Placement audit");
  assertStringIncludes(html, "placement-audit-123");
  assertStringIncludes(html, "Chapter 4 Asteroids");
  assertStringIncludes(html, "Version 0.8.0");
  assertStringIncludes(html, "/content/bonus.json");
  assertStringIncludes(html, "Physics 101");
  assertStringIncludes(html, "Bound with test-launch activity");
  assertStringIncludes(
    html,
    'href="/admin/packages/chapter-4-asteroids/versions/0.8.0"',
  );
  assertStringIncludes(
    html,
    'href="/admin/packages/chapter-4-asteroids/deployment"',
  );
});

Deno.test("renderPlacementAuditPage includes deep-linking, test-launch, and reviewer timeline entries when evidence exists", () => {
  const html = renderPlacementAuditPage({
    snapshot: {
      placement: buildReviewedPlacementRecord({
        placementId: "placement-audit-123",
        packageVersion: "0.8.0",
      }),
      status: "bound_no_preview",
      latestPreviewSessionId: "preview-session-123",
      latestPreviewOccurredAt: "2026-03-25T12:00:00Z",
      previewEvidenceCount: 2,
      evidenceSummary: {
        deepLinkingRequestCount: 1,
        placementEventCount: 2,
        reviewerEventCount: 1,
        latestOccurredAt: "2026-03-25T12:05:00Z",
      },
    },
    timeline: [
      buildAuditEventRecord({
        id: 41,
        eventType: "deep_linking.placement.created",
        summary: "Created reviewed placement from Deep Linking selection.",
      }),
      buildAuditEventRecord({
        id: 42,
        eventType: "reviewer.preview_viewed",
        summary: "Reviewer opened the test launch page.",
      }),
    ],
  });

  assertStringIncludes(html, "Evidence timeline");
  assertStringIncludes(html, "deep_linking.placement.created");
  assertStringIncludes(html, "reviewer.preview_viewed");
  assertStringIncludes(html, "Open test activity");
});
