import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildBrokerVerificationStatus,
  buildControlPlaneDeploymentInventoryRow,
  buildOfficialBrokerCertificationStatus,
} from "../test_helpers/package_review.ts";
import {
  buildCanvasDeploymentBinding,
  buildMoodleDeploymentBinding,
  buildSakaiDeploymentBinding,
} from "../test_helpers/lti.ts";
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

Deno.test("renderVerificationPage shows deployment-scoped verification facts while keeping official evidence separate", () => {
  const html = renderVerificationPage({
    deployments: [
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
            summary:
              "Canvas deployment verification passed.",
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
          supportedPath: "moodleLti13LaunchAgsScore",
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
        brokerVerification: buildBrokerVerificationStatus({
          supportedPath: "sakaiLti13LaunchAgsScore",
          internal: null,
        }),
      }),
    ],
    latestBrokerVerification: buildBrokerVerificationStatus({
      supportedPath: "moodleLti13LaunchAgsScore",
      official: buildOfficialBrokerCertificationStatus({
        state: "notCertified",
        checkedAt: "2026-03-24T12:55:00Z",
        directoryUrl: "https://example.test/official-directory",
      }),
    }),
  });

  assertStringIncludes(html, "Deployment-scoped internal proof");
  assertStringIncludes(html, "Official 1EdTech evidence");
  assertStringIncludes(html, "Chapter 4 Asteroids Pilot Deployment");
  assertStringIncludes(html, "Chapter 4 Asteroids Moodle Deployment");
  assertStringIncludes(html, "Chapter 4 Asteroids Sakai Deployment");
  assertStringIncludes(html, "Canvas deployment verification passed.");
  assertStringIncludes(html, "Moodle deployment verification failed.");
  assertStringIncludes(html, "Canvas LTI 1.3 launch, AGS, and NRPS");
  assertStringIncludes(html, "Moodle LTI 1.3 launch and AGS score publish");
  assertStringIncludes(html, "Sakai LTI 1.3 launch and AGS score publish");
  assertStringIncludes(html, "Not certified");
  assertStringIncludes(html, "https://example.test/internal-proof");
  assertStringIncludes(html, "https://example.test/moodle-proof");
  assertStringIncludes(html, "https://example.test/official-directory");
  assertStringIncludes(html, "Record verification evidence");
  assertStringIncludes(html, 'action="/admin/verification"');
  assertStringIncludes(html, 'name="deploymentRecordId"');
  assertStringIncludes(html, 'name="scope"');
  assertEquals(html.includes("Deployment inventory"), false);
  assertEquals(html.includes("Supported Canvas path"), false);
});
