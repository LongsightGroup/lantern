import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import { resolveCanvasIssuer } from "./lti/config.ts";
import {
  buildDeploymentRecord,
  buildImportedPackageVersion,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import {
  buildCanvasLoginRequest,
  buildDeploymentBinding,
  buildLoginStateRecord,
  buildRuntimeSessionRecord,
  getTestCanvasJwks,
  getTestToolPrivateJwkEnvValue,
  signCanvasIdToken,
} from "./test_helpers/lti.ts";

const EXAMPLE_SNAPSHOT_ROOT = "examples/apps/chapter-4-asteroids";

Deno.test("GET / responds with html", async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/");

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("content-type"),
    "text/html; charset=UTF-8",
  );

  const body = await response.text();
  assertEquals(body.includes("Lantern"), true);
});

Deno.test("GET /health responds with ok", async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/health");

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-type"), "application/json");
  assertEquals(await response.json(), { ok: true });
});

Deno.test("GET /admin/packages renders the demo-first zero state when no versions exist", async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/admin/packages");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "Start with the demo app");
  assertStringIncludes(body, "Chapter 4 Asteroids");
  assertStringIncludes(body, "Import the demo learning game");
});

Deno.test("GET /admin/packages renders exact version rows and approval-state badges", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewNotes: "Ready for pilot.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
      buildPackageVersionRecord({
        id: 2,
        version: "0.2.0",
        approvalStatus: "pending",
      }),
    ],
  });
  const response = await createApp({
    getRepository: () => repository,
  }).request("http://localhost/admin/packages");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "<strong>Version</strong> 0.2.0");
  assertStringIncludes(body, "Pending review");
  assertStringIncludes(body, "Approved");
  assertStringIncludes(body, "Open dossier");
  assertStringIncludes(body, "Version picker");
});

Deno.test("POST /admin/packages/import-demo imports the demo package and redirects to the dossier", async () => {
  const repository = createInMemoryPackageReviewRepository();
  const app = createApp({
    getRepository: () => repository,
    importDemoPackage: () =>
      Promise.resolve(
        buildImportedPackageVersion({
          version: "0.1.0",
        }),
      ),
  });

  const response = await app.request(
    "http://localhost/admin/packages/import-demo",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
      },
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids/versions/0.1.0",
  );

  const saved = await repository.getPackageVersionByAppVersion(
    "chapter-4-asteroids",
    "0.1.0",
  );
  assertEquals(saved?.approvalStatus, "pending");
});

Deno.test("POST /admin/packages/:id/approve records notes and keeps status visible on reload", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [buildPackageVersionRecord({ id: 7 })],
  });
  const app = createApp({
    getRepository: () => repository,
  });
  const formData = new FormData();

  formData.set("reviewNotes", "Ready for the pilot deployment.");

  const response = await app.request(
    "http://localhost/admin/packages/7/approve",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
      },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids/versions/0.1.0",
  );

  const saved = await repository.getPackageVersionById(7);
  assertEquals(saved?.approvalStatus, "approved");
  assertEquals(saved?.reviewNotes, "Ready for the pilot deployment.");

  const detailResponse = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/versions/0.1.0",
  );
  const detailBody = await detailResponse.text();

  assertStringIncludes(detailBody, "Approved");
  assertStringIncludes(detailBody, "Ready for the pilot deployment.");
});

Deno.test("POST /admin/packages/:id/reject refuses to reverse a frozen decision", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 9,
        approvalStatus: "approved",
        reviewNotes: "Already approved.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
  });
  const app = createApp({
    getRepository: () => repository,
  });
  const formData = new FormData();

  const response = await app.request(
    "http://localhost/admin/packages/9/reject",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
      },
      body: formData,
    },
  );

  assertEquals(response.status, 409);
  const body = await response.text();

  assertStringIncludes(body, "Rejection blocked");
  assertStringIncludes(body, "already been reviewed and cannot change state");
});

Deno.test("POST /admin/packages/:appId/deployment/pin stores the exact approved version id", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: "approved",
        reviewNotes: "Ready for pilot.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
      buildPackageVersionRecord({
        id: 6,
        version: "0.2.0",
        approvalStatus: "pending",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        slug: "chapter-4-asteroids-pilot",
        label: "Chapter 4 Asteroids Pilot Deployment",
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
      }),
    ],
  });
  const app = createApp({
    getRepository: () => repository,
  });
  const formData = new FormData();

  formData.set("packageVersionId", "5");

  const response = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/deployment/pin",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
      },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids/deployment",
  );

  const deployment = await repository.getDeploymentBySlug(
    "chapter-4-asteroids-pilot",
  );
  assertEquals(deployment?.enabledPackageVersionId, 5);
  assertEquals(deployment?.enabledPackageVersion, "0.1.0");
});

