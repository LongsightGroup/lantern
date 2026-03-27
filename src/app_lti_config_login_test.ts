import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import { CANVAS_LTI_SCOPES } from "./lti/types.ts";
import {
  buildDeploymentRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import {
  buildCanvasLoginRequest,
  buildDeploymentBinding,
  buildMoodleDeploymentBinding,
  buildSakaiDeploymentBinding,
  buildSakaiLoginRequest,
  getTestToolPrivateJwkEnvValue,
} from "./test_helpers/lti.ts";
import { restoreEnv } from "./app_test_support.ts";

Deno.test("GET /lti/canvas/config.json publishes the pilot Canvas config document", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  const previousJwk = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  Deno.env.set("APP_ORIGIN", "http://localhost:8417");
  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    const response = await createApp({
      getRepository: () => createInMemoryPackageReviewRepository(),
    }).request("http://localhost/lti/canvas/config.json");

    assertEquals(response.status, 200);
    const body = (await response.json()) as {
      oidc_initiation_url: string;
      scopes: string[];
      extensions: Array<
        { settings: { placements: Array<{ placement: string }> } }
      >;
    };

    assertEquals(typeof body.oidc_initiation_url, "string");
    assertEquals(body.scopes, [...CANVAS_LTI_SCOPES]);
    assertEquals(
      body.extensions[0]?.settings.placements[0]?.placement,
      "course_navigation",
    );
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousJwk);
  }
});

Deno.test("GET /lti/login persists login state and redirects to the Canvas authorization endpoint", async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [buildDeploymentRecord({ binding: buildDeploymentBinding() })],
  });
  const loginRequest = buildCanvasLoginRequest();
  const response = await createApp({
    getRepository: () => repository,
  }).request(
    `http://localhost/lti/login?iss=${
      encodeURIComponent(
        loginRequest.iss,
      )
    }&login_hint=${
      encodeURIComponent(
        loginRequest.loginHint,
      )
    }&target_link_uri=${
      encodeURIComponent(
        loginRequest.targetLinkUri,
      )
    }&client_id=${encodeURIComponent(loginRequest.clientId)}&deployment_id=${
      encodeURIComponent(
        loginRequest.deploymentId,
      )
    }&lti_message_hint=${
      encodeURIComponent(loginRequest.ltiMessageHint ?? "")
    }`,
  );

  assertEquals(response.status, 302);

  const location = response.headers.get("location");

  if (!location) {
    throw new Error("Expected Canvas authorization redirect location.");
  }

  const redirected = new URL(location);
  const state = redirected.searchParams.get("state");

  if (!state) {
    throw new Error("Expected saved login state in the Canvas redirect.");
  }

  const saved = await repository.getLoginStateByState(state);

  assertEquals(
    redirected.origin + redirected.pathname,
    "https://sso.canvaslms.com/api/lti/authorize_redirect",
  );
  assertEquals(saved?.clientId, loginRequest.clientId);
  assertEquals(saved?.deploymentId, loginRequest.deploymentId);
});

Deno.test("GET /lti/login accepts Sakai-style login initiation and redirects to the saved OIDC endpoint", async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildSakaiDeploymentBinding({
          issuer: "https://sakai.example",
          clientId: "7dbe6a13-f948-498c-87d7-768947ac5c56",
          deploymentId: "1",
        }),
      }),
    ],
  });
  const loginRequest = buildSakaiLoginRequest({
    iss: "https://sakai.example",
    clientId: "7dbe6a13-f948-498c-87d7-768947ac5c56",
    deploymentId: "1",
  });
  const response = await createApp({
    getRepository: () => repository,
  }).request(
    `http://localhost/lti/login?iss=${
      encodeURIComponent(loginRequest.iss)
    }&login_hint=${
      encodeURIComponent(loginRequest.loginHint)
    }&target_link_uri=${
      encodeURIComponent(loginRequest.targetLinkUri)
    }&client_id=${
      encodeURIComponent(loginRequest.clientId)
    }&lti_deployment_id=${encodeURIComponent(loginRequest.deploymentId)}`,
  );

  assertEquals(response.status, 302);

  const location = response.headers.get("location");

  if (!location) {
    throw new Error("Expected Sakai authorization redirect location.");
  }

  const redirected = new URL(location);
  const state = redirected.searchParams.get("state");

  if (!state) {
    throw new Error("Expected saved login state in the Sakai redirect.");
  }

  const saved = await repository.getLoginStateByState(state);

  assertEquals(
    redirected.origin + redirected.pathname,
    "https://sakai.example/imsoidc/lti13/oidc_auth",
  );
  assertEquals(saved?.lms, "sakai");
  assertEquals(saved?.canvasEnvironment, null);
  assertEquals(saved?.clientId, loginRequest.clientId);
  assertEquals(saved?.deploymentId, loginRequest.deploymentId);
});

Deno.test("GET /lti/login accepts Moodle-style login initiation and redirects to the saved authentication endpoint", async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildMoodleDeploymentBinding({
          issuer: "https://moodle.example",
          clientId: "moodle-client-123",
          deploymentId: "moodle-deployment-123",
        }),
      }),
    ],
  });
  const response = await createApp({
    getRepository: () => repository,
  }).request(
    "http://localhost/lti/login?iss=https%3A%2F%2Fmoodle.example&login_hint=opaque-login-hint&target_link_uri=http%3A%2F%2Flocalhost%3A8417%2Flti%2Flaunch&client_id=moodle-client-123&deployment_id=moodle-deployment-123",
  );

  assertEquals(response.status, 302);

  const location = response.headers.get("location");

  if (!location) {
    throw new Error("Expected Moodle authorization redirect location.");
  }

  const redirected = new URL(location);
  const state = redirected.searchParams.get("state");

  if (!state) {
    throw new Error("Expected saved login state in the Moodle redirect.");
  }

  const saved = await repository.getLoginStateByState(state);

  assertEquals(
    redirected.origin + redirected.pathname,
    "https://moodle.example/mod/lti/auth.php",
  );
  assertEquals(saved?.lms, "moodle");
  assertEquals(saved?.canvasEnvironment, null);
  assertEquals(saved?.clientId, "moodle-client-123");
  assertEquals(saved?.deploymentId, "moodle-deployment-123");
});

Deno.test("GET /lti/login rejects ambiguous platform identity before redirecting", async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        slug: "shared-moodle",
        binding: buildMoodleDeploymentBinding({
          issuer: "https://shared.example",
          clientId: "shared-client-123",
          deploymentId: "shared-deployment-123",
        }),
      }),
      buildDeploymentRecord({
        slug: "shared-sakai",
        binding: buildSakaiDeploymentBinding({
          issuer: "https://shared.example",
          clientId: "shared-client-123",
          deploymentId: "shared-deployment-123",
        }),
      }),
    ],
  });
  const response = await createApp({
    getRepository: () => repository,
  }).request(
    "http://localhost/lti/login?iss=https%3A%2F%2Fshared.example&login_hint=opaque-login-hint&target_link_uri=http%3A%2F%2Flocalhost%3A8417%2Flti%2Flaunch&client_id=shared-client-123&deployment_id=shared-deployment-123",
  );
  const body = await response.text();

  assertEquals(response.status, 409);
  assertEquals(response.headers.get("location"), null);
  assertStringIncludes(body, "Resolve the duplicate LMS bindings");
});
