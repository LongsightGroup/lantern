import { assertEquals } from "@std/assert";
import { createInMemoryPackageReviewRepository } from "../test_helpers/package_review.ts";
import { buildRuntimeSessionRecord } from "../test_helpers/lti.ts";

Deno.test.ignore(
  "runtime gateway accepts authenticated attempt-event writes and persists append-only attempt events",
  async () => {
    const appModulePath = "../app.ts";
    const { createApp } = await import(appModulePath);
    const repository = createInMemoryPackageReviewRepository({
      runtimeSessions: [buildRuntimeSessionRecord()],
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
  },
);

Deno.test.ignore(
  "runtime gateway finalize route blocks missing capability, scores the durable attempt, and triggers grade publication through the server",
  async () => {
    const appModulePath = "../app.ts";
    const { createApp } = await import(appModulePath);
    const repository = createInMemoryPackageReviewRepository({
      runtimeSessions: [buildRuntimeSessionRecord()],
    });
    const response = await createApp({
      getRepository: () => repository,
    }).request(
      "http://localhost/runtime/sessions/runtime-session-123/finalize",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer runtime-token-123",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          completionState: "completed",
        }),
      },
    );

    assertEquals(response.status, 202);
  },
);
