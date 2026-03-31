import { assertFalse, assertStringIncludes } from "@std/assert";
import { resolveCanvasIssuer } from "../lti/config.ts";
import {
  buildBrokerVerificationStatus,
  buildControlPlaneDeploymentDetailSnapshot,
  buildControlPlaneDeploymentInventoryRow,
  buildControlPlaneDiagnosticItem,
  buildDeploymentActivitySnapshot,
  buildDeploymentGradePublicationSnapshot,
  buildDeploymentRecentLaunch,
  buildDeploymentRecord,
  buildPackageVersionRecord,
  buildPilotUsageMetrics,
  buildRetryableGradePublicationLookup,
} from "../test_helpers/package_review.ts";
import {
  buildDeploymentBinding,
  buildMoodleDeploymentBinding,
} from "../test_helpers/lti.ts";
import { renderDeploymentDetailPage } from "./deployment_detail.ts";

Deno.test("deployment page shows status panels and pilot usage without dropping the binding and version controls", () => {
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
    deployments: [
      buildDeploymentRecord({
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
      }),
    ],
    controlPlaneDetail: buildControlPlaneDeploymentDetailSnapshot({
      recentLaunches: [
        buildDeploymentRecentLaunch({
          userId:
            "https://sakai.example/user/ead80b74-e0e4-42f5-a602-489adae928b1",
          userDisplayName: "Ada Lovelace",
          userEmail: "ada@example.com",
          userLogin: "adal",
          ltiProfileId: "certification",
          ltiProfileSource: "lanternDefault",
        }),
      ],
      latestLaunch: buildDeploymentActivitySnapshot({
        occurredAt: "2026-03-24T12:30:00Z",
        summary: "Latest launch reached the governed runtime handoff.",
        detail: {
          code: "ok",
          ltiProfileId: "certification",
          ltiProfileSource: "lanternDefault",
        },
      }),
      latestNrpsRead: buildDeploymentActivitySnapshot({
        occurredAt: "2026-03-24T12:33:00Z",
        summary: "Latest roster verification succeeded.",
        detail: {
          code: "ok",
          ltiProfileId: "governedCompatibility",
          ltiProfileSource: "deploymentOverride",
        },
      }),
      latestGradePublish: buildDeploymentGradePublicationSnapshot({
        updatedAt: "2026-03-24T12:35:00Z",
        status: "failed",
      }),
      pilotUsage: buildPilotUsageMetrics({
        totalLaunches: 6,
        attemptsCompleted: 5,
        gradePublishesSucceeded: 4,
        gradePublishesFailed: 1,
        recentActiveUsers: 3,
      }),
    }),
    canvasConfigUrl: "http://localhost:8417/lti/canvas/config.json",
    supportedCanvasEnvironments: [
      {
        id: "production",
        label: "Production Canvas",
        issuer: resolveCanvasIssuer("production"),
      },
    ],
  });

  assertStringIncludes(html, "Current status");
  assertStringIncludes(html, "Last launch");
  assertStringIncludes(html, "Last grade write");
  assertStringIncludes(html, "Last NRPS read");
  assertStringIncludes(html, "Pilot usage");
  assertStringIncludes(html, "Launches recorded");
  assertStringIncludes(html, "Attempts completed");
  assertStringIncludes(html, "Grade publishes");
  assertStringIncludes(html, "Recent active users");
  assertStringIncludes(html, "Recent launches");
  assertStringIncludes(html, "Opened by Ada Lovelace");
  assertStringIncludes(html, "ada@example.com");
  assertStringIncludes(html, "Profile Certification from Lantern default");
  assertStringIncludes(html, "Course or site course-42");
  assertStringIncludes(html, "Placement resource-link-123");
  assertStringIncludes(
    html,
    "Latest roster verification succeeded. Profile Governed interoperability override.",
  );
  assertStringIncludes(html, 'deployment-tab-label">Canvas</span>');
  assertStringIncludes(html, "Save live version");
  assertStringIncludes(html, "chip-status-healthy");
  assertStringIncludes(html, "chip-status-failed");
  assertStringIncludes(html, "table-row-status-failed");
});

