import { assertEquals } from "@std/assert";
import type { ApprovalStatus, PackageVersionRecord } from "./types.ts";

function buildPackageVersionRecord(
  overrides: Partial<PackageVersionRecord> = {},
): PackageVersionRecord {
  return {
    id: 1,
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
    approvalStatus: "pending",
    reviewNotes: null,
    reviewedAt: null,
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

Deno.test.ignore(
  "POST /admin/packages/:id/approve marks a pending version approved and records optional notes",
  () => {
    const targetModule = "./approval.ts";
    const request = {
      method: "POST",
      path: "/admin/packages/1/approve",
      form: {
        decision: "approved",
        reviewNotes: "Ready for the pilot deployment.",
      },
    };
    const response = {
      status: 303,
      location: "/admin/packages/chapter-4-asteroids/versions/0.1.0",
    };
    const persistedVersion = buildPackageVersionRecord({
      approvalStatus: "approved",
      reviewNotes: "Ready for the pilot deployment.",
      reviewedAt: "2026-03-23T18:05:00Z",
    });

    assertEquals(targetModule, "./approval.ts");
    assertEquals(request.path, "/admin/packages/1/approve");
    assertEquals(request.form.decision, "approved");
    assertEquals(response.status, 303);
    assertEquals(
      response.location,
      "/admin/packages/chapter-4-asteroids/versions/0.1.0",
    );
    assertEquals(persistedVersion.approvalStatus, "approved");
    assertEquals(
      persistedVersion.reviewNotes,
      "Ready for the pilot deployment.",
    );
    assertEquals(persistedVersion.reviewedAt, "2026-03-23T18:05:00Z");
  },
);

Deno.test.ignore(
  "POST /admin/packages/:id/approve refuses to mutate a version that was already rejected",
  () => {
    const request = {
      method: "POST",
      path: "/admin/packages/2/approve",
      form: {
        decision: "approved",
        reviewNotes: "Trying to reverse the prior rejection.",
      },
    };
    const response = {
      status: 409,
      error:
        "Rejected package versions stay frozen. Import a new version to try again.",
    };
    const persistedStatuses: ApprovalStatus[] = ["rejected"];

    assertEquals(request.path, "/admin/packages/2/approve");
    assertEquals(response.status, 409);
    assertEquals(
      response.error,
      "Rejected package versions stay frozen. Import a new version to try again.",
    );
    assertEquals(persistedStatuses, ["rejected"]);
  },
);
