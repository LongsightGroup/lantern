import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildBrokerVerificationStatus,
  buildControlPlaneDeploymentInventoryRow,
  buildOfficialBrokerCertificationStatus,
} from "../test_helpers/package_review.ts";
import {
  renderDeploymentsPage,
  renderVerificationPage,
} from "./control_plane.ts";

Deno.test("renderDeploymentsPage keeps deployment operations separate from verification entry", () => {
  const html = renderDeploymentsPage({
    deployments: [
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 1,
        deploymentSlug: "chapter-4-asteroids-pilot",
        deploymentLabel: "Chapter 4 Asteroids Pilot Deployment",
        lastGradePublishStatus: "failed",
      }),
    ],
  });

  assertStringIncludes(html, "Deployments");
  assertStringIncludes(html, "Chapter 4 Asteroids Pilot Deployment");
  assertStringIncludes(html, "Pilot usage");
  assertStringIncludes(html, "Recent active users");
  assertStringIncludes(html, "Retry required");
  assertEquals(html.includes("Broker verification"), false);
  assertEquals(html.includes("Record verification evidence"), false);
});

Deno.test("renderVerificationPage keeps internal broker verification evidence separate from official certification state", () => {
  const html = renderVerificationPage({
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
  assertStringIncludes(html, "Record verification evidence");
  assertStringIncludes(html, 'action="/admin/verification"');
  assertEquals(html.includes("Deployment inventory"), false);
});
