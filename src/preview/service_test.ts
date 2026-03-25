import { assertEquals, assertRejects } from "@std/assert";
import { buildPackageVersionRecord } from "../test_helpers/package_review.ts";
import { createInMemoryPackageReviewRepository } from "../test_helpers/package_review.ts";
import { createPreviewSession, preparePreviewSession } from "./service.ts";

Deno.test("preview service loads preview.fixtures_file and validates required fields before preparing launch context", async () => {
  const snapshotRoot = await Deno.makeTempDir({ prefix: "lantern-preview-" });

  try {
    await Deno.mkdir(`${snapshotRoot}/preview`, { recursive: true });
    await Deno.writeTextFile(
      `${snapshotRoot}/preview/fixtures.json`,
      JSON.stringify({
        launch: {
          user_role: "instructor",
          course_id: "course-preview-42",
          assignment_id: "assignment-preview-7",
          activity_id: "activity-preview-9",
        },
        attempt_id: "attempt-preview-123",
        local_state: null,
      }),
    );

    const approvedPackage = buildPackageVersionRecord({
      id: 11,
      approvalStatus: "approved",
      artifact: {
        snapshotRoot,
        manifestPath: `${snapshotRoot}/manifest.json`,
        entrypointPath: `${snapshotRoot}/dist/index.html`,
        digest: "sha256:preview-fixture-test",
      },
      manifestJson: {
        preview: {
          fixtures_file: "/preview/fixtures.json",
          tests_file: "/preview/tests.json",
        },
      },
    });

    const prepared = await preparePreviewSession({
      packageVersion: approvedPackage,
      now: () => new Date("2026-03-25T02:00:00Z"),
      createOpaqueToken: () => "opaque-1",
    });

    assertEquals(prepared.launch.userRole, "instructor");
    assertEquals(prepared.launch.courseId, "course-preview-42");
    assertEquals(prepared.launch.assignmentId, "assignment-preview-7");
    assertEquals(prepared.launch.activityId, "activity-preview-9");
    assertEquals(prepared.fixtureData.attempt_id, "attempt-preview-123");
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
});

Deno.test("preview service fails clearly when preview fixtures are missing and does not fall back to runtime defaults", async () => {
  const snapshotRoot = await Deno.makeTempDir({ prefix: "lantern-preview-" });

  try {
    const approvedPackage = buildPackageVersionRecord({
      id: 12,
      approvalStatus: "approved",
      artifact: {
        snapshotRoot,
        manifestPath: `${snapshotRoot}/manifest.json`,
        entrypointPath: `${snapshotRoot}/dist/index.html`,
        digest: "sha256:preview-missing-fixture",
      },
      manifestJson: {
        preview: {
          fixtures_file: "/preview/missing.json",
          tests_file: "/preview/tests.json",
        },
      },
    });

    await assertRejects(
      () =>
        preparePreviewSession({
          packageVersion: approvedPackage,
          now: () => new Date("2026-03-25T02:05:00Z"),
          createOpaqueToken: () => "opaque-1",
        }),
      Error,
      "Preview fixtures file /preview/missing.json is missing from reviewed snapshot.",
    );
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
});

Deno.test("preview service returns fake identity/session defaults shaped for runtime bootstrap and evidence capture", async () => {
  const snapshotRoot = await Deno.makeTempDir({ prefix: "lantern-preview-" });

  try {
    await Deno.mkdir(`${snapshotRoot}/preview`, { recursive: true });
    await Deno.writeTextFile(
      `${snapshotRoot}/preview/fixtures.json`,
      JSON.stringify({
        launch: {
          user_role: "learner",
          course_id: "course-preview-42",
          assignment_id: null,
          activity_id: "activity-preview-9",
        },
        attempt_id: "attempt-preview-456",
        local_state: null,
      }),
    );

    const approvedPackage = buildPackageVersionRecord({
      id: 13,
      approvalStatus: "approved",
      grading: {
        mode: "declarative",
        rubricFile: "/scoring/rubric.json",
        maxScore: 80,
      },
      artifact: {
        snapshotRoot,
        manifestPath: `${snapshotRoot}/manifest.json`,
        entrypointPath: `${snapshotRoot}/dist/index.html`,
        digest: "sha256:preview-runtime-shape",
      },
      manifestJson: {
        preview: {
          fixtures_file: "/preview/fixtures.json",
          tests_file: "/preview/tests.json",
        },
      },
    });
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [approvedPackage],
    });
    const tokens = ["opaque-a", "opaque-b"];
    let index = 0;
    const created = await createPreviewSession({
      repository,
      packageVersion: approvedPackage,
      now: () => new Date("2026-03-25T02:10:00Z"),
      createOpaqueToken: () => {
        const token = tokens[index] ?? "opaque-fallback";
        index += 1;
        return token;
      },
    });

    assertEquals(created.previewSession.sessionId, "preview-session-opaque-a");
    assertEquals(created.previewSession.launch.userId, "preview-user-opaque-b");
    assertEquals(created.previewSession.fakeAttemptId, "attempt-preview-456");
    assertEquals(created.fakeScoring.scoreGiven, 0);
    assertEquals(created.fakeScoring.scoreMaximum, 80);
    assertEquals(created.fakeScoring.activityProgress, "Completed");
    assertEquals(created.fakeScoring.gradingProgress, "FullyGraded");
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
});
