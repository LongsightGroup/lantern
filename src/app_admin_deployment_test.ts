import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import { resolveCanvasIssuer } from "./lti/config.ts";
import {
  buildAccessibilityReview,
  buildControlPlaneDeploymentDetailSnapshot,
  buildControlPlaneDeploymentInventoryRow,
  buildDeploymentActivitySnapshot,
  buildDeploymentGradePublicationSnapshot,
  buildDeploymentRecord,
  buildPackageVersionRecord,
  buildPilotUsageMetrics,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import {
  buildDeploymentBinding,
  buildMoodleDeploymentBinding,
} from "./test_helpers/lti.ts";
import { restoreEnv } from "./app_test_support.ts";

Deno.test("POST /admin/packages/:appId/deployment/install saves the Canvas binding and redirects back to deployment detail", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  Deno.env.set("APP_ORIGIN", "http://localhost:8417");

  try {
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
        }),
      ],
    });
    const app = createApp({ getRepository: () => repository });
    const formData = new FormData();

    formData.set("lms", "canvas");
    formData.set("canvasEnvironment", "production");
    formData.set("clientId", "10000000000001");
    formData.set("deploymentId", "deployment-123");

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
      "/admin/packages/chapter-4-asteroids/deployment?lms=canvas#slot-panel",
    );

    const deployment = await repository.getDeploymentBySlug(
      "chapter-4-asteroids-pilot",
    );
    assertEquals(
      deployment?.binding?.issuer,
      resolveCanvasIssuer("production"),
    );
    assertEquals(deployment?.binding?.clientId, "10000000000001");
    assertEquals(deployment?.binding?.deploymentId, "deployment-123");
    const auditEvents = await repository.listAuditEventsByEventType(
      "deployment.binding_saved",
    );
    assertEquals(auditEvents.length, 1);
    assertEquals(auditEvents[0]?.deploymentRecordId, 3);
    assertEquals(auditEvents[0]?.detail.lms, "canvas");
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
  }
});

