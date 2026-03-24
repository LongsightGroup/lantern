import { assertEquals, assertStringIncludes } from "@std/assert";
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

Deno.test.ignore(
  "deep linking picker renders reviewed resources and an explicit selection summary",
  async () => {
    const modulePath = `./${"deep_linking_picker.ts"}`;
    const pickerModule = await import(modulePath);
    const html = pickerModule.renderDeepLinkingPickerPage?.({
      session: {
        deploymentSlug: "chapter-4-asteroids-pilot",
        contextTitle: "Physics 101",
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
  },
);
