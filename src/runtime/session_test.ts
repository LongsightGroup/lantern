import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { compactVerify, createLocalJWKSet } from "jose";
import type { BootstrapPayload } from "../../sdk/app-sdk.ts";
import { getPublicJwkSet } from "../lti/tool_key.ts";
import {
  createR2RuntimeArtifactStore,
  type RuntimeArtifactBucket,
} from "./artifact_store.ts";
import { getDefaultRuntimeArtifactStore } from "./artifact_store_fs.ts";
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
const WORKER_SNAPSHOT_ROOT = "var/packages/chapter-4-asteroids/1.0.0";
const fileSystemArtifactStore = getDefaultRuntimeArtifactStore();
const TEST_SIGNING_ENV = {
  get(name: string): string | undefined {
    return name === "LTI_TOOL_PRIVATE_JWK"
      ? getTestToolPrivateJwkEnvValue()
      : name === "APP_RUNTIME_ORIGIN"
      ? "https://runtime.lantern.example"
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
      artifactStore: fileSystemArtifactStore,
    },
  );
  const bootstrap = extractBootstrapFromHtml(html);

  assertStringIncludes(html, "GatewayBootstrap");
  assertStringIncludes(html, "chapter-4-asteroids");
  assertStringIncludes(html, "runtime-token-123");
  assertStringIncludes(html, "emitAttemptEvent");
  assertStringIncludes(html, "submitScoreProposal");
  assertStringIncludes(html, "finalizeAttempt");
  assertStringIncludes(html, "runBrowserGrader");
  assertStringIncludes(html, "readLocalState");
  assertStringIncludes(html, "writeLocalState");
  assertStringIncludes(
    html,
    "https://runtime.lantern.example/runtime/sessions/runtime-session-123/files/__token__/runtime-token-123/dist/",
  );
  assertStringIncludes(
    html,
    "https://runtime.lantern.example/runtime/sessions/runtime-session-123/attempt-events",
  );
  assertStringIncludes(
    html,
    "https://runtime.lantern.example/runtime/sessions/runtime-session-123/finalize",
  );
  assertStringIncludes(
    html,
    "https://runtime.lantern.example/runtime/sessions/runtime-session-123/browser-grader/jasmine.js",
  );
  assertStringIncludes(
    html,
    "https://runtime.lantern.example/runtime/sessions/runtime-session-123/browser-grader/runner.js",
  );
  assertStringIncludes(
    html,
    "https://runtime.lantern.example/runtime/sessions/runtime-session-123/content",
  );
  assertStringIncludes(
    html,
    "https://runtime.lantern.example/runtime/sessions/runtime-session-123/local-state",
  );
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
    fileSystemArtifactStore,
  )) as { title: string; questions: Array<{ id: string }> };

  assertEquals(content.title, "Chapter 4 Asteroids");
  assertEquals(content.questions[0]?.id, "q1");
});

Deno.test("runtime session helpers can load reviewed artifacts from an R2-backed store", async () => {
  const artifactStore = createR2RuntimeArtifactStore(
    createTestRuntimeArtifactBucket({
      [`${WORKER_SNAPSHOT_ROOT}/dist/index.html`]:
        "<html><head></head><body>Worker Artifact</body></html>",
      [`${WORKER_SNAPSHOT_ROOT}/content/activity.json`]:
        '{"title":"Worker Artifact","questions":[{"id":"worker-q1"}]}',
    }),
  );
  const session = buildRuntimeSessionRecord({
    snapshotRoot: WORKER_SNAPSHOT_ROOT,
    entrypointPath: `${WORKER_SNAPSHOT_ROOT}/dist/index.html`,
    contentPath: `${WORKER_SNAPSHOT_ROOT}/content/activity.json`,
  });
  const html = await renderRuntimeSessionPage(session, {
    runtimeContractSignature: "test-reviewed-runtime-contract-signature",
    env: TEST_SIGNING_ENV,
    artifactStore,
  });
  const content =
    (await loadRuntimeActivityContent(session, artifactStore)) as {
      title: string;
      questions: Array<{ id: string }>;
    };

  assertStringIncludes(html, "Worker Artifact");
  assertStringIncludes(html, "GatewayBootstrap");
  assertEquals(content.title, "Worker Artifact");
  assertEquals(content.questions[0]?.id, "worker-q1");
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

function createTestRuntimeArtifactBucket(
  files: Record<string, string>,
): RuntimeArtifactBucket {
  const encodedFiles = new Map(
    Object.entries(files).map((
      [path, contents],
    ) => [path, new TextEncoder().encode(contents)]),
  );

  return {
    get(key: string) {
      const bytes = encodedFiles.get(key);

      if (bytes === undefined) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        arrayBuffer() {
          return Promise.resolve(bytes.slice().buffer);
        },
      });
    },
  };
}
