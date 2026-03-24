import { assertEquals, assertStringIncludes } from "@std/assert";
import { getTestToolPrivateJwkEnvValue } from "../test_helpers/lti.ts";

Deno.test("GET /lti/canvas/config.json publishes one supported Canvas config document", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  const previousJwk = Deno.env.get("LTI_TOOL_PRIVATE_JWK");

  Deno.env.set("APP_ORIGIN", "http://localhost:8000");
  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    const { createApp } = await import("../app.ts");
    const response = await createApp().request(
      "http://localhost/lti/canvas/config.json",
    );

    assertEquals(response.status, 200);

    const body = await response.text();

    assertStringIncludes(body, "\"oidc_initiation_url\"");
    assertStringIncludes(body, "\"target_link_uri\"");
    assertStringIncludes(body, "\"public_jwk_url\"");
    assertStringIncludes(body, "\"placements\"");
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousJwk);
  }
});

Deno.test("GET /lti/jwks.json exposes only the public Lantern tool JWK", async () => {
  const previousJwk = Deno.env.get("LTI_TOOL_PRIVATE_JWK");

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    const { createApp } = await import("../app.ts");
    const response = await createApp().request("http://localhost/lti/jwks.json");

    assertEquals(response.status, 200);

    const body = await response.text();

    assertStringIncludes(body, "\"keys\"");
    assertEquals(body.includes("\"d\""), false);
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousJwk);
  }
});

Deno.test("config document does not advertise unsupported Phase 2 scopes or placements", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  const previousJwk = Deno.env.get("LTI_TOOL_PRIVATE_JWK");

  Deno.env.set("APP_ORIGIN", "http://localhost:8000");
  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    const { buildCanvasConfigDocument } = await import("./config.ts");
    const document = await buildCanvasConfigDocument();

    assertEquals(Array.isArray(document.extensions), true);
    assertEquals(
      JSON.stringify(document).includes("contextmembership.readonly"),
      false,
    );
    assertEquals(JSON.stringify(document).includes("score"), false);
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousJwk);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Deno.env.delete(name);
    return;
  }

  Deno.env.set(name, value);
}
