import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import type { OpsRepository } from "./ops/repository.ts";
import {
  buildControlPlaneDeploymentInventoryRow,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";

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

  assertStringIncludes(body, "Deployments");
  assertStringIncludes(body, "Deployment inventory");
  assertStringIncludes(body, "Pilot usage");
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
      buildControlPlaneDeploymentInventoryRow({ deploymentId: 1 }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request("http://localhost/admin/verification");

  assertEquals(response.status, 200);

  const body = await response.text();

  assertStringIncludes(body, "Verification");
  assertStringIncludes(body, "Broker verification");
  assertStringIncludes(body, "Record verification evidence");
  assertStringIncludes(body, 'action="/admin/verification"');
  assertEquals(body.includes("Deployment inventory"), false);
});

Deno.test("GET /admin/deployments keeps route failures inside the admin shell", async () => {
  const app = createApp({
    getOpsRepository: () =>
      createFailingOpsRepository("Deployments inventory is unavailable."),
  });

  const response = await app.request("http://localhost/admin/deployments");

  assertEquals(response.status, 500);
  const body = await response.text();

  assertStringIncludes(body, "Deployments unavailable");
  assertStringIncludes(body, "Deployments inventory is unavailable.");
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

Deno.test("POST /admin/verification records a broker verification run and redirects back to verification", async () => {
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
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("source", "manual");
  formData.set("status", "passed");
  formData.set(
    "summary",
    "Manual verification passed for the supported Canvas path.",
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

  assertEquals(latestVerification?.internal?.source, "manual");
  assertEquals(latestVerification?.internal?.status, "passed");
  assertEquals(
    latestVerification?.internal?.summary,
    "Manual verification passed for the supported Canvas path.",
  );
  assertEquals(
    latestVerification?.internal?.evidenceUrl,
    "https://example.test/verification/manual-pass",
  );
  assertEquals(latestVerification?.official.state, "notCertified");
});

Deno.test("POST /admin/verification rejects internal verification rows that include an official certification state", async () => {
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
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("source", "manual");
  formData.set("status", "passed");
  formData.set("certificationState", "ltiAdvantageCertified");
  formData.set("summary", "Manual verification passed.");
  formData.set("checkedAt", "2026-03-24T12:50:00Z");

  const response = await app.request("http://localhost/admin/verification", {
    method: "POST",
    headers: { Origin: "http://localhost" },
    body: formData,
  });

  assertEquals(response.status, 400);
  const body = await response.text();

  assertStringIncludes(body, "Verification update blocked");
  assertStringIncludes(
    body,
    "Internal verification runs cannot carry an official certification state.",
  );
});
