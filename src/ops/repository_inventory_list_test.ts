import { assertEquals, assertExists } from "@std/assert";
import { buildAuditEventRecord } from "../test_helpers/package_review.ts";
import { insertAuditEvent } from "./repository_test_core_support.ts";
import {
  readDetailInstallEvidence,
  readInventoryInstallEvidence,
  withSeededOpsRepositoryTest,
} from "./repository_inventory_test_support.ts";

Deno.test("ops repository lists deployment-centric inventory rows with owner, version, usage metrics, and current health inputs", async () => {
  await withSeededOpsRepositoryTest(async (_pool, repository) => {
    const rows = await repository.listControlPlaneDeployments();
    const canvasRow = rows.find((row) => row.binding?.lms === "canvas");

    assertEquals(rows.length, 3);
    assertExists(canvasRow);
    assertEquals(canvasRow.deploymentSlug, "chapter-4-asteroids-pilot");
    assertEquals(canvasRow.ownerId, "instructor_123");
    assertEquals(canvasRow.enabledPackageVersion, "0.1.0");
    assertEquals(canvasRow.pilotUsage.attemptsCompleted, 1);
    assertEquals(canvasRow.lastGradePublishStatus, "failed");
  });
});

Deno.test("ops repository keeps one app readable across canvas, moodle, and sakai deployment rows", async () => {
  await withSeededOpsRepositoryTest(async (_pool, repository) => {
    const rows = await repository.listControlPlaneDeployments();
    const rowsByLms = new Map(
      rows.map((row) => [row.binding?.lms ?? "missing", row] as const),
    );

    assertEquals(rows.length, 3);
    assertEquals(
      rows.every((row) => row.appId === "chapter-4-asteroids"),
      true,
    );
    assertEquals(
      rowsByLms.get("canvas")?.deploymentSlug,
      "chapter-4-asteroids-pilot",
    );
    assertEquals(
      rowsByLms.get("moodle")?.deploymentSlug,
      "chapter-4-asteroids-moodle",
    );
    assertEquals(
      rowsByLms.get("sakai")?.deploymentSlug,
      "chapter-4-asteroids-sakai",
    );
    assertEquals(
      rowsByLms.get("moodle")?.health.dimensions.enablement.summary,
      "Deployment pin and Moodle binding are present.",
    );
    assertEquals(
      rowsByLms.get("sakai")?.health.dimensions.enablement.summary,
      "Deployment pin and Sakai binding are present.",
    );
  });
});

Deno.test("ops repository surfaces latest deployment binding evidence per deployment in inventory and detail snapshots", async () => {
  await withSeededOpsRepositoryTest(async (pool, repository) => {
    const client = await pool.connect();

    try {
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 10,
          deploymentRecordId: 1,
          eventType: "deployment.binding_saved",
          status: "succeeded",
          summary: "Saved Canvas deployment binding.",
          detail: {
            lms: "canvas",
            deploymentId: "canvas-deployment-123",
          },
          occurredAt: "2026-03-24T12:11:00Z",
        }),
      );
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 11,
          deploymentRecordId: 2,
          eventType: "deployment.binding_saved",
          status: "succeeded",
          summary: "Saved Moodle deployment binding.",
          detail: {
            lms: "moodle",
            deploymentId: "moodle-deployment-123",
          },
          occurredAt: "2026-03-24T12:21:00Z",
        }),
      );
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 12,
          deploymentRecordId: 3,
          eventType: "deployment.binding_saved",
          status: "succeeded",
          summary: "Saved Sakai deployment binding.",
          detail: {
            lms: "sakai",
            deploymentId: "sakai-deployment-123",
          },
          occurredAt: "2026-03-24T12:31:00Z",
        }),
      );
    } finally {
      client.release();
    }

    const rows = await repository.listControlPlaneDeployments();
    const rowsByLms = new Map(
      rows.map((row) => [row.binding?.lms ?? "missing", row] as const),
    );
    const canvasInstallEvidence = readInventoryInstallEvidence(
      rowsByLms.get("canvas"),
    );
    const moodleInstallEvidence = readInventoryInstallEvidence(
      rowsByLms.get("moodle"),
    );
    const sakaiInstallEvidence = readInventoryInstallEvidence(
      rowsByLms.get("sakai"),
    );
    const moodleDetail = await repository.getControlPlaneDeploymentDetail(2);

    assertExists(canvasInstallEvidence);
    assertEquals(canvasInstallEvidence.occurredAt, "2026-03-24T12:11:00.000Z");
    assertEquals(
      canvasInstallEvidence.summary,
      "Saved Canvas deployment binding.",
    );
    assertEquals(canvasInstallEvidence.detail.lms, "canvas");

    assertExists(moodleInstallEvidence);
    assertEquals(moodleInstallEvidence.occurredAt, "2026-03-24T12:21:00.000Z");
    assertEquals(
      moodleInstallEvidence.summary,
      "Saved Moodle deployment binding.",
    );
    assertEquals(moodleInstallEvidence.detail.lms, "moodle");
    assertEquals(
      rowsByLms.get("moodle")?.updatedAt === moodleInstallEvidence.occurredAt,
      false,
    );

    assertExists(sakaiInstallEvidence);
    assertEquals(sakaiInstallEvidence.occurredAt, "2026-03-24T12:31:00.000Z");
    assertEquals(
      sakaiInstallEvidence.summary,
      "Saved Sakai deployment binding.",
    );
    assertEquals(sakaiInstallEvidence.detail.lms, "sakai");

    assertExists(moodleDetail);
    assertEquals(
      readDetailInstallEvidence(moodleDetail)?.summary,
      "Saved Moodle deployment binding.",
    );
    assertEquals(
      readDetailInstallEvidence(moodleDetail)?.detail.deploymentId,
      "moodle-deployment-123",
    );
  });
});
