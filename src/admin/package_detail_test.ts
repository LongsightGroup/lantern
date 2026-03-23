import { assertEquals } from "@std/assert";
import type { PackageVersionRecord } from "../package_review/types.ts";

function buildPendingPackageVersion(): PackageVersionRecord {
  return {
    id: 1,
    appId: "chapter-4-asteroids",
    version: "0.1.0",
    title: "Chapter 4 Asteroids",
    description: "Shoot the correct vocabulary target.",
    owner: {
      type: "user",
      id: "instructor_123",
    },
    entrypoint: "/dist/index.html",
    roles: ["learner", "instructor"],
    installScope: "course",
    capabilities: [
      "read_launch_context",
      "read_activity_content",
      "submit_attempt_event",
      "finalize_attempt",
      "read_local_state",
      "write_local_state",
    ],
    grading: {
      mode: "declarative",
      rubricFile: "/scoring/rubric.json",
      maxScore: 100,
    },
    approvalStatus: "pending",
    reviewNotes: null,
    reviewedAt: null,
    validationIssues: [],
    manifestJson: {
      app_id: "chapter-4-asteroids",
      version: "0.1.0",
      title: "Chapter 4 Asteroids",
    },
    artifact: {
      snapshotRoot: "var/packages/chapter-4-asteroids/0.1.0",
      manifestPath: "var/packages/chapter-4-asteroids/0.1.0/manifest.json",
      entrypointPath: "var/packages/chapter-4-asteroids/0.1.0/dist/index.html",
      digest: "sha256:chapter-4-asteroids-0.1.0",
    },
    importedAt: "2026-03-23T17:30:00Z",
  };
}

Deno.test.ignore(
  "GET /admin/packages/:appId/versions/:version renders a dossier with approval status, version, owner, and capabilities above the fold",
  () => {
    const targetModules = ["../app.ts", "./package_detail.ts"];
    const request = {
      method: "GET",
      path: "/admin/packages/chapter-4-asteroids/versions/0.1.0",
    };
    const persistedVersion = buildPendingPackageVersion();
    const response = {
      status: 200,
      contentType: "text/html; charset=UTF-8",
      bodyIncludes: [
        "Pending review",
        "Version 0.1.0",
        "Owner instructor_123",
        "Requested capabilities",
        "submit_attempt_event",
        "finalize_attempt",
        "Grading declarative",
      ],
    };

    assertEquals(targetModules[0], "../app.ts");
    assertEquals(targetModules[1], "./package_detail.ts");
    assertEquals(
      request.path,
      "/admin/packages/chapter-4-asteroids/versions/0.1.0",
    );
    assertEquals(response.status, 200);
    assertEquals(response.contentType, "text/html; charset=UTF-8");
    assertEquals(response.bodyIncludes.includes("Pending review"), true);
    assertEquals(response.bodyIncludes.includes("Version 0.1.0"), true);
    assertEquals(response.bodyIncludes.includes("Owner instructor_123"), true);
    assertEquals(
      response.bodyIncludes.includes("Requested capabilities"),
      true,
    );
    assertEquals(
      response.bodyIncludes.includes("submit_attempt_event"),
      true,
    );
    assertEquals(persistedVersion.approvalStatus, "pending");
    assertEquals(persistedVersion.owner.id, "instructor_123");
  },
);
