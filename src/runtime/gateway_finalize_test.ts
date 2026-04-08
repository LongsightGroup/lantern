import { assertEquals } from "@std/assert";
import { finalizeRuntimeAttempt } from "./gateway.ts";
import {
  buildDeploymentBinding,
  buildRuntimeSessionRecord,
  getTestToolPrivateJwkEnvValue,
} from "../test_helpers/lti.ts";
import {
  buildAttemptEventRecord,
  buildAttemptRecord,
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";
import {
  EXAMPLE_SNAPSHOT_ROOT,
  FILE_SYSTEM_RUNTIME_ARTIFACT_STORE,
  restoreEnv,
  TEST_RUNTIME_ENV,
  withFetchStub,
} from "./gateway_test_helpers.ts";

const WEB_CHECKUP_SNAPSHOT_ROOT = "examples/apps/web-checkup";

Deno.test("runtime gateway finalizes declarative attempts from the reviewed rubric and stays idempotent", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        artifact: {
          snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
          manifestPath: `${EXAMPLE_SNAPSHOT_ROOT}/manifest.json`,
          entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
          digest: "sha256:example-snapshot",
        },
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding(),
      }),
    ],
    attempts: [buildAttemptRecord()],
    attemptEvents: [
      buildAttemptEventRecord({
        id: 1,
        sequence: 1,
        event: {
          type: "answer",
          questionId: "q1",
          answer: "resistance to a change in motion",
          timestamp: "2026-03-24T02:30:00Z",
        },
      }),
      buildAttemptEventRecord({
        id: 2,
        sequence: 2,
        event: {
          type: "answer",
          questionId: "q2",
          answer: "speed with direction",
          timestamp: "2026-03-24T02:31:00Z",
        },
      }),
    ],
  });
  const session = buildRuntimeSessionRecord({
    expiresAt: "2099-03-26T02:45:00Z",
  });

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    await withFetchStub(
      (input, init) => {
        const url = String(input);

        if (url === "https://sso.canvaslms.com/login/oauth2/token") {
          return new Response(
            JSON.stringify({
              access_token: "canvas-access-token",
              token_type: "bearer",
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        assertEquals(
          url,
          "https://canvas.example/api/lti/courses/42/line_items/9/scores",
        );
        assertEquals(init?.method, "POST");

        return new Response(null, { status: 202 });
      },
      async () => {
        const firstResult = await finalizeRuntimeAttempt({
          repository,
          session,
          payload: {
            completionState: "completed",
          },
          env: TEST_RUNTIME_ENV,
          artifactStore: FILE_SYSTEM_RUNTIME_ARTIFACT_STORE,
          now: () => new Date("2026-03-24T02:35:00Z"),
        });
        const secondResult = await finalizeRuntimeAttempt({
          repository,
          session,
          payload: {
            completionState: "abandoned",
          },
          env: TEST_RUNTIME_ENV,
          artifactStore: FILE_SYSTEM_RUNTIME_ARTIFACT_STORE,
          now: () => new Date("2026-03-24T02:40:00Z"),
        });

        assertEquals(firstResult.finalizedNow, true);
        assertEquals(firstResult.attempt.status, "completed");
        assertEquals(firstResult.score, {
          scoreGiven: 100,
          scoreMaximum: 100,
        });
        assertEquals(firstResult.gradePublishedNow, true);
        assertEquals(firstResult.gradePublication?.status, "published");
        assertEquals(
          firstResult.lineItemBinding?.lineItemUrl,
          "https://canvas.example/api/lti/courses/42/line_items/9",
        );
        assertEquals(secondResult.finalizedNow, false);
        assertEquals(secondResult.attempt.status, "completed");
        assertEquals(secondResult.attempt.completionState, "completed");
        assertEquals(
          secondResult.attempt.finalizedAt,
          "2026-03-24T02:35:00.000Z",
        );
        assertEquals(secondResult.gradePublishedNow, false);
        assertEquals(secondResult.gradePublication?.status, "published");
      },
    );
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});

Deno.test("runtime gateway finalizes browser grading through the reviewed browser grader result and still publishes through AGS", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        appId: "web-checkup",
        title: "Web Checkup",
        grading: {
          mode: "browser",
          rubricFile: null,
          maxScore: 100,
        },
        manifestJson: {
          app_id: "web-checkup",
          version: "0.1.0",
          title: "Web Checkup",
          grading: {
            mode: "browser",
            max_score: 100,
          },
          authoring: {
            kind: "browser_autograder",
            grader_spec_files: [
              "/grading/specs/structure.spec.js",
              "/grading/specs/behavior.spec.js",
            ],
            evidence_example_file: "/evidence/example-output.json",
          },
        },
        artifact: {
          snapshotRoot: WEB_CHECKUP_SNAPSHOT_ROOT,
          manifestPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/manifest.json`,
          entrypointPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/dist/index.html`,
          digest: "sha256:web-checkup-snapshot",
        },
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        appId: "web-checkup",
        slug: "web-checkup-pilot",
        label: "Web Checkup Pilot",
        binding: buildDeploymentBinding(),
      }),
    ],
    attempts: [
      buildAttemptRecord({
        appId: "web-checkup",
        deploymentSlug: "web-checkup-pilot",
      }),
    ],
  });
  const session = buildRuntimeSessionRecord({
    appId: "web-checkup",
    deploymentSlug: "web-checkup-pilot",
    snapshotRoot: WEB_CHECKUP_SNAPSHOT_ROOT,
    entrypointPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/dist/index.html`,
    contentPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/content/activity.json`,
    expiresAt: "2099-03-26T02:45:00Z",
  });

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    await withFetchStub(
      (input, init) => {
        const url = String(input);

        if (url === "https://sso.canvaslms.com/login/oauth2/token") {
          return new Response(
            JSON.stringify({
              access_token: "canvas-access-token",
              token_type: "bearer",
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        assertEquals(
          url,
          "https://canvas.example/api/lti/courses/42/line_items/9/scores",
        );
        assertEquals(init?.method, "POST");

        return new Response(null, { status: 202 });
      },
      async () => {
        const result = await finalizeRuntimeAttempt({
          repository,
          session,
          payload: {
            completionState: "completed",
            browserGraderResult: {
              scoreGiven: 100,
              scoreMaximum: 100,
              specResults: [
                {
                  source: "/grading/specs/structure.spec.js",
                  result: "passed",
                  failures: [],
                },
                {
                  source: "/grading/specs/behavior.spec.js",
                  result: "passed",
                  failures: [],
                },
              ],
            },
          },
          env: TEST_RUNTIME_ENV,
          artifactStore: FILE_SYSTEM_RUNTIME_ARTIFACT_STORE,
          now: () => new Date("2026-04-08T18:05:00Z"),
        });

        assertEquals(result.finalizedNow, true);
        assertEquals(result.score, {
          scoreGiven: 100,
          scoreMaximum: 100,
        });
        assertEquals(result.browserGraderResult?.specResults.length, 2);
        assertEquals(result.gradePublishedNow, true);
        assertEquals(result.gradePublication?.status, "published");
      },
    );
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});

Deno.test("runtime gateway keeps the AGS line-item resource id aligned with the reviewed activity", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        artifact: {
          snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
          manifestPath: `${EXAMPLE_SNAPSHOT_ROOT}/manifest.json`,
          entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
          digest: "sha256:example-snapshot",
        },
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding(),
      }),
    ],
    attempts: [
      buildAttemptRecord({
        activityId: "/content/bonus.json",
      }),
    ],
    attemptEvents: [
      buildAttemptEventRecord({
        id: 1,
        sequence: 1,
        event: {
          type: "answer",
          questionId: "q1",
          answer: "resistance to a change in motion",
          timestamp: "2026-03-24T02:30:00Z",
        },
      }),
    ],
  });
  const session = buildRuntimeSessionRecord({
    contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/bonus.json`,
    launch: {
      userRole: "learner",
      courseId: "course-42",
      assignmentId: "assignment-9",
      activityId: "/content/bonus.json",
    },
    expiresAt: "2099-03-26T02:45:00Z",
  });

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    await withFetchStub(
      (input, init) => {
        const url = String(input);

        if (url === "https://sso.canvaslms.com/login/oauth2/token") {
          return new Response(
            JSON.stringify({
              access_token: "canvas-access-token",
              token_type: "bearer",
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        assertEquals(
          url,
          "https://canvas.example/api/lti/courses/42/line_items/9/scores",
        );
        assertEquals(init?.method, "POST");

        return new Response(null, { status: 202 });
      },
      async () => {
        const result = await finalizeRuntimeAttempt({
          repository,
          session,
          payload: {
            completionState: "completed",
          },
          env: TEST_RUNTIME_ENV,
          artifactStore: FILE_SYSTEM_RUNTIME_ARTIFACT_STORE,
          now: () => new Date("2026-03-24T02:35:00Z"),
        });

        assertEquals(
          result.lineItemBinding?.resourceId,
          "lantern:chapter-4-asteroids:0.1.0:/content/bonus.json",
        );
      },
    );
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});
