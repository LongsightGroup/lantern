import { assertEquals, assertRejects } from "@std/assert";
import { createApp } from "../app.ts";
import {
  acceptAttemptEvent,
  parseAttemptEvent,
  requireRuntimeCapability,
} from "./gateway.ts";
import { buildRuntimeSessionRecord } from "../test_helpers/lti.ts";
import {
  buildAttemptRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";

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
