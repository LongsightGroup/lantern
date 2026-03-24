import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../app.ts";
import { resolveCanvasIssuer } from "../lti/config.ts";
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";
import {
  buildDeploymentBinding,
  buildRuntimeSessionRecord,
  getTestToolPrivateJwkEnvValue,
} from "../test_helpers/lti.ts";
import { renderDeploymentDetailPage } from "./deployment_detail.ts";

Deno.test("deployment page explains the single Canvas install path in plain language", () => {
  const binding = buildDeploymentBinding();
  const html = renderDeploymentDetailPage({
    appId: "chapter-4-asteroids",
    appTitle: "Chapter 4 Asteroids",
    history: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployment: buildDeploymentRecord({
      enabledPackageVersionId: 1,
      enabledPackageVersion: "0.1.0",
      binding,
    }),
    canvasConfigUrl: "http://localhost:8000/lti/canvas/config.json",
    supportedCanvasEnvironments: [
      {
        id: "production",
        label: "Production Canvas",
        issuer: resolveCanvasIssuer("production"),
      },
    ],
  });

  assertStringIncludes(html, "One supported setup path");
  assertStringIncludes(html, "config URL");
  assertStringIncludes(html, "Client ID");
  assertStringIncludes(html, "Deployment ID");
  assertStringIncludes(html, binding.issuer);
});

Deno.test("deployment page shows the latest roster verification summary and action", () => {
  const html = renderDeploymentDetailPage({
    appId: "chapter-4-asteroids",
    appTitle: "Chapter 4 Asteroids",
    history: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployment: buildDeploymentRecord({
      enabledPackageVersionId: 1,
      enabledPackageVersion: "0.1.0",
      binding: buildDeploymentBinding(),
    }),
    nrpsVerification: {
      status: "succeeded",
      checkedAt: "2026-03-24T03:05:00Z",
      contextId: "course-42",
      memberCount: 2,
    },
    canvasConfigUrl: "http://localhost:8000/lti/canvas/config.json",
    supportedCanvasEnvironments: [
      {
        id: "production",
        label: "Production Canvas",
        issuer: resolveCanvasIssuer("production"),
      },
    ],
  });

  assertStringIncludes(html, "Roster access proof");
  assertStringIncludes(html, "Latest roster read succeeded");
  assertStringIncludes(html, "Verify roster access");
  assertStringIncludes(html, "course-42");
  assertStringIncludes(html, "2");
});

Deno.test("POST /admin/packages/:appId/deployment/install saves one exact Canvas binding", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
      }),
    ],
  });
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  const formData = new FormData();

  Deno.env.set("APP_ORIGIN", "http://localhost:8000");
  formData.set("canvasEnvironment", "production");
  formData.set("clientId", "10000000000001");
  formData.set("deploymentId", "deployment-123");

  try {
    const response = await createApp({
      getRepository: () => repository,
    }).request(
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
    assertEquals(deployment?.binding?.clientId, "10000000000001");
    assertEquals(deployment?.binding?.deploymentId, "deployment-123");
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
  }
});

Deno.test("duplicate issuer, client_id, and deployment_id bindings are rejected clearly", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  const formData = new FormData();

  Deno.env.set("APP_ORIGIN", "http://localhost:8000");
  formData.set("canvasEnvironment", "production");
  formData.set("clientId", "10000000000001");
  formData.set("deploymentId", "deployment-123");

  try {
    const response = await createApp({
      getRepository: () =>
        createInMemoryPackageReviewRepository({
          packageVersions: [
            buildPackageVersionRecord({
              id: 1,
              approvalStatus: "approved",
              reviewedAt: "2026-03-23T18:05:00Z",
            }),
          ],
          deployments: [
            buildDeploymentRecord({
              slug: "second-app-pilot",
              label: "Second App Pilot Deployment",
              appId: "second-app",
              binding: buildDeploymentBinding(),
            }),
          ],
        }),
    }).request(
      "http://localhost/admin/packages/chapter-4-asteroids/deployment/install",
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
        },
        body: formData,
      },
    );

    assertEquals(response.status, 409);
    assertStringIncludes(
      await response.text(),
      "already belongs to another deployment",
    );
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
  }
});

Deno.test("POST /admin/packages/:appId/deployment/verify-roster stores a deployment-level NRPS verification summary", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        expiresAt: "2026-03-25T02:45:00Z",
      }),
    ],
  });

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    await withFetchStub((input) => {
      const url = String(input);

      if (url === "https://sso.canvaslms.com/login/oauth2/token") {
        return new Response(
          JSON.stringify({
            access_token: "canvas-access-token",
            token_type: "bearer",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          members: [
            {
              user_id: "canvas-user-123",
              roles: ["Learner"],
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }, async () => {
      const response = await createApp({
        getRepository: () => repository,
      }).request(
        "http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-roster",
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
        "/admin/packages/chapter-4-asteroids/deployment",
      );

      const auditEvents = await repository.listAuditEventsByEventType(
        "deployment.nrps_verified",
      );

      assertEquals(auditEvents.length, 1);
      assertEquals(auditEvents[0]?.status, "succeeded");
      assertEquals(auditEvents[0]?.detail.memberCount, 1);
    });
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});

Deno.test("deployment roster verification fails clearly when no launch service context exists yet", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request(
    "http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-roster",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
      },
    },
  );
  const body = await response.text();

  assertEquals(response.status, 409);
  assertStringIncludes(
    body,
    "Launch the deployment from Canvas once before verifying roster access.",
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
