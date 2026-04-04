import { assertEquals, assertStringIncludes } from "@std/assert";
import { compactVerify, createLocalJWKSet } from "jose";
import type { BootstrapPayload } from "../sdk/app-sdk.ts";
import { createApp } from "./app.ts";
import {
  EXAMPLE_SNAPSHOT_ROOT,
  restoreEnv,
  withRuntimeOriginEnv,
} from "./app_test_support.ts";
import { getPublicJwkSet } from "./lti/tool_key.ts";
import {
  buildAttemptRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import {
  buildRuntimeSessionRecord,
  getTestToolPrivateJwkEnvValue,
} from "./test_helpers/lti.ts";

Deno.test("GET /runtime/sessions/:id serves the reviewed entrypoint with a signed Lantern bootstrap injected", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    await withRuntimeOriginEnv(async () => {
      const response = await createApp({
        getRepository: () =>
          createInMemoryPackageReviewRepository({
            packageVersions: [
              buildPackageVersionRecord({
                id: 1,
                approvalStatus: "approved",
                reviewedAt: "2026-03-23T18:05:00Z",
                runtimeContractSignature:
                  "test-reviewed-runtime-contract-signature",
              }),
            ],
            runtimeSessions: [
              buildRuntimeSessionRecord({
                snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
                entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
                contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
                expiresAt: "2030-03-26T02:45:00Z",
              }),
            ],
          }),
      }).request(
        "https://runtime.lantern.example/runtime/sessions/runtime-session-123?token=runtime-token-123",
      );

      assertEquals(response.status, 200);
      const body = await response.text();
      const bootstrap = extractBootstrapFromHtml(body);

      assertStringIncludes(body, "GatewayBootstrap");
      assertStringIncludes(body, "attempt-123");
      assertStringIncludes(body, "runtime-token-123");
      assertStringIncludes(
        body,
        "https://runtime.lantern.example/runtime/sessions/runtime-session-123/files/__token__/runtime-token-123/dist/",
      );
      assertStringIncludes(
        body,
        "https://runtime.lantern.example/runtime/sessions/runtime-session-123/content",
      );
      assertEquals(
        bootstrap.app.runtime_contract_signature,
        "test-reviewed-runtime-contract-signature",
      );
      assertEquals(bootstrap.session.expires_at, "2030-03-26T02:45:00Z");
      assertEquals(
        body.includes("https://canvas.example/api/lti/courses/42/line_items"),
        false,
      );
      await assertBootstrapSignature(bootstrap);
    });
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});

