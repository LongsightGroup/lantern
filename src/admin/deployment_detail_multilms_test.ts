import { assertFalse, assertStringIncludes } from "@std/assert";
import { resolveCanvasIssuer } from "../lti/config.ts";
import {
  buildBrokerVerificationStatus,
  buildControlPlaneDeploymentDetailSnapshot,
  buildControlPlaneDeploymentInventoryRow,
  buildControlPlaneDiagnosticItem,
  buildDeploymentActivitySnapshot,
  buildDeploymentRecord,
  buildPackageVersionRecord,
} from "../test_helpers/package_review.ts";
import {
  buildCanvasDeploymentBinding,
  buildMoodleDeploymentBinding,
  buildSakaiDeploymentBinding,
} from "../test_helpers/lti.ts";
import { renderDeploymentDetailPage } from "./deployment_detail.ts";

Deno.test("deployment page keeps separate Canvas, Moodle, and Sakai slots for one app", () => {
  const html = renderDeploymentDetailPage({
    appId: "chapter-4-asteroids",
    appTitle: "Chapter 4 Asteroids",
    history: [
      buildPackageVersionRecord({
        id: 1,
        version: "0.1.0",
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
      buildPackageVersionRecord({
        id: 2,
        version: "0.2.0",
        approvalStatus: "approved",
        reviewedAt: "2026-03-24T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        slug: "chapter-4-asteroids-pilot",
        label: "Chapter 4 Asteroids Pilot Deployment",
        enabledPackageVersionId: 1,
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
      buildDeploymentRecord({
        id: 5,
        slug: "chapter-4-asteroids-sakai",
        label: "Chapter 4 Asteroids Sakai Deployment",
        enabledPackageVersionId: 2,
        enabledPackageVersion: "0.2.0",
        binding: buildSakaiDeploymentBinding(),
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

  assertStringIncludes(html, 'deployment-tab-label">Canvas</span>');
  assertStringIncludes(html, 'deployment-tab-label">Moodle</span>');
  assertStringIncludes(html, 'deployment-tab-label">Sakai</span>');
  assertStringIncludes(html, "Pinned to version 0.1.0.");
  assertStringIncludes(
    html,
    'href="/admin/packages/chapter-4-asteroids/deployment?lms=moodle#slot-panel"',
  );
  assertStringIncludes(
    html,
    'href="/admin/packages/chapter-4-asteroids/deployment?lms=sakai#slot-panel"',
  );
  assertStringIncludes(html, 'name="lms" value="canvas"');
});

Deno.test("deployment page keeps one deployment route while rendering setup, launch, failure, and verification history for each LMS slot", () => {
  const cases = [
    {
      lms: "canvas" as const,
      binding: buildCanvasDeploymentBinding(),
      deploymentId: 3,
      slug: "chapter-4-asteroids-pilot",
      label: "Chapter 4 Asteroids Pilot Deployment",
      setupHeading: "Set up Canvas",
      saveButtonLabel: "Save Canvas settings",
      launchSummary:
        "Latest Canvas launch reached the governed runtime handoff.",
      diagnosticSummary: "Canvas launch failed on the saved deployment path.",
      verificationSummary:
        "Latest internal proof passed for the saved Canvas deployment.",
      supportedPath: "lti13LaunchAgsNrps" as const,
    },
    {
      lms: "moodle" as const,
      binding: buildMoodleDeploymentBinding(),
      deploymentId: 4,
      slug: "chapter-4-asteroids-moodle",
      label: "Chapter 4 Asteroids Moodle Deployment",
      setupHeading: "Set up Moodle",
      saveButtonLabel: "Save Moodle settings",
      launchSummary:
        "Latest Moodle launch reached the governed runtime handoff.",
      diagnosticSummary: "Moodle launch failed on the saved deployment path.",
      verificationSummary:
        "Latest internal proof passed for the saved Moodle deployment.",
      supportedPath: "lti13LaunchAgsScore" as const,
    },
    {
      lms: "sakai" as const,
      binding: buildSakaiDeploymentBinding(),
      deploymentId: 5,
      slug: "chapter-4-asteroids-sakai",
      label: "Chapter 4 Asteroids Sakai Deployment",
      setupHeading: "Set up Sakai",
      saveButtonLabel: "Save Sakai settings",
      launchSummary:
        "Latest Sakai launch reached the governed runtime handoff.",
      diagnosticSummary: "Sakai launch failed on the saved deployment path.",
      verificationSummary:
        "Latest internal proof passed for the saved Sakai deployment.",
      supportedPath: "lti13LaunchAgsScore" as const,
    },
  ];

  for (const testCase of cases) {
    const html = renderDeploymentDetailPage({
      appId: "chapter-4-asteroids",
      appTitle: "Chapter 4 Asteroids",
      selectedLms: testCase.lms,
      history: [
        buildPackageVersionRecord({
          id: 1,
          version: "0.1.0",
          approvalStatus: "approved",
          reviewedAt: "2026-03-23T18:05:00Z",
        }),
      ],
      deployments: [
        buildDeploymentRecord({
          id: testCase.deploymentId,
          slug: testCase.slug,
          label: testCase.label,
          enabledPackageVersionId: 1,
          enabledPackageVersion: "0.1.0",
          lmsType: testCase.lms,
          binding: testCase.binding,
        }),
      ],
      controlPlaneDetail: buildControlPlaneDeploymentDetailSnapshot({
        inventory: buildControlPlaneDeploymentInventoryRow({
          deploymentId: testCase.deploymentId,
          deploymentSlug: testCase.slug,
          deploymentLabel: testCase.label,
          binding: testCase.binding,
          installEvidence: buildDeploymentActivitySnapshot({
            summary: `Saved the ${
              testCase.setupHeading.replace(
                "Set up ",
                "",
              )
            } deployment binding.`,
          }),
          brokerVerification: buildBrokerVerificationStatus({
            supportedPath: testCase.supportedPath,
            internal: {
              source: "manual",
              status: "passed",
              checkedAt: "2026-03-24T12:50:00Z",
              summary: testCase.verificationSummary,
              evidenceUrl: "https://example.test/verification/internal-proof",
            },
          }),
        }),
        brokerVerification: buildBrokerVerificationStatus({
          supportedPath: testCase.supportedPath,
          internal: {
            source: "manual",
            status: "passed",
            checkedAt: "2026-03-24T12:50:00Z",
            summary: testCase.verificationSummary,
            evidenceUrl: "https://example.test/verification/internal-proof",
          },
        }),
        latestInstallEvidence: buildDeploymentActivitySnapshot({
          summary: `Saved the ${
            testCase.setupHeading.replace("Set up ", "")
          } deployment binding.`,
        }),
        latestLaunch: buildDeploymentActivitySnapshot({
          summary: testCase.launchSummary,
        }),
        diagnostics: [
          buildControlPlaneDiagnosticItem({
            kind: "launch",
            eventType: "launch.rejected",
            status: "failed",
            summary: testCase.diagnosticSummary,
            operatorSummary: testCase.diagnosticSummary,
          }),
        ],
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

    assertStringIncludes(
      html,
      `href="/admin/packages/chapter-4-asteroids/deployment?lms=${testCase.lms}#slot-panel" aria-current="page"`,
    );
    assertStringIncludes(html, testCase.setupHeading);
    assertStringIncludes(html, testCase.saveButtonLabel);
    assertStringIncludes(html, "Setup history");
    assertStringIncludes(html, testCase.launchSummary);
    assertStringIncludes(html, testCase.diagnosticSummary);
    assertStringIncludes(html, testCase.verificationSummary);
    assertFalse(
      html.includes(
        `/admin/packages/chapter-4-asteroids/${testCase.lms}/deployment`,
      ),
    );
  }
});
