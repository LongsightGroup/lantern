import { assertEquals } from "@std/assert";
import { createRuntimeSession } from "./launch.ts";
import {
  buildRuntimeSessionRecord,
  buildValidatedLaunch,
} from "../test_helpers/lti.ts";
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";

Deno.test("createRuntimeSession keeps the pinned approved version instead of resolving latest", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        version: "0.1.0",
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
      buildPackageVersionRecord({
        id: 2,
        version: "0.2.0",
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:10:00Z",
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        sessionId: "existing-session",
        sessionToken: "existing-token",
      }),
    ],
  });
  const opaqueTokens = ["runtime-session-123", "runtime-token-123"];
  const session = await createRuntimeSession({
    repository,
    launch: buildValidatedLaunch(),
    now: () => new Date("2026-03-23T22:45:00Z"),
    createOpaqueToken: () => {
      const next = opaqueTokens.shift();

      if (!next) {
        throw new Error("Expected another deterministic runtime token.");
      }

      return next;
    },
  });
  const saved = await repository.getRuntimeSessionById("runtime-session-123");
  const attempt = await repository.getAttemptById("attempt-123");

  assertEquals(session.packageVersionId, 1);
  assertEquals(session.packageVersion, "0.1.0");
  assertEquals(session.attemptId, "attempt-123");
  assertEquals(saved?.packageVersionId, 1);
  assertEquals(saved?.sessionToken, "runtime-token-123");
  assertEquals(saved?.attemptId, "attempt-123");
  assertEquals(attempt?.attemptId, "attempt-123");
  assertEquals(attempt?.status, "in_progress");
});

Deno.test("createRuntimeSession uses the reviewed placement content path instead of the package default content file", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
        manifestJson: {
          app_id: "chapter-4-asteroids",
          version: "0.1.0",
          title: "Chapter 4 Asteroids",
          content_files: ["/content/activity.json", "/content/bonus.json"],
        },
      }),
    ],
  });
  const opaqueTokens = ["runtime-session-reviewed", "runtime-token-reviewed"];
  const session = await createRuntimeSession({
    repository,
    launch: buildValidatedLaunch({
      activityId: "/content/bonus.json",
      contentPath: "/content/bonus.json",
    }),
    now: () => new Date("2026-03-23T22:45:00Z"),
    createOpaqueToken: () => {
      const next = opaqueTokens.shift();

      if (!next) {
        throw new Error("Expected another deterministic runtime token.");
      }

      return next;
    },
  });
  const saved = await repository.getRuntimeSessionById(
    "runtime-session-reviewed",
  );

  assertEquals(
    session.contentPath,
    "var/packages/chapter-4-asteroids/0.1.0/content/bonus.json",
  );
  assertEquals(
    saved?.contentPath,
    "var/packages/chapter-4-asteroids/0.1.0/content/bonus.json",
  );
  assertEquals(saved?.launch.activityId, "/content/bonus.json");
});
