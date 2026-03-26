import { assertEquals, assertRejects } from "@std/assert";
import { createLoginRedirect } from "./login.ts";
import {
  buildCanvasLoginRequest,
  buildDeploymentBinding,
} from "../test_helpers/lti.ts";
import {
  buildDeploymentRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";

Deno.test("createLoginRedirect persists one-time state and redirects to the Canvas authorization endpoint", async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding(),
      }),
    ],
  });
  const tokens = ["state-login-123", "nonce-login-123"];
  const result = await createLoginRedirect({
    repository,
    loginRequest: buildCanvasLoginRequest(),
    now: () => new Date("2026-03-23T22:45:00Z"),
    createOpaqueToken: () => {
      const next = tokens.shift();

      if (!next) {
        throw new Error("Expected another deterministic login token.");
      }

      return next;
    },
  });
  const location = new URL(result.location);
  const saved = await repository.getLoginStateByState("state-login-123");

  assertEquals(
    location.origin + location.pathname,
    "https://sso.canvaslms.com/api/lti/authorize_redirect",
  );
  assertEquals(location.searchParams.get("response_type"), "id_token");
  assertEquals(location.searchParams.get("response_mode"), "form_post");
  assertEquals(location.searchParams.get("scope"), "openid");
  assertEquals(location.searchParams.get("state"), "state-login-123");
  assertEquals(location.searchParams.get("nonce"), "nonce-login-123");
  assertEquals(saved?.state, "state-login-123");
  assertEquals(saved?.nonce, "nonce-login-123");
});

Deno.test("unknown deployment binding blocks login initiation before redirect", async () => {
  const repository = createInMemoryPackageReviewRepository();

  await assertRejects(
    () =>
      createLoginRedirect({
        repository,
        loginRequest: buildCanvasLoginRequest({
          clientId: "missing-client",
          deploymentId: "missing-deployment",
        }),
      }),
    Error,
    "Deployment missing-client / missing-deployment was not found",
  );
});

Deno.test("login state records carry the expected target_link_uri and expiry window", async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding(),
      }),
    ],
  });
  const result = await createLoginRedirect({
    repository,
    loginRequest: buildCanvasLoginRequest(),
    now: () => new Date("2026-03-23T22:45:00Z"),
    createOpaqueToken: () => crypto.randomUUID(),
  });

  assertEquals(
    result.loginState.targetLinkUri,
    "http://localhost:8417/lti/launch",
  );
  assertEquals(result.loginState.expiresAt > result.loginState.createdAt, true);
});

Deno.test("login state records preserve the dedicated deep-linking target_link_uri", async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding(),
      }),
    ],
  });
  const result = await createLoginRedirect({
    repository,
    loginRequest: buildCanvasLoginRequest({
      targetLinkUri: "http://localhost:8417/lti/deep-linking",
    }),
    now: () => new Date("2026-03-23T22:45:00Z"),
    createOpaqueToken: () => crypto.randomUUID(),
  });

  assertEquals(
    result.loginState.targetLinkUri,
    "http://localhost:8417/lti/deep-linking",
  );
  assertEquals(
    new URL(result.location).searchParams.get("redirect_uri"),
    "http://localhost:8417/lti/deep-linking",
  );
});
