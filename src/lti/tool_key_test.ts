import { assertEquals, assertRejects } from "@std/assert";
import { getTestToolPrivateJwkEnvValue } from "../test_helpers/lti.ts";
import { getPublicJwkSet, loadToolSigningKey } from "./tool_key.ts";

Deno.test("loadToolSigningKey accepts one RS256 private JWK and projects a public JWKS view", async () => {
  const env = createEnvReader({
    LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue(),
  });

  const loaded = await loadToolSigningKey(env);
  const jwks = await getPublicJwkSet(env);

  assertEquals(loaded.privateJwk.kty, "RSA");
  assertEquals(loaded.publicJwk.alg, "RS256");
  assertEquals(jwks.keys.length, 1);
  assertEquals("d" in jwks.keys[0]!, false);
});

Deno.test("loadToolSigningKey rejects non-RSA tool keys", async () => {
  const env = createEnvReader({
    LTI_TOOL_PRIVATE_JWK: JSON.stringify({
      kty: "EC",
      crv: "P-256",
      x: "x",
      y: "y",
      d: "d",
    }),
  });

  await assertRejects(
    () => loadToolSigningKey(env),
    Error,
    "must use kty=RSA",
  );
});

function createEnvReader(
  values: Record<string, string>,
): { get(name: string): string | undefined } {
  return {
    get(name: string) {
      return values[name];
    },
  };
}
