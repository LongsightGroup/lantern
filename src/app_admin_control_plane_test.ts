import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import type { OpsRepository } from "./ops/repository.ts";
import {
  buildBrokerVerificationStatus,
  buildControlPlaneDeploymentInventoryRow,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import {
  buildCanvasDeploymentBinding,
  buildMoodleDeploymentBinding,
  buildSakaiDeploymentBinding,
} from "./test_helpers/lti.ts";

function createFailingOpsRepository(message: string): OpsRepository {
  return {
    listControlPlaneDeployments() {
      return Promise.reject(new Error(message));
    },
    getControlPlaneDeploymentDetail() {
      return Promise.reject(new Error(message));
    },
    getLatestBrokerVerification() {
      return Promise.reject(new Error(message));
    },
    getLatestBrokerVerificationStatus() {
      return Promise.reject(new Error(message));
    },
    listCertificationWorkflowStatuses() {
      return Promise.reject(new Error(message));
    },
    getLatestOfficialCertificationEvidence() {
      return Promise.reject(new Error(message));
    },
    recordBrokerVerificationRun() {
      return Promise.reject(new Error(message));
    },
    getRetryableGradePublicationLookup() {
      return Promise.reject(new Error(message));
    },
    getPlacementAuditSnapshot() {
      return Promise.reject(new Error(message));
    },
  };
}

Deno.test("GET /admin/deployments renders deployment operations on a dedicated page", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    controlPlaneDeployments: [
      buildControlPlaneDeploymentInventoryRow({ deploymentId: 1 }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request("http://localhost/admin/deployments");

  assertEquals(response.status, 200);

  const body = await response.text();

  assertStringIncludes(body, "Connections");
  assertStringIncludes(body, "All connections");
  assertStringIncludes(body, "Pilot usage");
  assertStringIncludes(body, "Next step");
  assertStringIncludes(body, "Retry grade return");
  assertStringIncludes(body, "Review grade problem");
  assertStringIncludes(body, "Open settings");
  assertStringIncludes(body, "view=activity#activity-details");
  assertEquals(body.includes("Broker verification"), false);
});

Deno.test("GET /admin/verification renders verification on a dedicated page", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    controlPlaneDeployments: [
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 1,
        deploymentSlug: "chapter-4-asteroids-pilot",
        deploymentLabel: "Chapter 4 Asteroids Pilot Deployment",
        binding: buildCanvasDeploymentBinding(),
        brokerVerification: buildBrokerVerificationStatus({
          internal: {
            source: "manual",
            status: "passed",
            checkedAt: "2026-03-24T12:50:00Z",
            summary: "Canvas deployment verification passed.",
            evidenceUrl: "https://example.test/internal-proof",
          },
        }),
      }),
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 2,
        deploymentSlug: "chapter-4-asteroids-moodle",
        deploymentLabel: "Chapter 4 Asteroids Moodle Deployment",
        binding: buildMoodleDeploymentBinding(),
        brokerVerification: buildBrokerVerificationStatus({
          supportedPath: "lti13LaunchAgsScore",
          internal: {
            source: "ci",
            status: "failed",
            checkedAt: "2026-03-24T12:40:00Z",
            summary: "Moodle deployment verification failed.",
            evidenceUrl: "https://example.test/moodle-proof",
          },
        }),
      }),
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 3,
        deploymentSlug: "chapter-4-asteroids-sakai",
        deploymentLabel: "Chapter 4 Asteroids Sakai Deployment",
        binding: buildSakaiDeploymentBinding(),
        brokerVerification: null,
      }),
    ],
    brokerVerifications: [
      buildBrokerVerificationStatus({
        supportedPath: "lti13LaunchAgsScore",
        internal: null,
        official: {
          state: "notCertified",
          checkedAt: "2026-03-24T12:55:00Z",
          directoryUrl: "https://example.test/official-directory",
        },
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: "certification",
      updatedAt: "2026-03-24T13:00:00Z",
    },
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request("http://localhost/admin/verification");

  assertEquals(response.status, 200);

  const body = await response.text();

  assertStringIncludes(body, "Verification");
  assertStringIncludes(body, "Saved checks");
  assertStringIncludes(body, "Official 1EdTech listing");
  assertStringIncludes(body, "Chapter 4 Asteroids Pilot Deployment");
  assertStringIncludes(body, "Chapter 4 Asteroids Moodle Deployment");
  assertStringIncludes(body, "Chapter 4 Asteroids Sakai Deployment");
  assertStringIncludes(body, "Add a check");
  assertStringIncludes(body, 'action="/admin/verification"');
  assertStringIncludes(body, "Lantern default profile");
  assertStringIncludes(body, 'action="/admin/verification/lti-profile"');
  assertStringIncludes(body, 'name="defaultLtiProfile"');
  assertStringIncludes(body, "Certification");
  assertStringIncludes(body, "Governed interoperability");
  assertStringIncludes(body, 'name="deploymentRecordId"');
  assertStringIncludes(body, 'name="scope"');
  assertEquals(body.includes("One row per LMS connection"), false);
  assertEquals(body.includes("Supported Canvas path"), false);
});

