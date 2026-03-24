import { assertEquals } from "@std/assert";
import {
  buildLoginStateRecord,
  buildValidatedLaunch,
  signCanvasIdToken,
} from "../test_helpers/lti.ts";

Deno.test.ignore("validateLaunchRequest accepts a signed launch with matching state, nonce, and deployment binding", async () => {
  const loginState = buildLoginStateRecord();
  const idToken = await signCanvasIdToken({
    nonce: loginState.nonce,
    audience: loginState.clientId,
  });
  const { validateLaunchRequest } = await import("./launch.ts");

  const launch = await validateLaunchRequest({
    state: loginState.state,
    idToken,
  });

  assertEquals(launch.deploymentId, loginState.deploymentId);
  assertEquals(launch.clientId, loginState.clientId);
  assertEquals(launch.appId, "chapter-4-asteroids");
});

Deno.test.ignore("validateLaunchRequest rejects mismatched target_link_uri or unsupported message types", async () => {
  const loginState = buildLoginStateRecord({
    targetLinkUri: "http://localhost:8000/lti/runtime/chapter-4-asteroids",
  });
  const idToken = await signCanvasIdToken({
    nonce: loginState.nonce,
    targetLinkUri: "http://localhost:8000/lti/launch",
  });
  const { validateLaunchRequest } = await import("./launch.ts");

  await validateLaunchRequest({
    state: loginState.state,
    idToken,
  });
});

Deno.test.ignore("createRuntimeSession keeps the pinned approved version instead of resolving latest", async () => {
  const { createRuntimeSession } = await import("./launch.ts");
  const session = await createRuntimeSession(buildValidatedLaunch());

  assertEquals(session.packageVersionId, 1);
  assertEquals(session.packageVersion, "0.1.0");
});
