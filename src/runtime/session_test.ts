import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { compactVerify, createLocalJWKSet } from "jose";
import type { BootstrapPayload } from "../../sdk/app-sdk.ts";
import { getPublicJwkSet } from "../lti/tool_key.ts";
import {
  authorizeRuntimeSession,
  loadRuntimeActivityContent,
  renderRuntimeSessionPage,
} from "./session.ts";
import {
  buildRuntimeSessionRecord,
  getTestToolPrivateJwkEnvValue,
} from "../test_helpers/lti.ts";

const EXAMPLE_SNAPSHOT_ROOT = "examples/apps/chapter-4-asteroids";
const TEST_SIGNING_ENV = {
  get(name: string): string | undefined {
    return name === "LTI_TOOL_PRIVATE_JWK"
      ? getTestToolPrivateJwkEnvValue()
      : undefined;
  },
};

Deno.test("runtime session route serves the pinned reviewed entrypoint with an injected signed bootstrap payload", async () => {
  const html = await renderRuntimeSessionPage(
    buildRuntimeSessionRecord({
      snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
      entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
      contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
    }),
    {
      runtimeContractSignature: "test-reviewed-runtime-contract-signature",
      env: TEST_SIGNING_ENV,
    },
  );
  const bootstrap = extractBootstrapFromHtml(html);

  assertStringIncludes(html, "GatewayBootstrap");
  assertStringIncludes(html, "chapter-4-asteroids");
  assertStringIncludes(html, "runtime-token-123");
  assertStringIncludes(html, "emitAttemptEvent");
  assertStringIncludes(html, "finalizeAttempt");
  assertStringIncludes(
    html,
    "/runtime/sessions/runtime-session-123/files/__token__/runtime-token-123/dist/",
  );
  assertStringIncludes(
    html,
    "/runtime/sessions/runtime-session-123/attempt-events",
  );
  assertStringIncludes(html, "/runtime/sessions/runtime-session-123/finalize");
  assertEquals(bootstrap.session.expires_at, "2099-03-26T22:47:00Z");
  assertEquals(
    bootstrap.app.runtime_contract_signature,
    "test-reviewed-runtime-contract-signature",
  );
  assertEquals(
    html.includes("https://canvas.example/api/lti/courses/42/line_items"),
    false,
  );
  assertEquals(html.includes("names_and_roles"), false);
  await assertBootstrapSignature(bootstrap);
});

Deno.test("runtime content route serves reviewed activity content through the Lantern bridge", async () => {
  const content = (await loadRuntimeActivityContent(
    buildRuntimeSessionRecord({
      snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
      entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
      contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
    }),
  )) as { title: string; questions: Array<{ id: string }> };

  assertEquals(content.title, "Chapter 4 Asteroids");
  assertEquals(content.questions[0]?.id, "q1");
});

Deno.test("missing or expired runtime session tokens are blocked before artifact bytes are served", async () => {
  await assertRejects(
    () =>
      Promise.resolve().then(() =>
        authorizeRuntimeSession({
          token: "expired-session-token",
          expected: buildRuntimeSessionRecord({
            expiresAt: "2026-03-23T22:40:00Z",
          }),
          now: () => new Date("2026-03-23T22:45:00Z"),
        })
      ),
    Error,
    "Runtime session token did not match the requested session.",
  );
  await assertRejects(
    () =>
      Promise.resolve().then(() =>
        authorizeRuntimeSession({
          token: "runtime-token-123",
          expected: buildRuntimeSessionRecord({
            expiresAt: "2026-03-23T22:40:00Z",
          }),
          now: () => new Date("2026-03-23T22:45:00Z"),
        })
      ),
    Error,
    "Runtime session has expired.",
  );
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
    createLocalJWKSet(await getPublicJwkSet(TEST_SIGNING_ENV)),
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