Deno.test("GET /admin/deployments keeps route failures inside the admin shell", async () => {
  const app = createApp({
    getOpsRepository: () =>
      createFailingOpsRepository("Connections inventory is unavailable."),
  });

  const response = await app.request("http://localhost/admin/deployments");

  assertEquals(response.status, 500);
  const body = await response.text();

  assertStringIncludes(body, "Connections unavailable");
  assertStringIncludes(body, "Connections inventory is unavailable.");
  assertStringIncludes(body, 'href="/admin/packages"');
  assertStringIncludes(body, 'href="/admin/deployments"');
});

Deno.test("GET /admin/verification keeps route failures inside the admin shell", async () => {
  const app = createApp({
    getOpsRepository: () =>
      createFailingOpsRepository("Verification history is unavailable."),
  });

  const response = await app.request("http://localhost/admin/verification");

  assertEquals(response.status, 500);
  const body = await response.text();

  assertStringIncludes(body, "Verification unavailable");
  assertStringIncludes(body, "Verification history is unavailable.");
  assertStringIncludes(body, 'href="/admin/packages"');
  assertStringIncludes(body, 'href="/admin/verification"');
});

Deno.test("POST /admin/verification records deployment-scoped broker verification evidence and redirects back to verification", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    controlPlaneDeployments: [
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 1,
        deploymentSlug: "chapter-4-asteroids-pilot",
        deploymentLabel: "Chapter 4 Asteroids Pilot Deployment",
        binding: buildCanvasDeploymentBinding(),
        brokerVerification: null,
      }),
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 2,
        deploymentSlug: "chapter-4-asteroids-moodle",
        deploymentLabel: "Chapter 4 Asteroids Moodle Deployment",
        binding: buildMoodleDeploymentBinding(),
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("source", "manual");
  formData.set("deploymentRecordId", "2");
  formData.set("scope", "lti13LaunchAgsScore");
  formData.set("status", "passed");
  formData.set(
    "summary",
    "Manual verification passed for the saved Moodle deployment.",
  );
  formData.set("detailUrl", "https://example.test/verification/manual-pass");
  formData.set("checkedAt", "2026-03-24T12:50:00Z");

  const response = await app.request("http://localhost/admin/verification", {
    method: "POST",
    headers: { Origin: "http://localhost" },
    body: formData,
  });

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/admin/verification");

  const latestVerification = await repository.getLatestBrokerVerification();
  const deployments = await repository.listControlPlaneDeployments();
  const moodleVerification = deployments.find(
    (deployment) => deployment.deploymentId === 2,
  )?.brokerVerification;
  const canvasVerification = deployments.find(
    (deployment) => deployment.deploymentId === 1,
  )?.brokerVerification;

  assertEquals(latestVerification?.supportedPath, "lti13LaunchAgsScore");
  assertEquals(latestVerification?.internal?.source, "manual");
  assertEquals(latestVerification?.internal?.status, "passed");
  assertEquals(
    latestVerification?.internal?.summary,
    "Manual verification passed for the saved Moodle deployment.",
  );
  assertEquals(
    latestVerification?.internal?.evidenceUrl,
    "https://example.test/verification/manual-pass",
  );
  assertEquals(moodleVerification?.internal?.status, "passed");
  assertEquals(
    moodleVerification?.internal?.summary,
    "Manual verification passed for the saved Moodle deployment.",
  );
  assertEquals(canvasVerification?.internal?.summary ?? null, null);
  assertEquals(latestVerification?.official.state, "notCertified");
});

Deno.test("POST /admin/verification/lti-profile saves the Lantern-wide default profile and redirects back to verification", async () => {
  const repository = createInMemoryPackageReviewRepository();
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("defaultLtiProfile", "certification");

  const response = await app.request(
    "http://localhost/admin/verification/lti-profile",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/admin/verification");
  assertEquals(
    (await repository.getLanternLtiProfileSettings()).defaultLtiProfile,
    "certification",
  );
});

Deno.test("POST /admin/verification/lti-profile rejects unsupported profile ids on the verification page", async () => {
  const repository = createInMemoryPackageReviewRepository();
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("defaultLtiProfile", "too-loose");

  const response = await app.request(
    "http://localhost/admin/verification/lti-profile",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );

  assertEquals(response.status, 400);
  const body = await response.text();

  assertStringIncludes(body, "Lantern default blocked");
  assertStringIncludes(body, "Choose one supported LTI profile.");
  assertEquals(
    (await repository.getLanternLtiProfileSettings()).defaultLtiProfile,
    "governedCompatibility",
  );
});
