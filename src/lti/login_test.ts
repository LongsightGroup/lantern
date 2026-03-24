import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildCanvasLoginRequest,
  buildDeploymentBinding,
  buildLoginStateRecord,
} from "../test_helpers/lti.ts";

Deno.test.ignore("createLoginRedirect persists one-time state and redirects to the Canvas authorization endpoint", async () => {
  const binding = buildDeploymentBinding();
  const loginRequest = buildCanvasLoginRequest();
  const { createLoginRedirect } = await import("./login.ts");

  const result = await createLoginRedirect({
    binding,
    loginRequest,
  });

  assertStringIncludes(result.location, "https://sso.canvaslms.com/api/lti/authorize_redirect");
  assertStringIncludes(result.location, "response_type=id_token");
  assertStringIncludes(result.location, "response_mode=form_post");
  assertEquals(typeof result.loginState.state, "string");
  assertEquals(typeof result.loginState.nonce, "string");
});

Deno.test.ignore("unknown deployment binding blocks login initiation before redirect", async () => {
  const { createLoginRedirect } = await import("./login.ts");

  await createLoginRedirect({
    binding: buildDeploymentBinding({
      clientId: "missing-client",
      deploymentId: "missing-deployment",
    }),
    loginRequest: buildCanvasLoginRequest({
      clientId: "missing-client",
      deploymentId: "missing-deployment",
    }),
  });
});

Deno.test.ignore("login state records carry the expected target_link_uri and expiry window", () => {
  const record = buildLoginStateRecord();

  assertEquals(record.targetLinkUri, "http://localhost:8000/lti/launch");
  assertEquals(record.expiresAt > record.createdAt, true);
});
