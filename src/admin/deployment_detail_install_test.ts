import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../app.ts";
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";
import { buildDeploymentBinding } from "../test_helpers/lti.ts";
import { restoreEnv } from "./deployment_detail_test_helpers.ts";

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
  formData.set("lms", "canvas");
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
  formData.set("lms", "canvas");
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

Deno.test("POST /admin/packages/:appId/deployment/install requires the exact Moodle binding fields", async () => {
  const formData = new FormData();

  formData.set("lms", "moodle");
  formData.set("issuer", "https://moodle.example");
  formData.set("clientId", "moodle-client-123");
  formData.set("deploymentId", "moodle-deployment-123");
  formData.set("accessTokenUrl", "https://moodle.example/mod/lti/token.php");
  formData.set("jwksUrl", "https://moodle.example/mod/lti/certs.php");

  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
  });

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

  assertEquals(response.status, 409);
  assertStringIncludes(
    await response.text(),
    "Moodle Authentication request URL is required.",
  );
  assertEquals(
    await repository.getDeploymentBySlug("chapter-4-asteroids-moodle"),
    null,
  );
});

Deno.test("POST /admin/packages/:appId/deployment/install requires the exact Sakai binding fields", async () => {
  const formData = new FormData();

  formData.set("lms", "sakai");
  formData.set("issuer", "https://sakai.example");
  formData.set("clientId", "sakai-client-123");
  formData.set("deploymentId", "sakai-deployment-123");
  formData.set(
    "accessTokenUrl",
    "https://sakai.example/imsti/sakai_access_token",
  );
  formData.set("jwksUrl", "https://sakai.example/imsti/sakai_jwks");

  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
  });

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

  assertEquals(response.status, 409);
  assertStringIncludes(
    await response.text(),
    "Sakai OIDC authentication URL is required.",
  );
  assertEquals(
    await repository.getDeploymentBySlug("chapter-4-asteroids-sakai"),
    null,
  );
});