Deno.test("POST /runtime/sessions/:id/attempt-events enforces session auth, capability checks, and append-only event writes", async () => {
  await withRuntimeOriginEnv(async () => {
    const repository = createInMemoryPackageReviewRepository({
      attempts: [buildAttemptRecord()],
      runtimeSessions: [
        buildRuntimeSessionRecord({ expiresAt: "2030-03-26T02:45:00Z" }),
      ],
    });
    const app = createApp({ getRepository: () => repository });

    const response = await app.request(
      "https://runtime.lantern.example/runtime/sessions/runtime-session-123/attempt-events",
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

    assertEquals(response.status, 202);

    const events = await repository.listAttemptEvents("attempt-123");
    const auditEvents = await repository.listAuditEventsByEventType(
      "attempt.submitted",
    );

    assertEquals(events.length, 1);
    assertEquals(events[0]?.eventType, "answer");
    assertEquals(auditEvents.length, 1);
    assertEquals(auditEvents[0]?.attemptId, "attempt-123");
  });
});

Deno.test("GET /runtime/sessions/:id/content serves reviewed activity content through the scoped runtime bridge", async () => {
  await withRuntimeOriginEnv(async () => {
    const response = await createApp({
      getRepository: () =>
        createInMemoryPackageReviewRepository({
          runtimeSessions: [
            buildRuntimeSessionRecord({
              snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
              entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
              contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
              expiresAt: "2030-03-26T02:45:00Z",
            }),
          ],
        }),
    }).request(
      "https://runtime.lantern.example/runtime/sessions/runtime-session-123/content",
      {
        headers: { Authorization: "Bearer runtime-token-123" },
      },
    );

    assertEquals(response.status, 200);
    const body = (await response.json()) as {
      title: string;
      questions: Array<{ id: string }>;
    };

    assertEquals(body.title, "Chapter 4 Asteroids");
    assertEquals(body.questions[0]?.id, "q1");
  });
});

Deno.test("GET /runtime/sessions/:id/files/* serves reviewed asset bytes and blocks bad tokens", async () => {
  await withRuntimeOriginEnv(async () => {
    const app = createApp({
      getRepository: () =>
        createInMemoryPackageReviewRepository({
          runtimeSessions: [
            buildRuntimeSessionRecord({
              snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
              entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
              contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
              expiresAt: "2030-03-26T02:45:00Z",
            }),
          ],
        }),
    });
    const queryTokenResponse = await app.request(
      "https://runtime.lantern.example/runtime/sessions/runtime-session-123/files/dist/app.js?token=runtime-token-123",
    );
    const goodPathTokenResponse = await app.request(
      "https://runtime.lantern.example/runtime/sessions/runtime-session-123/files/__token__/runtime-token-123/dist/app.js",
    );
    const deniedPathTokenResponse = await app.request(
      "https://runtime.lantern.example/runtime/sessions/runtime-session-123/files/__token__/wrong-token/dist/app.js",
    );

    assertEquals(queryTokenResponse.status, 409);
    assertEquals(goodPathTokenResponse.status, 200);
    assertStringIncludes(
      await queryTokenResponse.text(),
      "Runtime file path is invalid.",
    );
    assertStringIncludes(
      await goodPathTokenResponse.text(),
      "Attempt finalized",
    );
    assertEquals(deniedPathTokenResponse.status, 409);
    assertStringIncludes(
      await deniedPathTokenResponse.text(),
      "Runtime session token did not match the requested session.",
    );
  });
});

Deno.test("GET /runtime/sessions/:id fails clearly when served outside the configured runtime origin", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    await withRuntimeOriginEnv(async () => {
      const response = await createApp({
        getRepository: () =>
          createInMemoryPackageReviewRepository({
            packageVersions: [
              buildPackageVersionRecord({
                id: 1,
                approvalStatus: "approved",
                reviewedAt: "2026-03-23T18:05:00Z",
                runtimeContractSignature:
                  "test-reviewed-runtime-contract-signature",
              }),
            ],
            runtimeSessions: [
              buildRuntimeSessionRecord({
                snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
                entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
                contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
                expiresAt: "2030-03-26T02:45:00Z",
              }),
            ],
          }),
      }).request(
        "https://lantern.example/runtime/sessions/runtime-session-123?token=runtime-token-123",
      );
      const body = await response.text();

      assertEquals(response.status, 409);
      assertStringIncludes(
        body,
        "Runtime session requests must use APP_RUNTIME_ORIGIN.",
      );
    });
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});

function extractBootstrapFromHtml(html: string): BootstrapPayload {
  const match = html.match(
    /window\.GatewayBootstrap = (.+?);\nwindow\.GatewayPreview =/s,
  );

  if (!match?.[1]) {
    throw new Error("Expected GatewayBootstrap in runtime HTML.");
  }

  return JSON.parse(match[1]) as BootstrapPayload;
}

async function assertBootstrapSignature(
  bootstrap: BootstrapPayload,
): Promise<void> {
  const verified = await compactVerify(
    bootstrap.signature,
    createLocalJWKSet(await getPublicJwkSet()),
  );
  const payload = JSON.parse(new TextDecoder().decode(verified.payload));

  assertEquals(payload, {
    launch: bootstrap.launch,
    app: {
      app_id: bootstrap.app.app_id,
      version: bootstrap.app.version,
      capabilities: bootstrap.app.capabilities,
      runtime_contract_signature: bootstrap.app.runtime_contract_signature,
    },
    session: {
      attempt_id: bootstrap.session.attempt_id,
      token: bootstrap.session.token,
      expires_at: bootstrap.session.expires_at,
    },
  });
}
