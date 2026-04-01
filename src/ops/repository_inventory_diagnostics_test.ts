import { assertEquals, assertExists } from "@std/assert";
import { buildAuditEventRecord } from "../test_helpers/package_review.ts";
import { insertAuditEvent } from "./repository_test_core_support.ts";
import { withSeededOpsRepositoryTest } from "./repository_inventory_test_support.ts";

Deno.test("ops repository diagnostics keep only failed follow-up items while recent launches stay on their own list", async () => {
  await withSeededOpsRepositoryTest(async (pool, repository) => {
    const client = await pool.connect();

    try {
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 4,
          eventType: "reviewer.follow_up_failed",
          actorType: "user",
          actorId: "reviewer-123",
          status: "failed",
          summary: "Reviewer follow-up failed.",
          detail: { placementId: "placement-ops-123" },
          occurredAt: "2026-03-24T12:36:00Z",
        }),
      );
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 5,
          deploymentRecordId: 1,
          eventType: "deep_linking.request.rejected",
          actorType: "platform",
          status: "failed",
          summary:
            "Rejected a Canvas Deep Linking request before picker handoff.",
          detail: {
            lms: "canvas",
            category: "policyDenied",
            code: "target_link_uri_drift_not_allowed",
            message:
              "Deep Linking target_link_uri drift is not allowed for the active LTI profile.",
            ltiProfileId: "certification",
            ltiProfileSource: "deploymentOverride",
          },
          occurredAt: "2026-03-24T12:37:00Z",
        }),
      );
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 6,
          deploymentRecordId: 1,
          eventType: "interop.path_used",
          actorType: "platform",
          status: "accepted",
          summary:
            "Lantern tolerated bounded target_link_uri drift during launch validation.",
          detail: {
            scope: "launch",
            path: "target_link_uri_drift",
          },
          occurredAt: "2026-03-24T12:38:00Z",
        }),
      );
    } finally {
      client.release();
    }

    const detail = await repository.getControlPlaneDeploymentDetail(1);

    assertExists(detail);
    assertEquals(
      detail.recentLaunches.some((item) => item.attemptId === "attempt-123"),
      true,
    );
    assertEquals(detail.diagnostics.length, 3);
    assertEquals(
      detail.diagnostics.some((item) => item.eventType === "launch.accepted"),
      false,
    );
    assertEquals(
      detail.diagnostics.some((item) =>
        item.eventType === "deployment.nrps_verified"
      ),
      false,
    );
    assertEquals(
      detail.diagnostics.some((item) =>
        item.eventType === "grade_publish.failed"
      ),
      true,
    );
    assertEquals(
      detail.diagnostics.some((item) =>
        item.eventType === "deep_linking.request.rejected"
      ),
      true,
    );
    assertEquals(
      detail.diagnostics.some((item) => item.eventType === "interop.path_used"),
      false,
    );
    assertEquals(
      detail.diagnostics.some((item) =>
        item.eventType === "reviewer.follow_up_failed"
      ),
      true,
    );
    assertEquals(
      detail.diagnostics.find((item) =>
        item.eventType === "reviewer.follow_up_failed"
      )?.kind,
      "reviewer",
    );
    assertEquals(
      detail.diagnostics.find((item) =>
        item.eventType === "deep_linking.request.rejected"
      )?.kind,
      "deepLinking",
    );
    assertEquals(
      (
        detail.diagnostics.find((item) =>
          item.eventType === "deep_linking.request.rejected"
        ) as
          | ({ boundaryDenialCategory?: string | null } & {
            eventType: string;
          })
          | undefined
      )?.boundaryDenialCategory,
      "policyDenied",
    );
  });
});

Deno.test("ops repository diagnostics keep broker verification wording LMS-neutral with deployment context", async () => {
  await withSeededOpsRepositoryTest(async (pool, repository) => {
    const client = await pool.connect();

    try {
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 20,
          deploymentRecordId: 2,
          eventType: "broker_verification.failed",
          status: "failed",
          summary: "Moodle broker verification failed.",
          detail: {
            lms: "moodle",
          },
          occurredAt: "2026-03-24T12:37:00Z",
        }),
      );
    } finally {
      client.release();
    }

    const moodleDetail = await repository.getControlPlaneDeploymentDetail(2);

    assertExists(moodleDetail);
    assertEquals(
      moodleDetail.diagnostics.find((item) =>
        item.eventType === "broker_verification.failed"
      )
        ?.operatorSummary,
      "Broker verification failed for the saved Moodle deployment path.",
    );
  });
});