Deno.test("GET /admin/packages/:appId/deployment renders an LMS tab strip with one focused editor", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  Deno.env.set("APP_ORIGIN", "http://localhost:8417");

  try {
    const response = await createApp({
      getRepository: () =>
        createInMemoryPackageReviewRepository({
          packageVersions: [
            buildPackageVersionRecord({
              id: 5,
              approvalStatus: "approved",
              reviewNotes: "Ready for pilot.",
              accessibilityReview: buildAccessibilityReview({
                contrast: "fail",
                failureNotes:
                  "Contrast fixes still pending for the score meter.",
                exceptionNote: "Reviewed for faculty-supervised pilot use.",
              }),
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
              binding: buildDeploymentBinding(),
            }),
          ],
          lanternLtiProfileSettings: {
            defaultLtiProfile: "certification",
            updatedAt: "2026-03-24T13:00:00Z",
          },
          controlPlaneDeploymentDetails: [
            buildControlPlaneDeploymentDetailSnapshot({
              inventory: buildControlPlaneDeploymentInventoryRow({
                deploymentId: 3,
                enabledPackageVersionId: 5,
                enabledPackageVersion: "0.1.0",
                binding: buildDeploymentBinding(),
              }),
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
          ],
        }),
    }).request(
      "http://localhost/admin/packages/chapter-4-asteroids/deployment?lms=moodle&view=activity",
    );

    assertEquals(response.status, 200);
    const body = await response.text();

    assertStringIncludes(body, "App settings");
    assertStringIncludes(
      body,
      "Connect this app to one LMS and choose what version people should open.",
    );
    assertStringIncludes(body, 'class="deployment-tab ');
    assertStringIncludes(body, 'deployment-tab-label">Canvas</span>');
    assertStringIncludes(body, 'deployment-tab-label">Moodle</span>');
    assertStringIncludes(body, 'deployment-tab-label">Sakai</span>');
    assertStringIncludes(
      body,
      'href="/admin/packages/chapter-4-asteroids/deployment?lms=moodle#slot-panel" aria-current="page"',
    );
    assertStringIncludes(
      body,
      'id="slot-panel" class="deployment-tab-panel stack"',
    );
    assertStringIncludes(body, "Set up Moodle");
    assertStringIncludes(body, "Automatic setup");
    assertStringIncludes(
      body,
      "http://localhost:8417/admin/packages/chapter-4-asteroids/deployment/register/moodle",
    );
    assertStringIncludes(body, "Advanced Moodle settings");
    assertStringIncludes(body, "Platform ID");
    assertStringIncludes(body, "Authorization endpoint");
    assertStringIncludes(body, "Public keyset URL");
    assertStringIncludes(body, "Not connected");
    assertStringIncludes(body, "Current status");
    assertStringIncludes(body, "Last launch");
    assertStringIncludes(body, "Last grade write");
    assertStringIncludes(body, "Last NRPS read");
    assertStringIncludes(body, "Pilot usage");
    assertStringIncludes(body, "Grade publishes");
    assertStringIncludes(body, "Recent launches");
    assertStringIncludes(body, "Open checks and troubleshooting");
    assertStringIncludes(body, 'details id="activity-details" open');
    assertStringIncludes(body, "Save Moodle settings");
    assertStringIncludes(body, "Advanced LTI behavior override");
    assertStringIncludes(
      body,
      'action="/admin/packages/chapter-4-asteroids/deployment/lti-profile"',
    );
    assertStringIncludes(body, "LTI behavior");
    assertStringIncludes(body, "Use Lantern default");
    assertStringIncludes(body, "Certification");
    assertStringIncludes(body, "Governed interoperability");
    assertStringIncludes(body, "Save live version");
    assertStringIncludes(body, "Save the app settings first");
    assertStringIncludes(body, "Accessibility");
    assertStringIncludes(body, "Flagged review");
    assertStringIncludes(body, "Failed checks: Contrast.");
    assertStringIncludes(body, "Reviewed for faculty-supervised pilot use.");
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
  }
});

Deno.test("POST /admin/packages/:appId/deployment/lti-profile saves an override for only the selected deployment slot", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: "approved",
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
      }),
      buildDeploymentRecord({
        id: 4,
        slug: "chapter-4-asteroids-moodle",
        label: "Chapter 4 Asteroids Moodle Deployment",
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
        lmsType: "moodle",
        binding: buildMoodleDeploymentBinding(),
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("lms", "moodle");
  formData.set("ltiProfileOverride", "certification");

  const response = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/deployment/lti-profile",
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
  assertEquals(
    (
      await repository.getDeploymentBySlug("chapter-4-asteroids-moodle")
    )?.ltiProfileOverride,
    "certification",
  );
  assertEquals(
    (
      await repository.getDeploymentBySlug("chapter-4-asteroids-pilot")
    )?.ltiProfileOverride,
    null,
  );
  assertEquals(
    (await repository.getLanternLtiProfileSettings()).defaultLtiProfile,
    "governedCompatibility",
  );
});

Deno.test("POST /admin/packages/:appId/deployment/lti-profile clears the selected deployment override back to inherited mode", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 4,
        slug: "chapter-4-asteroids-moodle",
        label: "Chapter 4 Asteroids Moodle Deployment",
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
        lmsType: "moodle",
        binding: buildMoodleDeploymentBinding(),
        ltiProfileOverride: "certification",
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: "governedCompatibility",
      updatedAt: "2026-03-24T13:00:00Z",
    },
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("lms", "moodle");
  formData.set("ltiProfileOverride", "");

  const response = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/deployment/lti-profile",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    (
      await repository.getDeploymentBySlug("chapter-4-asteroids-moodle")
    )?.ltiProfileOverride,
    null,
  );
  assertEquals(
    (await repository.getLanternLtiProfileSettings()).defaultLtiProfile,
    "governedCompatibility",
  );
});
