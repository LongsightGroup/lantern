import { assertEquals, assertRejects } from "@std/assert";
import { createApp } from "../app.ts";
import {
  acceptAttemptEvent,
  finalizeRuntimeAttempt,
  parseAttemptEvent,
  requireRuntimeCapability,
} from "./gateway.ts";
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

const EXAMPLE_SNAPSHOT_ROOT = "examples/apps/chapter-4-asteroids";

Deno.test(
  "runtime gateway accepts authenticated attempt-event writes and persists append-only attempt events",
  async () => {
    const repository = createInMemoryPackageReviewRepository({
      attempts: [buildAttemptRecord()],
      runtimeSessions: [
        buildRuntimeSessionRecord({
          expiresAt: "2026-03-25T02:45:00Z",
        }),
      ],
    });
    const response = await createApp({
      getRepository: () => repository,
    }).request(
      "http://localhost/runtime/sessions/runtime-session-123/attempt-events",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer runtime-token-123",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "progress",
          checkpoint: "wave-1",
          value: 0.5,
          timestamp: "2026-03-24T02:30:00Z",
        }),
      },
    );

    assertEquals(response.status, 202);

    const events = await repository.listAttemptEvents("attempt-123");

    assertEquals(events.length, 1);
    assertEquals(events[0]?.sequence, 1);
    assertEquals(events[0]?.eventType, "progress");
  },
);

Deno.test(
  "runtime gateway blocks missing capability, bad payloads, and bad tokens before any write",
  async () => {
    const repository = createInMemoryPackageReviewRepository({
      attempts: [buildAttemptRecord()],
      runtimeSessions: [
        buildRuntimeSessionRecord({
          capabilities: ["read_launch_context"],
          expiresAt: "2026-03-25T02:45:00Z",
        }),
      ],
    });
    const app = createApp({
      getRepository: () => repository,
    });
    const capabilityResponse = await app.request(
      "http://localhost/runtime/sessions/runtime-session-123/attempt-events",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer runtime-token-123",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "answer",
          questionId: "q1",
          answer: "asteroid",
          timestamp: "2026-03-24T02:30:00Z",
        }),
      },
    );
    const tokenResponse = await app.request(
      "http://localhost/runtime/sessions/runtime-session-123/attempt-events",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "answer",
          questionId: "q1",
          answer: "asteroid",
          timestamp: "2026-03-24T02:30:00Z",
        }),
      },
    );

    assertEquals(capabilityResponse.status, 409);
    assertEquals(tokenResponse.status, 409);
    assertEquals(await repository.listAttemptEvents("attempt-123"), []);
  },
);

Deno.test("runtime gateway validates attempt event payloads and capabilities", async () => {
  assertEquals(
    parseAttemptEvent({
      type: "complete",
      timestamp: "2026-03-24T02:30:00Z",
    }).type,
    "complete",
  );
  await assertRejects(
    () =>
      Promise.resolve().then(() =>
        parseAttemptEvent({
          type: "answer",
          answer: "asteroid",
          timestamp: "2026-03-24T02:30:00Z",
        })
      ),
    Error,
    "Attempt answer questionId is required.",
  );
  await assertRejects(
    () =>
      Promise.resolve().then(() =>
        requireRuntimeCapability(
          buildRuntimeSessionRecord({
            capabilities: ["read_launch_context"],
          }),
          "submit_attempt_event",
        )
      ),
    Error,
    "Runtime session does not allow submit_attempt_event.",
  );
});

Deno.test("runtime gateway helper appends attempt events directly against the durable ledger", async () => {
  const repository = createInMemoryPackageReviewRepository({
    attempts: [buildAttemptRecord()],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        expiresAt: "2026-03-25T02:45:00Z",
      }),
    ],
  });
  const appended = await acceptAttemptEvent({
    repository,
    session: buildRuntimeSessionRecord({
      expiresAt: "2026-03-25T02:45:00Z",
    }),
    payload: {
      type: "answer",
      questionId: "q1",
      answer: "asteroid",
      timestamp: "2026-03-24T02:30:00Z",
    },
    now: () => new Date("2026-03-24T02:31:00Z"),
  });

  assertEquals(appended.sequence, 1);
  assertEquals(appended.receivedAt, "2026-03-24T02:31:00.000Z");
});

Deno.test(
  "runtime gateway finalizes declarative attempts from the reviewed rubric and stays idempotent",
  async () => {
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
      expiresAt: "2026-03-25T02:45:00Z",
    });

    Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

    try {
      await withFetchStub((input, init) => {
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
      }, async () => {
        const firstResult = await finalizeRuntimeAttempt({
          repository,
          session,
          payload: {
            completionState: "completed",
          },
          now: () => new Date("2026-03-24T02:35:00Z"),
        });
        const secondResult = await finalizeRuntimeAttempt({
          repository,
          session,
          payload: {
            completionState: "abandoned",
          },
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
      });
    } finally {
      restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
    }
  },
);

Deno.test(
  "runtime gateway surfaces Canvas token failures clearly after the durable attempt is finalized",
  async () => {
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
      ],
    });
    const session = buildRuntimeSessionRecord({
      expiresAt: "2026-03-25T02:45:00Z",
    });

    Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

    try {
      const result = await withFetchStub(
        () =>
          new Response(
            JSON.stringify({
              error: "invalid_client",
            }),
            {
              status: 401,
              headers: {
                "content-type": "application/json",
              },
            },
          ),
        async () =>
          await finalizeRuntimeAttempt({
            repository,
            session,
            payload: {
              completionState: "completed",
            },
            now: () => new Date("2026-03-24T02:35:00Z"),
          }),
      );

      assertEquals(result.finalizedNow, true);
      assertEquals(result.gradePublishedNow, false);
      assertEquals(result.publishError?.code, "token_request_failed");
      assertEquals(result.gradePublication, null);

      const attempt = await repository.getAttemptById("attempt-123");

      assertEquals(attempt?.status, "completed");
      assertEquals(attempt?.finalizedAt, "2026-03-24T02:35:00.000Z");
    } finally {
      restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
    }
  },
);

Deno.test(
  "runtime gateway fails clearly for manual grading finalize requests and leaves the attempt open",
  async () => {
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [
        buildPackageVersionRecord({
          grading: {
            mode: "manual",
            rubricFile: null,
            maxScore: null,
          },
        }),
      ],
      attempts: [buildAttemptRecord()],
    });
    const session = buildRuntimeSessionRecord({
      expiresAt: "2026-03-25T02:45:00Z",
    });

    await assertRejects(
      () =>
        finalizeRuntimeAttempt({
          repository,
          session,
          payload: {
            completionState: "completed",
          },
          now: () => new Date("2026-03-24T02:35:00Z"),
        }),
      Error,
      "Finalize blocked: Manual grading cannot be finalized automatically in Phase 3.",
    );

    const attempt = await repository.getAttemptById("attempt-123");

    assertEquals(attempt?.status, "in_progress");
    assertEquals(attempt?.finalizedAt, null);
  },
);

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Deno.env.delete(name);
    return;
  }

  Deno.env.set(name, value);
}

async function withFetchStub<T>(
  handler: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Response | Promise<Response>,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise.resolve(handler(input, init));

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