Deno.test("deployment page shows diagnostics and an explicit retry action for retryable AGS failures", () => {
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
    deployments: [
      buildDeploymentRecord({
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
      }),
    ],
    controlPlaneDetail: buildControlPlaneDeploymentDetailSnapshot({
      diagnostics: [
        buildControlPlaneDiagnosticItem({
          id: 1,
          kind: "launch",
          eventType: "launch.rejected",
          summary: "Rejected launch before runtime handoff.",
          operatorSummary:
            "Launch failed before Lantern could hand the learner into the governed runtime.",
        }),
        buildControlPlaneDiagnosticItem({
          id: 2,
          kind: "nrps",
          eventType: "deployment.nrps_verified",
          status: "failed",
          code: "token_request_failed",
          summary: "Canvas roster verification failed.",
          operatorSummary:
            "Roster verification failed for the saved deployment path.",
          detail: {
            ltiProfileId: "certification",
            ltiProfileSource: "lanternDefault",
          },
        }),
        buildControlPlaneDiagnosticItem({
          id: 3,
          kind: "gradePublication",
          eventType: "grade_publish.failed",
          status: "failed",
          attemptId: "attempt-123",
          code: "token_request_failed",
          summary: "Canvas AGS score publish failed.",
          operatorSummary:
            "Grade publish failed and can be retried from the control plane.",
          retryable: true,
        }),
      ],
      retryableGradePublication: buildRetryableGradePublicationLookup({
        attemptId: "attempt-123",
      }),
    }),
    canvasConfigUrl: "http://localhost:8417/lti/canvas/config.json",
    supportedCanvasEnvironments: [
      {
        id: "production",
        label: "Production Canvas",
        issuer: resolveCanvasIssuer("production"),
      },
    ],
  });

  assertStringIncludes(html, "Problems to review");
  assertStringIncludes(
    html,
    "Launch failed before Lantern could hand the learner into the governed runtime.",
  );
  assertStringIncludes(
    html,
    "Roster verification failed for the saved deployment path.",
  );
  assertStringIncludes(html, "Profile Certification from Lantern default");
  assertStringIncludes(
    html,
    "Grade publish failed and can be retried from the control plane.",
  );
  assertStringIncludes(html, "retry-grade-publish");
  assertStringIncludes(html, "Retry grade publish");
  assertStringIncludes(html, "chip-status-attention");
  assertStringIncludes(html, 'details id="activity-details" open');
});

Deno.test("deployment page keeps setup history as an optional verification link-out", () => {
  const html = renderDeploymentDetailPage({
    appId: "chapter-4-asteroids",
    appTitle: "Chapter 4 Asteroids",
    selectedLms: "moodle",
    history: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 4,
        slug: "chapter-4-asteroids-moodle",
        label: "Chapter 4 Asteroids Moodle Deployment",
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
        lmsType: "moodle",
        binding: buildMoodleDeploymentBinding(),
      }),
    ],
    controlPlaneDetail: buildControlPlaneDeploymentDetailSnapshot({
      inventory: buildControlPlaneDeploymentInventoryRow({
        deploymentId: 4,
        deploymentSlug: "chapter-4-asteroids-moodle",
        deploymentLabel: "Chapter 4 Asteroids Moodle Deployment",
        binding: buildMoodleDeploymentBinding(),
        brokerVerification: buildBrokerVerificationStatus({
          supportedPath: "lti13LaunchAgsScore",
          internal: {
            source: "ci",
            status: "passed",
            checkedAt: "2026-03-24T12:50:00Z",
            summary:
              "Latest internal proof passed for the saved Moodle deployment.",
            evidenceUrl: "https://example.test/verification/moodle-ci-pass",
          },
        }),
      }),
      brokerVerification: buildBrokerVerificationStatus({
        supportedPath: "lti13LaunchAgsScore",
        internal: {
          source: "ci",
          status: "passed",
          checkedAt: "2026-03-24T12:50:00Z",
          summary:
            "Latest internal proof passed for the saved Moodle deployment.",
          evidenceUrl: "https://example.test/verification/moodle-ci-pass",
        },
      }),
    }),
    canvasConfigUrl: "http://localhost:8417/lti/canvas/config.json",
    supportedCanvasEnvironments: [
      {
        id: "production",
        label: "Production Canvas",
        issuer: resolveCanvasIssuer("production"),
      },
    ],
  });

  assertStringIncludes(html, "Setup history");
  assertStringIncludes(
    html,
    "If you need past setup records or test logs for this app setup, open Verification.",
  );
  assertStringIncludes(
    html,
    "Latest internal proof passed for the saved Moodle deployment.",
  );
  assertStringIncludes(html, "Latest saved result");
  assertStringIncludes(html, "Open Verification");
  assertStringIncludes(html, "Open log");
  assertFalse(html.includes("Official certification"));
  assertFalse(html.includes("Supported Canvas path"));
});
