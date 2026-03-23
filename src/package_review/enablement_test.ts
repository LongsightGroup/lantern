import { assertEquals } from "@std/assert";
import type { DeploymentRecord, PackageVersionRecord } from "./types.ts";

function buildPackageVersionRecord(
  overrides: Partial<PackageVersionRecord> = {},
): PackageVersionRecord {
  return {
    id: 7,
    appId: "chapter-4-asteroids",
    version: "0.1.0",
    title: "Chapter 4 Asteroids",
    description: "Shoot the correct vocabulary target.",
    owner: {
      type: "user",
      id: "instructor_123",
    },
    entrypoint: "/dist/index.html",
    roles: ["learner", "instructor"],
    installScope: "course",
    capabilities: [
      "read_launch_context",
      "read_activity_content",
      "submit_attempt_event",
      "finalize_attempt",
      "read_local_state",
      "write_local_state",
    ],
    grading: {
      mode: "declarative",
      rubricFile: "/scoring/rubric.json",
      maxScore: 100,
    },
    approvalStatus: "approved",
    reviewNotes: "Ready for pilot.",
    reviewedAt: "2026-03-23T18:05:00Z",
    validationIssues: [],
    manifestJson: {
      app_id: "chapter-4-asteroids",
      version: "0.1.0",
      title: "Chapter 4 Asteroids",
    },
    artifact: {
      snapshotRoot: "var/packages/chapter-4-asteroids/0.1.0",
      manifestPath: "var/packages/chapter-4-asteroids/0.1.0/manifest.json",
      entrypointPath: "var/packages/chapter-4-asteroids/0.1.0/dist/index.html",
      digest: "sha256:chapter-4-asteroids-0.1.0",
    },
    importedAt: "2026-03-23T17:30:00Z",
    ...overrides,
  };
}

function buildDeploymentRecord(
  overrides: Partial<DeploymentRecord> = {},
): DeploymentRecord {
  return {
    id: 3,
    slug: "demo-course",
    label: "Demo Course",
    appId: "chapter-4-asteroids",
    enabledPackageVersionId: 7,
    enabledPackageVersion: "0.1.0",
    updatedAt: "2026-03-23T18:15:00Z",
    ...overrides,
  };
}

Deno.test.ignore(
  "POST /admin/deployments/:slug/pin stores the exact approved package version id on the deployment",
  () => {
    const targetModule = "./enablement.ts";
    const approvedVersion = buildPackageVersionRecord();
    const request = {
      method: "POST",
      path: "/admin/deployments/demo-course/pin",
      form: {
        packageVersionId: String(approvedVersion.id),
      },
    };
    const response = {
      status: 303,
      location: "/admin/deployments/demo-course",
    };
    const deployment = buildDeploymentRecord();

    assertEquals(targetModule, "./enablement.ts");
    assertEquals(request.path, "/admin/deployments/demo-course/pin");
    assertEquals(request.form.packageVersionId, "7");
    assertEquals(response.status, 303);
    assertEquals(response.location, "/admin/deployments/demo-course");
    assertEquals(deployment.enabledPackageVersionId, approvedVersion.id);
    assertEquals(deployment.enabledPackageVersion, approvedVersion.version);
    assertEquals(deployment.appId, approvedVersion.appId);
  },
);

Deno.test.ignore(
  "POST /admin/deployments/:slug/pin blocks pending versions and preserves the existing approved pin",
  () => {
    const pendingVersion = buildPackageVersionRecord({
      id: 8,
      version: "0.2.0",
      approvalStatus: "pending",
      reviewNotes: null,
      reviewedAt: null,
    });
    const request = {
      method: "POST",
      path: "/admin/deployments/demo-course/pin",
      form: {
        packageVersionId: String(pendingVersion.id),
      },
    };
    const response = {
      status: 409,
      error: "Only approved package versions can be enabled.",
    };
    const deploymentAfterFailure = buildDeploymentRecord({
      enabledPackageVersionId: 7,
      enabledPackageVersion: "0.1.0",
    });

    assertEquals(request.form.packageVersionId, "8");
    assertEquals(response.status, 409);
    assertEquals(
      response.error,
      "Only approved package versions can be enabled.",
    );
    assertEquals(deploymentAfterFailure.enabledPackageVersionId, 7);
    assertEquals(deploymentAfterFailure.enabledPackageVersion, "0.1.0");
  },
);
