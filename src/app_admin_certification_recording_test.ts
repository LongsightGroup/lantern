import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "@std/assert";
import { createApp } from "./app.ts";
import {
  buildControlPlaneDeploymentInventoryRow,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import {
  buildCanvasDeploymentBinding,
  buildMoodleDeploymentBinding,
} from "./test_helpers/lti.ts";

Deno.test("POST /admin/verification records workflow-keyed internal certification evidence and leaves unrelated workflows untouched", async () => {
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
        brokerVerification: null,
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("source", "manual");
  formData.set("deploymentRecordId", "2");
  formData.set("scope", "lti13LaunchAgsScore");
  formData.set("workflowKey", "deepLinking");
  formData.set("status", "passed");
  formData.set(
    "summary",
    "Deep Linking certification evidence passed for the Moodle deployment.",
  );
  formData.set("detailUrl", "https://example.test/certification/deep-linking");
  formData.set("checkedAt", "2026-03-24T12:50:00Z");

  const response = await app.request("http://localhost/admin/verification", {
    method: "POST",
    headers: { Origin: "http://localhost" },
    body: formData,
  });

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/admin/verification");

  const workflowStatuses = await repository.listCertificationWorkflowStatuses();
  const statusesByWorkflow = new Map(
    workflowStatuses.map((status) => [status.workflowKey, status] as const),
  );
  const latestVerification = await repository.getLatestBrokerVerification();

  assertEquals(
    statusesByWorkflow.get("deepLinking")?.latestInternal?.deploymentRecordId,
    2,
  );
  assertEquals(
    statusesByWorkflow.get("deepLinking")?.latestInternal?.deploymentLabel,
    "Chapter 4 Asteroids Moodle Deployment",
  );
  assertEquals(
    statusesByWorkflow.get("deepLinking")?.latestInternal?.status,
    "passed",
  );
  assertEquals(
    statusesByWorkflow.get("deepLinking")?.latestInternal?.summary,
    "Deep Linking certification evidence passed for the Moodle deployment.",
  );
  assertEquals(
    statusesByWorkflow.get("deepLinking")?.latestInternal?.evidenceUrl,
    "https://example.test/certification/deep-linking",
  );
  assertEquals(statusesByWorkflow.get("core")?.latestInternal, null);
  assertEquals(statusesByWorkflow.get("nrps")?.latestInternal, null);
  assertEquals(statusesByWorkflow.get("ags")?.latestInternal, null);
  assertEquals(latestVerification?.supportedPath, "lti13LaunchAgsScore");
});

Deno.test("POST /admin/verification records official certification evidence globally and keeps internal workflow evidence unchanged", async () => {
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
        binding: buildCanvasDeploymentBinding(),
        brokerVerification: null,
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });

  const internalFormData = new FormData();
  internalFormData.set("source", "ci");
  internalFormData.set("deploymentRecordId", "1");
  internalFormData.set("scope", "lti13LaunchAgsNrps");
  internalFormData.set("workflowKey", "ags");
  internalFormData.set("status", "passed");
  internalFormData.set("summary", "AGS certification evidence passed.");
  internalFormData.set("detailUrl", "https://example.test/certification/ags");
  internalFormData.set("checkedAt", "2026-03-24T12:45:00Z");

  const internalResponse = await app.request(
    "http://localhost/admin/verification",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: internalFormData,
    },
  );

  assertEquals(internalResponse.status, 303);

  const officialFormData = new FormData();
  officialFormData.set("source", "1edtech");
  officialFormData.set("scope", "lti13LaunchAgsNrps");
  officialFormData.set("workflowKey", "core");
  officialFormData.set("status", "passed");
  officialFormData.set("certificationState", "ltiAdvantageCertified");
  officialFormData.set("summary", "1EdTech lists Lantern as LTI Advantage Certified.");
  officialFormData.set("detailUrl", "https://example.test/certification/1edtech");
  officialFormData.set("checkedAt", "2026-03-24T13:00:00Z");

  const officialResponse = await app.request(
    "http://localhost/admin/verification",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: officialFormData,
    },
  );

  assertEquals(officialResponse.status, 303);

  const workflowStatuses = await repository.listCertificationWorkflowStatuses();
  const statusesByWorkflow = new Map(
    workflowStatuses.map((status) => [status.workflowKey, status] as const),
  );
  const officialEvidence = await repository.getLatestOfficialCertificationEvidence();

  assertExists(officialEvidence);
  assertEquals(officialEvidence.workflowKey, "core");
  assertEquals(officialEvidence.state, "ltiAdvantageCertified");
  assertEquals(
    officialEvidence.directoryUrl,
    "https://example.test/certification/1edtech",
  );
  assertEquals(
    statusesByWorkflow.get("ags")?.latestInternal?.summary,
    "AGS certification evidence passed.",
  );
  assertEquals(statusesByWorkflow.get("core")?.latestInternal, null);
});

Deno.test("POST /admin/verification rejects missing certification workflow identity", async () => {
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
        binding: buildCanvasDeploymentBinding(),
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("source", "manual");
  formData.set("deploymentRecordId", "1");
  formData.set("scope", "lti13LaunchAgsNrps");
  formData.set("status", "passed");
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
  assertStringIncludes(body, "Certification workflow is required.");
});

Deno.test("POST /admin/verification rejects relative certification evidence URLs", async () => {
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
        binding: buildCanvasDeploymentBinding(),
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("source", "manual");
  formData.set("deploymentRecordId", "1");
  formData.set("scope", "lti13LaunchAgsNrps");
  formData.set("workflowKey", "core");
  formData.set("status", "passed");
  formData.set("summary", "Manual verification passed.");
  formData.set("detailUrl", "/verification/manual-pass");
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
    "Verification detail URL must be an absolute URL.",
  );
});