Deno.test("POST /admin/packages/:appId/deployment/install saves the Canvas binding and redirects back to deployment detail", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  Deno.env.set("APP_ORIGIN", "http://localhost:8000");

  try {
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [
        buildPackageVersionRecord({
          id: 5,
          approvalStatus: "approved",
          reviewNotes: "Ready for pilot.",
          reviewedAt: "2026-03-23T18:05:00Z",
        }),
      ],
      deployments: [
        buildDeploymentRecord({
          id: 3,
          slug: "chapter-4-asteroids-pilot",
          label: "Chapter 4 Asteroids Pilot Deployment",
          enabledPackageVersionId: 5,
          enabledPackageVersion: "0.1.0",
        }),
      ],
    });
    const app = createApp({
      getRepository: () => repository,
    });
    const formData = new FormData();

    formData.set("canvasEnvironment", "production");
    formData.set("clientId", "10000000000001");
    formData.set("deploymentId", "deployment-123");

    const response = await app.request(
      "http://localhost/admin/packages/chapter-4-asteroids/deployment/install",
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
        },
        body: formData,
      },
    );

    assertEquals(response.status, 303);
    assertEquals(
      response.headers.get("location"),
      "/admin/packages/chapter-4-asteroids/deployment",
    );

    const deployment = await repository.getDeploymentBySlug(
      "chapter-4-asteroids-pilot",
    );
    assertEquals(
      deployment?.binding?.issuer,
      resolveCanvasIssuer("production"),
    );
    assertEquals(deployment?.binding?.clientId, "10000000000001");
    assertEquals(deployment?.binding?.deploymentId, "deployment-123");
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
  }
});

Deno.test("GET /admin/packages/:appId/deployment renders the Canvas install sequence and saved binding", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  Deno.env.set("APP_ORIGIN", "http://localhost:8000");

  try {
    const response = await createApp({
      getRepository: () =>
        createInMemoryPackageReviewRepository({
          packageVersions: [
            buildPackageVersionRecord({
              id: 5,
              approvalStatus: "approved",
              reviewNotes: "Ready for pilot.",
              reviewedAt: "2026-03-23T18:05:00Z",
            }),
          ],
          deployments: [
            buildDeploymentRecord({
              id: 3,
              slug: "chapter-4-asteroids-pilot",
              label: "Chapter 4 Asteroids Pilot Deployment",
              enabledPackageVersionId: 5,
              enabledPackageVersion: "0.1.0",
              binding: buildDeploymentBinding(),
            }),
          ],
        }),
    }).request(
      "http://localhost/admin/packages/chapter-4-asteroids/deployment",
    );

    assertEquals(response.status, 200);
    const body = await response.text();

    assertStringIncludes(body, "One supported setup path");
    assertStringIncludes(body, "Config URL");
    assertStringIncludes(body, "Canvas Client ID");
    assertStringIncludes(body, "Launch-ready configuration saved");
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
  }
});

Deno.test("GET /lti/canvas/config.json publishes the pilot Canvas config document", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  const previousJwk = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  Deno.env.set("APP_ORIGIN", "http://localhost:8000");
  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    const response = await createApp({
      getRepository: () => createInMemoryPackageReviewRepository(),
    }).request("http://localhost/lti/canvas/config.json");

    assertEquals(response.status, 200);
    const body = await response.text();

    assertStringIncludes(body, '"oidc_initiation_url"');
    assertStringIncludes(body, '"course_navigation"');
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousJwk);
  }
});

Deno.test("GET /lti/login persists login state and redirects to the Canvas authorization endpoint", async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding(),
      }),
    ],
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
      encodeURIComponent(loginRequest.targetLinkUri)
    }&client_id=${encodeURIComponent(loginRequest.clientId)}&deployment_id=${
      encodeURIComponent(loginRequest.deploymentId)
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

Deno.test("POST /lti/launch validates the signed launch and redirects to a runtime-session handoff", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: "approved",
        reviewNotes: "Ready for pilot.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        slug: "chapter-4-asteroids-pilot",
        label: "Chapter 4 Asteroids Pilot Deployment",
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        state: "state-launch-123",
        nonce: "nonce-launch-123",
        expiresAt: "2026-03-24T02:45:00Z",
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: "nonce-launch-123",
    audience: "10000000000001",
    issuedAt: "2026-03-24T00:45:00Z",
    expirationTime: "2h",
  });
  const formData = new FormData();

  formData.set("state", "state-launch-123");
  formData.set("id_token", idToken);

  await withFetchStub(
    () =>
      Promise.resolve(
        new Response(JSON.stringify(getTestCanvasJwks()), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      ),
    async () => {
      const response = await createApp({
        getRepository: () => repository,
      }).request("http://localhost/lti/launch", {
        method: "POST",
        body: formData,
      });

      assertEquals(response.status, 303);

      const location = response.headers.get("location");

      if (!location) {
        throw new Error("Expected runtime-session handoff redirect.");
      }

      assertStringIncludes(location, "/runtime/sessions/");
      assertStringIncludes(location, "token=");

      const sessionId = location.match(/\/runtime\/sessions\/([^?]+)/)?.[1];

      if (!sessionId) {
        throw new Error("Expected runtime session id in redirect.");
      }

      const saved = await repository.getRuntimeSessionById(sessionId);

      assertEquals(saved?.packageVersionId, 5);
      assertEquals(saved?.launch.userRole, "learner");
    },
  );
});

