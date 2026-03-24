import { assertEquals, assertStringIncludes } from "@std/assert";
import { renderDeepLinkingPickerPage } from "./deep_linking_picker.ts";
import {
  buildDeepLinkingResourceOption,
  buildDeepLinkingResourceSelection,
} from "../test_helpers/package_review.ts";

Deno.test(
  "deep linking picker fixtures expose approved assignment resources with canonical content paths",
  () => {
    const option = buildDeepLinkingResourceOption();

    assertEquals(option.installScope, "assignment");
    assertEquals(option.approvalStatus, "approved");
    assertEquals(option.contentPath, "/content/activity.json");
    assertEquals(option.activityId, "/content/activity.json");
  },
);

Deno.test(
  "deep linking picker renders reviewed resources and an explicit selection summary",
  () => {
    const html = renderDeepLinkingPickerPage({
      sessionId: "deep-linking-session-123",
      token: "deep-linking-token-123",
      session: {
        appId: "chapter-4-asteroids",
        deploymentSlug: "chapter-4-asteroids-pilot",
        contextTitle: "Physics 101",
        expiresAt: "2026-03-24T16:30:00Z",
      },
      resources: [
        buildDeepLinkingResourceOption(),
        buildDeepLinkingResourceOption({
          packageVersionId: 2,
          packageVersion: "0.2.0",
          contentPath: "/content/bonus.json",
          activityId: "/content/bonus.json",
          contentTitle: "Bonus Activity",
        }),
      ],
      selection: buildDeepLinkingResourceSelection({
        packageVersionId: 2,
        packageVersion: "0.2.0",
        contentPath: "/content/bonus.json",
        activityId: "/content/bonus.json",
        contentTitle: "Bonus Activity",
      }),
      notice: null,
    });

    assertStringIncludes(html, "Chapter 4 Asteroids");
    assertStringIncludes(html, "0.2.0");
    assertStringIncludes(html, "/content/bonus.json");
    assertStringIncludes(html, "Bonus Activity");
    assertStringIncludes(html, "Canvas return continues in Phase 6.");
    assertStringIncludes(html, "deep-linking-token-123");
  },
);
