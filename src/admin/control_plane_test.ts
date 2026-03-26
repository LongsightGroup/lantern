import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../app.ts";
import {
  buildBrokerVerificationStatus,
  buildControlPlaneDeploymentInventoryRow,
  buildOfficialBrokerCertificationStatus,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";

Deno.test("GET /admin/packages renders the Phase 4 control-plane inventory, pilot usage metrics, and broker verification summary", async () => {
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
        lastGradePublishStatus: "failed",
      }),
    ],
    brokerVerifications: [
      buildBrokerVerificationStatus({
        official: buildOfficialBrokerCertificationStatus({
          state: "notCertified",
        }),
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request("http://localhost/admin/packages");

  assertEquals(response.status, 200);

  const body = await response.text();

  assertStringIncludes(body, "Operator control plane");
  assertStringIncludes(body, "Chapter 4 Asteroids Pilot Deployment");
  assertStringIncludes(body, "Pilot usage");
  assertStringIncludes(body, "Recent active users");
  assertStringIncludes(body, "Broker verification");
  assertStringIncludes(body, "Internal verification");
  assertStringIncludes(body, "Official certification");
  assertStringIncludes(body, "Not certified");
  assertStringIncludes(body, "Record verification evidence");
  assertStringIncludes(body, 'action="/admin/packages/verification"');
  assertStringIncludes(body, "Open the demo dossier");
  assertStringIncludes(body, 'action="/admin/packages/import-demo"');
  assertStringIncludes(body, "Retry required");
  assertStringIncludes(body, "Placement audits");
  assertStringIncludes(body, 'href="/admin/placements"');
});

Deno.test("control-plane renderer keeps internal broker verification evidence separate from official certification state", async () => {
  const modulePath = `./${"control_plane.ts"}`;
  const controlPlaneModule = await import(modulePath);
  const html = controlPlaneModule.renderControlPlanePage({
    deployments: [
      buildControlPlaneDeploymentInventoryRow({
        brokerVerification: buildBrokerVerificationStatus({
          internal: {
            source: "manual",
            status: "passed",
            checkedAt: "2026-03-24T12:50:00Z",
            summary:
              "Canvas launch, AGS publish, and NRPS verification passed.",
            evidenceUrl: "https://example.test/internal-proof",
          },
          official: buildOfficialBrokerCertificationStatus({
            state: "notCertified",
            checkedAt: "2026-03-24T12:55:00Z",
            directoryUrl: "https://example.test/official-directory",
          }),
        }),
      }),
    ],
    latestBrokerVerification: buildBrokerVerificationStatus({
      official: buildOfficialBrokerCertificationStatus({
        state: "notCertified",
        checkedAt: "2026-03-24T12:55:00Z",
        directoryUrl: "https://example.test/official-directory",
      }),
    }),
  });

  assertStringIncludes(html, "Internal verification");
  assertStringIncludes(html, "Official certification");
  assertStringIncludes(html, "Passed");
  assertStringIncludes(html, "Not certified");
  assertStringIncludes(html, "https://example.test/internal-proof");
  assertStringIncludes(html, "https://example.test/official-directory");
  assertStringIncludes(html, "Open the demo dossier");
  assertStringIncludes(html, 'action="/admin/packages/import-demo"');
  assertStringIncludes(html, "Record verification evidence");
});
