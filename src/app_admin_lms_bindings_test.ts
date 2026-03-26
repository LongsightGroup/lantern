import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import {
  buildCanvasDeploymentBinding,
  buildMoodleDeploymentBinding,
  buildSakaiDeploymentBinding,
} from "./test_helpers/lti.ts";

Deno.test("POST /admin/packages/:appId/deployment/install saves the Moodle binding without mutating Canvas or Sakai slots", async () => {
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
        binding: buildCanvasDeploymentBinding(),
      }),
      buildDeploymentRecord({
        id: 4,
        slug: "chapter-4-asteroids-sakai",
        label: "Chapter 4 Asteroids Sakai Deployment",
        binding: buildSakaiDeploymentBinding(),
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("lms", "moodle");
  formData.set("issuer", "https://moodle.example");
  formData.set("clientId", "moodle-client-999");
  formData.set("deploymentId", "moodle-deployment-999");
  formData.set(
    "authenticationRequestUrl",
    "https://moodle.example/mod/lti/auth.php",
  );
  formData.set("accessTokenUrl", "https://moodle.example/mod/lti/token.php");
  formData.set("jwksUrl", "https://moodle.example/mod/lti/certs.php");

  const response = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/deployment/install",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids/deployment?lms=moodle#slot-panel",
  );

  const canvas = await repository.getDeploymentBySlug(
    "chapter-4-asteroids-pilot",
  );
  const moodle = await repository.getDeploymentBySlug(
    "chapter-4-asteroids-moodle",
  );
  const sakai = await repository.getDeploymentBySlug(
    "chapter-4-asteroids-sakai",
  );

  assertEquals(canvas?.binding?.lms, "canvas");
  assertEquals(canvas?.binding?.clientId, "10000000000001");
  assertEquals(moodle?.binding?.lms, "moodle");
  assertEquals(moodle?.binding?.issuer, "https://moodle.example");
  assertEquals(
    moodle?.binding?.lms === "moodle"
      ? moodle.binding.authenticationRequestUrl
      : null,
    "https://moodle.example/mod/lti/auth.php",
  );
  assertEquals(sakai?.binding?.lms, "sakai");

  const auditEvents = await repository.listAuditEventsByEventType(
    "deployment.binding_saved",
  );
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.detail.lms, "moodle");
  assertEquals(
    auditEvents[0]?.detail.deploymentSlug,
    "chapter-4-asteroids-moodle",
  );
});

Deno.test("POST /admin/packages/:appId/deployment/install saves the Sakai binding without mutating Canvas or Moodle slots", async () => {
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
        binding: buildCanvasDeploymentBinding(),
      }),
      buildDeploymentRecord({
        id: 4,
        slug: "chapter-4-asteroids-moodle",
        label: "Chapter 4 Asteroids Moodle Deployment",
        binding: buildMoodleDeploymentBinding(),
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("lms", "sakai");
  formData.set("issuer", "https://sakai.example");
  formData.set("clientId", "sakai-client-999");
  formData.set("deploymentId", "sakai-deployment-999");
  formData.set(
    "oidcAuthenticationUrl",
    "https://sakai.example/imsoidc/lti13/oidc_auth",
  );
  formData.set(
    "accessTokenUrl",
    "https://sakai.example/imsblis/lti13/token/3",
  );
  formData.set("jwksUrl", "https://sakai.example/imsblis/lti13/keyset");

  const response = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/deployment/install",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );

  assertEquals(response.status, 303);

  const canvas = await repository.getDeploymentBySlug(
    "chapter-4-asteroids-pilot",
  );
  const moodle = await repository.getDeploymentBySlug(
    "chapter-4-asteroids-moodle",
  );
  const sakai = await repository.getDeploymentBySlug(
    "chapter-4-asteroids-sakai",
  );

  assertEquals(canvas?.binding?.lms, "canvas");
  assertEquals(moodle?.binding?.lms, "moodle");
  assertEquals(sakai?.binding?.lms, "sakai");
  assertEquals(sakai?.binding?.issuer, "https://sakai.example");
  assertEquals(
    sakai?.binding?.lms === "sakai"
      ? sakai.binding.oidcAuthenticationUrl
      : null,
    "https://sakai.example/imsoidc/lti13/oidc_auth",
  );

  const auditEvents = await repository.listAuditEventsByEventType(
    "deployment.binding_saved",
  );
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.detail.lms, "sakai");
  assertEquals(
    auditEvents[0]?.detail.deploymentSlug,
    "chapter-4-asteroids-sakai",
  );
});

Deno.test("POST /admin/packages/:appId/deployment/pin pins the selected LMS slot and records its identity", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        version: "0.1.0",
        approvalStatus: "approved",
        reviewNotes: "Ready for pilot.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
      buildPackageVersionRecord({
        id: 6,
        version: "0.2.0",
        approvalStatus: "approved",
        reviewNotes: "Ready for second slot.",
        reviewedAt: "2026-03-24T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        slug: "chapter-4-asteroids-pilot",
        label: "Chapter 4 Asteroids Pilot Deployment",
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
        binding: buildCanvasDeploymentBinding(),
      }),
      buildDeploymentRecord({
        id: 4,
        slug: "chapter-4-asteroids-moodle",
        label: "Chapter 4 Asteroids Moodle Deployment",
        enabledPackageVersionId: null,
        enabledPackageVersion: null,
        binding: buildMoodleDeploymentBinding(),
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("lms", "moodle");
  formData.set("packageVersionId", "6");

  const response = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/deployment/pin",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );

  assertEquals(response.status, 303);

  const canvas = await repository.getDeploymentBySlug(
    "chapter-4-asteroids-pilot",
  );
  const moodle = await repository.getDeploymentBySlug(
    "chapter-4-asteroids-moodle",
  );

  assertEquals(canvas?.enabledPackageVersionId, 5);
  assertEquals(canvas?.enabledPackageVersion, "0.1.0");
  assertEquals(moodle?.enabledPackageVersionId, 6);
  assertEquals(moodle?.enabledPackageVersion, "0.2.0");

  const auditEvents = await repository.listAuditEventsByEventType(
    "deployment.version_pinned",
  );
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.detail.lms, "moodle");
  assertEquals(
    auditEvents[0]?.detail.deploymentSlug,
    "chapter-4-asteroids-moodle",
  );
  assertEquals(auditEvents[0]?.packageVersionId, 6);
});

Deno.test("POST /admin/packages/:appId/deployment/pin keeps the selected LMS tab open when the version is missing", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        version: "0.1.0",
        approvalStatus: "approved",
        reviewNotes: "Ready for pilot.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 4,
        slug: "chapter-4-asteroids-moodle",
        label: "Chapter 4 Asteroids Moodle Deployment",
        enabledPackageVersionId: null,
        enabledPackageVersion: null,
        binding: buildMoodleDeploymentBinding(),
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("lms", "moodle");

  const response = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/deployment/pin",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );

  assertEquals(response.status, 409);
  const body = await response.text();

  assertStringIncludes(body, "Moodle version pin blocked");
  assertStringIncludes(body, "Moodle setup");
  assertStringIncludes(body, "Choose an approved version.");
  assertStringIncludes(body, 'name="packageVersionId"');
  assertStringIncludes(body, 'aria-invalid="true"');
});
