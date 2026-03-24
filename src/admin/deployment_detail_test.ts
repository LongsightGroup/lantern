import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../app.ts";
import { resolveCanvasIssuer } from "../lti/config.ts";
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";
import { buildDeploymentBinding } from "../test_helpers/lti.ts";
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

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Deno.env.delete(name);
    return;
  }

  Deno.env.set(name, value);
}
