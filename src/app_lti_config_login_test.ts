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
  TEST_NOW,
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
    assertEquals(
      body.extensions[0]?.settings.placements.some((placement) =>
        placement.placement === "resource_selection"
      ),
      true,
    );
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousJwk);
  }
});

Deno.test("GET /lti/canvas/config.json uses the forwarded public origin when Lantern runs behind a proxy", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  const previousJwk = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  Deno.env.delete("APP_ORIGIN");
  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    const response = await createApp({
      getRepository: () => createInMemoryPackageReviewRepository(),
    }).request("http://worker.internal/lti/canvas/config.json", {
      headers: {
        "x-forwarded-host": "lantern.example",
        "x-forwarded-proto": "https",
      },
    });

    assertEquals(response.status, 200);
    const body = (await response.json()) as {
      oidc_initiation_url: string;
      target_link_uri: string;
      redirect_uris: string[];
    };

    assertEquals(body.oidc_initiation_url, "https://lantern.example/lti/login");
    assertEquals(body.target_link_uri, "https://lantern.example/lti/launch");
    assertEquals(
      body.redirect_uris.includes("https://lantern.example/lti/launch"),
      true,
    );
    assertEquals(
      body.redirect_uris.includes(
        "https://lantern.example/lti/deep-linking?placement=resource_selection",
      ),
      true,
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
        loginRequest.targetLinkUri ?? "",
      )
    }&client_id=${
      encodeURIComponent(loginRequest.clientId ?? "")
    }&deployment_id=${
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

Deno.test("GET /lti/login returns a top-level launch escape page for iframe-embedded initiation", async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [buildDeploymentRecord({ binding: buildDeploymentBinding() })],
  });
  const loginRequest = buildCanvasLoginRequest();
  const response = await createApp({
    getRepository: () => repository,
  }).request(
    `http://localhost/lti/login?iss=${
      encodeURIComponent(loginRequest.iss)
    }&login_hint=${
      encodeURIComponent(loginRequest.loginHint)
    }&target_link_uri=${
      encodeURIComponent(loginRequest.targetLinkUri ?? "")
    }&client_id=${
      encodeURIComponent(loginRequest.clientId ?? "")
    }&deployment_id=${encodeURIComponent(loginRequest.deploymentId)}`,
    {
      headers: {
        "sec-fetch-dest": "iframe",
      },
    },
  );
  const body = await response.text();

  assertEquals(response.status, 200);
  assertStringIncludes(body, "Continue the LMS launch");
  assertStringIncludes(body, "window.top.location");
  assertStringIncludes(body, "Continue launch");

  const interopEvents = await repository.listAuditEventsByEventType(
    "interop.path_used",
  );
  assertEquals(
    interopEvents.some((event) =>
      event.detail.path === "iframe_top_level_escape"
    ),
    true,
  );
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
      encodeURIComponent(
        loginRequest.iss,
      )
    }&login_hint=${
      encodeURIComponent(
        loginRequest.loginHint,
      )
    }&target_link_uri=${
      encodeURIComponent(
        loginRequest.targetLinkUri ?? "",
      )
    }&client_id=${
      encodeURIComponent(
        loginRequest.clientId ?? "",
      )
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
  assertEquals(saved?.clientId, loginRequest.clientId ?? null);
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

Deno.test("GET /lti/login tolerates one extra percent-encoding layer on opaque LMS hints", async () => {
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
    "http://localhost/lti/login?iss=https%3A%2F%2Fmoodle.example&login_hint=opaque%252Flogin%253Fhint&target_link_uri=http%3A%2F%2Flocalhost%3A8417%2Flti%2Flaunch&client_id=moodle-client-123&deployment_id=moodle-deployment-123&lti_message_hint=context%2523value",
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
  const interopEvents = await repository.listAuditEventsByEventType(
    "interop.path_used",
  );

  assertEquals(redirected.searchParams.get("login_hint"), "opaque/login?hint");
  assertEquals(saved?.loginHint, "opaque/login?hint");
  assertEquals(saved?.ltiMessageHint, "context#value");
  assertEquals(
    interopEvents.some((event) =>
      event.detail.path === "opaque_login_hint_decode"
    ),
    true,
  );
  assertEquals(
    interopEvents.some((event) =>
      event.detail.path === "opaque_lti_message_hint_decode"
    ),
    true,
  );
});

Deno.test("GET /lti/login applies deployment override compatibility behavior only after resolving the saved deployment", async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildMoodleDeploymentBinding({
          issuer: "https://moodle.example",
          clientId: "moodle-client-123",
          deploymentId: "moodle-deployment-123",
        }),
        ltiProfileOverride: "governedCompatibility",
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: "certification",
      updatedAt: TEST_NOW,
    },
  });
  const response = await createApp({
    getRepository: () => repository,
  }).request(
    "http://localhost/lti/login?iss=https%3A%2F%2Fmoodle.example&login_hint=opaque%252Flogin%253Fhint&client_id=moodle-client-123&deployment_id=moodle-deployment-123&lti_message_hint=context%2523value",
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
  const interopEvents = await repository.listAuditEventsByEventType(
    "interop.path_used",
  );

  assertEquals(redirected.searchParams.get("login_hint"), "opaque/login?hint");
  assertEquals(saved?.loginHint, "opaque/login?hint");
  assertEquals(saved?.ltiMessageHint, "context#value");
  assertEquals(saved?.targetLinkUri, "http://localhost/lti/launch");
  assertEquals(
    interopEvents.some((event) =>
      event.detail.path === "opaque_login_hint_decode" &&
      event.detail.ltiProfileId === "governedCompatibility" &&
      event.detail.ltiProfileSource === "deploymentOverride"
    ),
    true,
  );
  assertEquals(
    interopEvents.some((event) =>
      event.detail.path === "opaque_lti_message_hint_decode" &&
      event.detail.ltiProfileId === "governedCompatibility" &&
      event.detail.ltiProfileSource === "deploymentOverride"
    ),
    true,
  );
  assertEquals(
    interopEvents.some((event) =>
      event.detail.path === "platform_default_launch_target" &&
      event.detail.ltiProfileId === "governedCompatibility" &&
      event.detail.ltiProfileSource === "deploymentOverride"
    ),
    true,
  );
});

