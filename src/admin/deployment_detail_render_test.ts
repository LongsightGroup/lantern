import { assertFalse, assertStringIncludes } from "@std/assert";
import { resolveCanvasIssuer } from "../lti/config.ts";
import {
  buildControlPlaneDeploymentDetailSnapshot,
  buildControlPlaneDiagnosticItem,
  buildDeploymentActivitySnapshot,
  buildDeploymentGradePublicationSnapshot,
  buildDeploymentRecord,
  buildPackageVersionRecord,
  buildPilotUsageMetrics,
  buildRetryableGradePublicationLookup,
} from "../test_helpers/package_review.ts";
import {
  buildCanvasDeploymentBinding,
  buildDeploymentBinding,
  buildSakaiDeploymentBinding,
} from "../test_helpers/lti.ts";
import { renderDeploymentDetailPage } from "./deployment_detail.ts";

Deno.test("deployment page keeps shared copy neutral while scoping Canvas, Moodle, and Sakai setup into tabs", () => {
  const binding = buildCanvasDeploymentBinding();
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
        binding,
      }),
    ],
    canvasConfigUrl: "http://localhost:8417/lti/canvas/config.json",
    supportedCanvasEnvironments: [
      {
        id: "production",
        label: "Production Canvas",
        issuer: resolveCanvasIssuer("production"),
      },
    ],
  });

  assertStringIncludes(html, "Managed LMS deployment");
  assertStringIncludes(html, "Open one LMS slot at a time.");
  assertStringIncludes(html, "deployment-tab-strip");
  assertStringIncludes(html, "Canvas editor");
  assertStringIncludes(html, 'deployment-tab-label">Moodle</span>');
  assertStringIncludes(html, 'deployment-tab-label">Sakai</span>');
  assertFalse(
    html.includes(
      "Pin the reviewed version, then wire this deployment into Canvas through one supported LTI 1.3 path.",
    ),
  );
  assertStringIncludes(html, "Config URL");
  assertStringIncludes(html, "Canvas environment");
  assertStringIncludes(html, binding.issuer);
  assertStringIncludes(
    html,
    "Operational evidence stays available, but secondary.",
  );
  assertStringIncludes(html, "Show launch, grading, and diagnostic detail");
});

Deno.test("deployment page renders the selected Sakai tab without leaking the Canvas form", () => {
  const html = renderDeploymentDetailPage({
    appId: "chapter-4-asteroids",
    appTitle: "Chapter 4 Asteroids",
    selectedLms: "sakai",
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
        binding: buildSakaiDeploymentBinding(),
        lmsType: "sakai",
      }),
    ],
    canvasConfigUrl: "http://localhost:8417/lti/canvas/config.json",
    supportedCanvasEnvironments: [
      {
        id: "production",
        label: "Production Canvas",
        issuer: resolveCanvasIssuer("production"),
      },
    ],
  });

  assertStringIncludes(
    html,
    'href="/admin/packages/chapter-4-asteroids/deployment?lms=sakai#slot-panel" aria-current="page"',
  );
  assertStringIncludes(html, "Sakai setup");
  assertStringIncludes(html, "OIDC authentication URL");
  assertStringIncludes(html, "Public keyset URL");
  assertFalse(html.includes("Canvas environment"));
  assertFalse(html.includes("Config URL"));
});

Deno.test("deployment page shows the latest roster verification summary and action", () => {
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
    nrpsVerification: {
      status: "succeeded",
      checkedAt: "2026-03-24T03:05:00Z",
      contextId: "course-42",
      memberCount: 2,
    },
    canvasConfigUrl: "http://localhost:8417/lti/canvas/config.json",
    supportedCanvasEnvironments: [
      {
        id: "production",
        label: "Production Canvas",
        issuer: resolveCanvasIssuer("production"),
      },
    ],
  });

  assertStringIncludes(html, "Canvas service check");
  assertStringIncludes(html, "Succeeded");
  assertStringIncludes(html, "Run roster check");
  assertStringIncludes(html, "course-42");
  assertStringIncludes(html, "2");
});

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
      latestLaunch: buildDeploymentActivitySnapshot({
        occurredAt: "2026-03-24T12:30:00Z",
        summary: "Latest launch reached the governed runtime handoff.",
      }),
      latestNrpsRead: buildDeploymentActivitySnapshot({
        occurredAt: "2026-03-24T12:33:00Z",
        summary: "Latest roster verification succeeded.",
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
  assertStringIncludes(html, "Last AGS write");
  assertStringIncludes(html, "Last NRPS read");
  assertStringIncludes(html, "Pilot usage");
  assertStringIncludes(html, "Launches recorded");
  assertStringIncludes(html, "Attempts completed");
  assertStringIncludes(html, "Grade publishes");
  assertStringIncludes(html, "Recent active users");
  assertStringIncludes(html, "Diagnostics");
  assertStringIncludes(html, "Canvas slot");
  assertStringIncludes(html, "Save release pin");
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

  assertStringIncludes(html, "Diagnostics");
  assertStringIncludes(
    html,
    "Launch failed before Lantern could hand the learner into the governed runtime.",
  );
  assertStringIncludes(
    html,
    "Roster verification failed for the saved deployment path.",
  );
  assertStringIncludes(
    html,
    "Grade publish failed and can be retried from the control plane.",
  );
  assertStringIncludes(html, "retry-grade-publish");
  assertStringIncludes(html, "Retry grade publish");
});