Deno.test("POST /lti/launch rejects bad signed launches before any runtime handoff", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: "approved",
        reviewNotes: "Ready for pilot.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        slug: "chapter-4-asteroids-pilot",
        label: "Chapter 4 Asteroids Pilot Deployment",
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        state: "state-invalid-launch",
        nonce: "nonce-invalid-launch",
        expiresAt: "2026-03-24T02:45:00Z",
      }),
    ],
  });
  const formData = new FormData();

  formData.set("state", "state-invalid-launch");
  formData.set(
    "id_token",
    await signCanvasIdToken({
      nonce: "nonce-invalid-launch",
      issuedAt: "2026-03-24T00:45:00Z",
      expirationTime: "2h",
    }),
  );

  await withFetchStub(
    () =>
      Promise.resolve(
        new Response(JSON.stringify({ keys: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      ),
    async () => {
      const response = await createApp({
        getRepository: () => repository,
      }).request("http://localhost/lti/launch", {
        method: "POST",
        body: formData,
      });
      const body = await response.text();

      assertEquals(response.status, 409);
      assertStringIncludes(
        body,
        "Launch id_token signature or issuer validation failed.",
      );
    },
  );
});

Deno.test("GET /runtime/sessions/:id serves the reviewed entrypoint with Lantern bootstrap injected", async () => {
  const response = await createApp({
    getRepository: () =>
      createInMemoryPackageReviewRepository({
        runtimeSessions: [
          buildRuntimeSessionRecord({
            snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
            entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
            contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
            expiresAt: "2026-03-24T02:45:00Z",
          }),
        ],
      }),
  }).request(
    "http://localhost/runtime/sessions/runtime-session-123?token=runtime-token-123",
  );

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "GatewayBootstrap");
  assertStringIncludes(body, "runtime-token-123");
  assertStringIncludes(
    body,
    "/runtime/sessions/runtime-session-123/files/dist/?token=runtime-token-123",
  );
});

Deno.test("GET /runtime/sessions/:id/content serves reviewed activity content through the scoped runtime bridge", async () => {
  const response = await createApp({
    getRepository: () =>
      createInMemoryPackageReviewRepository({
        runtimeSessions: [
          buildRuntimeSessionRecord({
            snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
            entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
            contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
            expiresAt: "2026-03-24T02:45:00Z",
          }),
        ],
      }),
  }).request("http://localhost/runtime/sessions/runtime-session-123/content", {
    headers: {
      Authorization: "Bearer runtime-token-123",
    },
  });

  assertEquals(response.status, 200);
  const body = await response.json() as {
    title: string;
    questions: Array<{ id: string }>;
  };

  assertEquals(body.title, "Chapter 4 Asteroids");
  assertEquals(body.questions[0]?.id, "q1");
});

Deno.test("GET /runtime/sessions/:id/files/* serves reviewed asset bytes and blocks bad tokens", async () => {
  const app = createApp({
    getRepository: () =>
      createInMemoryPackageReviewRepository({
        runtimeSessions: [
          buildRuntimeSessionRecord({
            snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
            entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
            contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
            expiresAt: "2026-03-24T02:45:00Z",
          }),
        ],
      }),
  });
  const goodResponse = await app.request(
    "http://localhost/runtime/sessions/runtime-session-123/files/dist/app.js?token=runtime-token-123",
  );
  const deniedResponse = await app.request(
    "http://localhost/runtime/sessions/runtime-session-123/files/dist/app.js?token=wrong-token",
  );

  assertEquals(goodResponse.status, 200);
  assertStringIncludes(await goodResponse.text(), "Attempt finalized");
  assertEquals(deniedResponse.status, 409);
  assertStringIncludes(
    await deniedResponse.text(),
    "Runtime session token did not match the requested session.",
  );
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Deno.env.delete(name);
    return;
  }

  Deno.env.set(name, value);
}

async function withFetchStub<T>(
  handler: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Response | Promise<Response>,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise.resolve(handler(input, init));

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
