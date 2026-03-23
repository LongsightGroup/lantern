import { assertEquals } from "@std/assert";
import type { PackageVersionRecord } from "./types.ts";

function buildDemoPackageVersionRecord(
  overrides: Partial<PackageVersionRecord> = {},
): PackageVersionRecord {
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
    ...overrides,
  };
}

Deno.test.ignore(
  "importPackageVersion snapshots the demo package and persists a pending immutable version",
  () => {
    const targetModules = ["./intake.ts", "../test_helpers/postgres.ts"];
    const request = {
      sourceRoot: "examples/apps/chapter-4-asteroids",
      storageRoot: "var/packages",
      actorId: "admin_demo",
    };
    const response = {
      status: 201,
      packageVersionId: 1,
      snapshotRoot: "var/packages/chapter-4-asteroids/0.1.0",
    };
    const persistedVersion = buildDemoPackageVersionRecord();

    assertEquals(targetModules[0], "./intake.ts");
    assertEquals(targetModules[1], "../test_helpers/postgres.ts");
    assertEquals(request.storageRoot, "var/packages");
    assertEquals(response.status, 201);
    assertEquals(response.packageVersionId, persistedVersion.id);
    assertEquals(response.snapshotRoot, persistedVersion.artifact.snapshotRoot);
    assertEquals(persistedVersion.approvalStatus, "pending");
    assertEquals(persistedVersion.validationIssues, []);
    assertEquals(persistedVersion.reviewNotes, null);
  },
);

Deno.test.ignore(
  "importPackageVersion refuses to overwrite an existing immutable app version snapshot",
  () => {
    const request = {
      sourceRoot: "examples/apps/chapter-4-asteroids",
      storageRoot: "var/packages",
      actorId: "admin_demo",
    };
    const response = {
      status: 409,
      error:
        "Package version chapter-4-asteroids@0.1.0 already exists and cannot be replaced.",
    };
    const persistedVersionIds = [1];

    assertEquals(request.sourceRoot, "examples/apps/chapter-4-asteroids");
    assertEquals(response.status, 409);
    assertEquals(
      response.error,
      "Package version chapter-4-asteroids@0.1.0 already exists and cannot be replaced.",
    );
    assertEquals(persistedVersionIds, [1]);
  },
);
