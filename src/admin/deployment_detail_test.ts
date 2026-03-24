import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";
import { buildDeploymentBinding } from "../test_helpers/lti.ts";
import { renderDeploymentDetailPage } from "./deployment_detail.ts";

Deno.test.ignore("deployment page explains the single Canvas install path in plain language", () => {
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
    }),
  });

  assertStringIncludes(html, "Canvas install");
  assertStringIncludes(html, "config URL");
  assertStringIncludes(html, "Client ID");
  assertStringIncludes(html, "Deployment ID");
  assertStringIncludes(html, binding.issuer);
});

Deno.test.ignore("POST /admin/packages/:appId/deployment/install saves one exact Canvas binding", async () => {
  const { createApp } = await import("../app.ts");
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
  const formData = new FormData();

  formData.set("canvasEnvironment", "production");
  formData.set("clientId", "10000000000001");
  formData.set("deploymentId", "deployment-123");

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
});

Deno.test.ignore("duplicate issuer, client_id, and deployment_id bindings are rejected clearly", async () => {
  const { createApp } = await import("../app.ts");
  const formData = new FormData();

  formData.set("canvasEnvironment", "production");
  formData.set("clientId", "10000000000001");
  formData.set("deploymentId", "deployment-123");

  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
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
  assertStringIncludes(await response.text(), "already belongs to another deployment");
});