Deno.test("GET /lti/login rejects opaque hint compatibility decoding when the resolved profile is certification", async () => {
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
    lanternLtiProfileSettings: {
      defaultLtiProfile: "certification",
      updatedAt: TEST_NOW,
    },
  });
  const response = await createApp({
    getRepository: () => repository,
  }).request(
    "http://localhost/lti/login?iss=https%3A%2F%2Fmoodle.example&login_hint=opaque%252Flogin%253Fhint&target_link_uri=http%3A%2F%2Flocalhost%3A8417%2Flti%2Flaunch&client_id=moodle-client-123&deployment_id=moodle-deployment-123&lti_message_hint=context%2523value",
  );
  const body = await response.text();
  const interopEvents = await repository.listAuditEventsByEventType(
    "interop.path_used",
  );

  assertEquals(response.status, 409);
  assertStringIncludes(body, "active LTI profile does not allow opaque");
  assertEquals(interopEvents.length, 0);
});

Deno.test("GET /lti/login falls back to Lantern's singular launch route when a non-Canvas LMS omits target_link_uri", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  Deno.env.set("APP_ORIGIN", "http://localhost:8417");

  try {
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
      "http://localhost/lti/login?iss=https%3A%2F%2Fmoodle.example&login_hint=opaque-login-hint&client_id=moodle-client-123&deployment_id=moodle-deployment-123",
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
      redirected.searchParams.get("redirect_uri"),
      "http://localhost:8417/lti/launch",
    );
    assertEquals(saved?.targetLinkUri, "http://localhost:8417/lti/launch");
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
  }
});

Deno.test("GET /lti/login rejects an omitted non-Canvas target_link_uri when the resolved profile is certification", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  Deno.env.set("APP_ORIGIN", "http://localhost:8417");

  try {
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
      lanternLtiProfileSettings: {
        defaultLtiProfile: "certification",
        updatedAt: TEST_NOW,
      },
    });
    const response = await createApp({
      getRepository: () => repository,
    }).request(
      "http://localhost/lti/login?iss=https%3A%2F%2Fmoodle.example&login_hint=opaque-login-hint&client_id=moodle-client-123&deployment_id=moodle-deployment-123",
    );
    const body = await response.text();
    const interopEvents = await repository.listAuditEventsByEventType(
      "interop.path_used",
    );

    assertEquals(response.status, 409);
    assertStringIncludes(body, "active LTI profile requires target_link_uri");
    assertEquals(interopEvents.length, 0);
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
  }
});

Deno.test("GET /lti/login uses the forwarded public origin when Lantern fills a missing non-Canvas target_link_uri", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  Deno.env.delete("APP_ORIGIN");

  try {
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
      "http://worker.internal/lti/login?iss=https%3A%2F%2Fmoodle.example&login_hint=opaque-login-hint&client_id=moodle-client-123&deployment_id=moodle-deployment-123",
      {
        headers: {
          "x-forwarded-host": "lantern.example",
          "x-forwarded-proto": "https",
        },
      },
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
      redirected.searchParams.get("redirect_uri"),
      "https://lantern.example/lti/launch",
    );
    assertEquals(saved?.targetLinkUri, "https://lantern.example/lti/launch");
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
  }
});

Deno.test("GET /lti/login still rejects an omitted Canvas target_link_uri when more than one Lantern callback route is possible", async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [buildDeploymentRecord({ binding: buildDeploymentBinding() })],
  });
  const response = await createApp({
    getRepository: () => repository,
  }).request(
    "http://localhost/lti/login?iss=https%3A%2F%2Fcanvas.instructure.com&login_hint=opaque-login-hint&client_id=10000000000001&deployment_id=deployment-123",
  );
  const body = await response.text();

  assertEquals(response.status, 409);
  assertStringIncludes(
    body,
    "Canvas launches use more than one Lantern callback route",
  );
});

Deno.test("GET /lti/login recovers when client_id is omitted but issuer and deployment_id still identify one binding", async () => {
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
    "http://localhost/lti/login?iss=https%3A%2F%2Fmoodle.example&login_hint=opaque-login-hint&target_link_uri=http%3A%2F%2Flocalhost%3A8417%2Flti%2Flaunch&deployment_id=moodle-deployment-123",
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

  assertEquals(redirected.searchParams.get("client_id"), "moodle-client-123");
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

Deno.test("GET /lti/login fails clearly when Canvas sends a different deployment_id than the saved binding", async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding({
          deploymentId: "saved-deployment-123",
        }),
      }),
    ],
  });
  const response = await createApp({
    getRepository: () => repository,
  }).request(
    "http://localhost/lti/login?iss=https%3A%2F%2Fcanvas.instructure.com&login_hint=opaque-login-hint&target_link_uri=http%3A%2F%2Flocalhost%3A8417%2Flti%2Flaunch&client_id=10000000000001&deployment_id=other-deployment-999",
  );
  const body = await response.text();

  assertEquals(response.status, 409);
  assertStringIncludes(body, "Canvas sent deployment other-deployment-999");
  assertStringIncludes(body, "saved deployment saved-deployment-123");
});
