import { assertEquals, assertStringIncludes } from "@std/assert";
import { CANVAS_LTI_SCOPES } from "./types.ts";
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

    const body = await response.json() as {
      oidc_initiation_url: string;
      target_link_uri: string;
      public_jwk_url: string;
      scopes: string[];
      extensions: unknown[];
    };

    assertEquals(typeof body.oidc_initiation_url, "string");
    assertEquals(typeof body.target_link_uri, "string");
    assertEquals(typeof body.public_jwk_url, "string");
    assertEquals(body.scopes, [...CANVAS_LTI_SCOPES]);
    assertEquals(Array.isArray(body.extensions), true);
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
    const response = await createApp().request(
      "http://localhost/lti/jwks.json",
    );

    assertEquals(response.status, 200);

    const body = await response.text();

    assertStringIncludes(body, '"keys"');
    assertEquals(body.includes('"d"'), false);
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousJwk);
  }
});

Deno.test("config document advertises exactly the Phase 3 AGS and NRPS scopes", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  const previousJwk = Deno.env.get("LTI_TOOL_PRIVATE_JWK");

  Deno.env.set("APP_ORIGIN", "http://localhost:8000");
  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    const { buildCanvasConfigDocument } = await import("./config.ts");
    const document = await buildCanvasConfigDocument();

    assertEquals(Array.isArray(document.extensions), true);
    assertEquals(document.scopes, [...CANVAS_LTI_SCOPES]);
    assertEquals(
      document.scopes.includes(
        "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly",
      ),
      false,
    );
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
