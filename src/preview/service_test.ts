import { assertEquals, assertRejects } from "@std/assert";
import { buildPackageVersionRecord } from "../test_helpers/package_review.ts";
import { createInMemoryPackageReviewRepository } from "../test_helpers/package_review.ts";
import { createPreviewSession, preparePreviewSession } from "./service.ts";

Deno.test("preview service loads preview.fixtures_file and validates required fields before preparing launch context", async () => {
  const snapshotRoot = await Deno.makeTempDir({ prefix: "lantern-preview-" });

  try {
    await writePreviewManifest(snapshotRoot, "/preview/fixtures.json");
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
        app_id: "chapter-4-asteroids",
        version: "0.1.0",
        title: "Chapter 4 Asteroids",
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
    await writePreviewManifest(snapshotRoot, "/preview/missing.json");
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
      "Saved test launch file /preview/missing.json is missing from the reviewed app files.",
    );
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
});

Deno.test("preview service applies explicit test-launch overrides over saved defaults", async () => {
  const snapshotRoot = await Deno.makeTempDir({ prefix: "lantern-preview-" });

  try {
    await writePreviewManifest(snapshotRoot, "/preview/fixtures.json");
    await Deno.mkdir(`${snapshotRoot}/preview`, { recursive: true });
    await Deno.writeTextFile(
      `${snapshotRoot}/preview/fixtures.json`,
      JSON.stringify({
        launch: {
          user_role: "learner",
          course_id: "course-preview-42",
          assignment_id: "assignment-preview-7",
          activity_id: "activity-preview-9",
        },
        attempt_id: "attempt-preview-123",
        local_state: null,
      }),
    );

    const approvedPackage = buildPackageVersionRecord({
      id: 14,
      approvalStatus: "approved",
      roles: ["learner", "instructor"],
      artifact: {
        snapshotRoot,
        manifestPath: `${snapshotRoot}/manifest.json`,
        entrypointPath: `${snapshotRoot}/dist/index.html`,
        digest: "sha256:preview-launch-overrides",
      },
    });

    const prepared = await preparePreviewSession({
      packageVersion: approvedPackage,
      launch: {
        userRole: "instructor",
        courseId: "physics-201",
        assignmentId: null,
        activityId: "boss-fight",
      },
      now: () => new Date("2026-03-25T02:07:00Z"),
      createOpaqueToken: () => "opaque-2",
    });

    assertEquals(prepared.launch.userRole, "instructor");
    assertEquals(prepared.launch.courseId, "physics-201");
    assertEquals(prepared.launch.assignmentId, null);
    assertEquals(prepared.launch.activityId, "boss-fight");
    assertEquals(prepared.fixtureData.launch.user_role, "learner");
    assertEquals(prepared.fixtureData.launch.course_id, "course-preview-42");
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
});

Deno.test("preview service returns fake identity/session defaults shaped for runtime bootstrap and evidence capture", async () => {
  const snapshotRoot = await Deno.makeTempDir({ prefix: "lantern-preview-" });

  try {
    await writePreviewManifest(snapshotRoot, "/preview/fixtures.json");
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
        app_id: "chapter-4-asteroids",
        version: "0.1.0",
        title: "Chapter 4 Asteroids",
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

async function writePreviewManifest(
  snapshotRoot: string,
  fixturesFile: string,
): Promise<void> {
  await Deno.writeTextFile(
    `${snapshotRoot}/manifest.json`,
    JSON.stringify({
      schema_version: "1",
      app_id: "chapter-4-asteroids",
      version: "0.1.0",
      title: "Chapter 4 Asteroids",
      owner: {
        type: "user",
        id: "instructor_123",
      },
      entrypoint: "/dist/index.html",
      roles: ["learner", "instructor"],
      install_scope: "course",
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
        rubric_file: "/scoring/rubric.json",
        max_score: 100,
      },
      content_files: ["/content/activity.json"],
      preview: {
        fixtures_file: fixturesFile,
        tests_file: "/preview/tests.json",
      },
    }),
  );
}
