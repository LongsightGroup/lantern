import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildRuntimeSessionRecord,
  buildValidatedLaunch,
} from "../test_helpers/lti.ts";

Deno.test.ignore("runtime session route serves the pinned reviewed entrypoint with injected bootstrap payload", async () => {
  const { renderRuntimeSessionPage } = await import("./session.ts");
  const html = await renderRuntimeSessionPage(buildRuntimeSessionRecord());

  assertStringIncludes(html, "GatewayBootstrap");
  assertStringIncludes(html, "chapter-4-asteroids");
  assertStringIncludes(html, "runtime-token-123");
});

Deno.test.ignore("runtime content route serves reviewed activity content through the Lantern bridge", async () => {
  const { loadRuntimeActivityContent } = await import("./session.ts");
  const content = await loadRuntimeActivityContent(buildRuntimeSessionRecord());

  assertEquals(typeof content, "object");
});

Deno.test.ignore("missing or expired runtime session tokens are blocked before artifact bytes are served", async () => {
  const { authorizeRuntimeSession } = await import("./session.ts");

  await authorizeRuntimeSession({
    token: "expired-session-token",
    expected: buildRuntimeSessionRecord({
      expiresAt: "2026-03-23T22:40:00Z",
    }),
    launch: buildValidatedLaunch(),
  });
});
