import { assertEquals, assertExists } from "@std/assert";
import { buildCanvasDeploymentBinding } from "../test_helpers/lti.ts";
import { buildPackageVersionRecord } from "../test_helpers/package_review.ts";
import { withPackageReviewTestDatabase } from "../test_helpers/postgres.ts";
import {
  createOpsRepositoryForTest,
  insertDeployment,
  insertPackageVersion,
} from "./repository_test_core_support.ts";

Deno.test("ops repository returns the latest internal certification evidence per workflow key", async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await seedCanvasCertificationTarget(pool);
    const repository = await createOpsRepositoryForTest(pool);

    await repository.recordBrokerVerificationRun({
      deploymentRecordId: 1,
      source: "manual",
      scope: "lti13LaunchAgsNrps",
      workflowKey: "core",
      status: "passed",
      certificationState: null,
      summary: "Core launch verification passed.",
      detailUrl: "https://example.test/verification/core-pass",
      checkedAt: "2026-03-24T12:50:00Z",
    });
    await repository.recordBrokerVerificationRun({
      deploymentRecordId: 1,
      source: "manual",
      scope: "lti13LaunchAgsNrps",
      workflowKey: "deepLinking",
      status: "failed",
      certificationState: null,
      summary: "Deep Linking verification failed on content-item return.",
      detailUrl: "https://example.test/verification/deep-linking-failed",
      checkedAt: "2026-03-24T12:55:00Z",
    });
    await repository.recordBrokerVerificationRun({
      deploymentRecordId: 1,
      source: "ci",
      scope: "lti13LaunchAgsNrps",
      workflowKey: "nrps",
      status: "pending",
      certificationState: null,
      summary: "NRPS verification is awaiting roster comparison.",
      detailUrl: "https://example.test/verification/nrps-pending",
      checkedAt: "2026-03-24T13:00:00Z",
    });
    await repository.recordBrokerVerificationRun({
      deploymentRecordId: 1,
      source: "ci",
      scope: "lti13LaunchAgsNrps",
      workflowKey: "ags",
      status: "passed",
      certificationState: null,
      summary: "AGS score publish verification passed.",
      detailUrl: "https://example.test/verification/ags-pass",
      checkedAt: "2026-03-24T13:05:00Z",
    });

    const workflowStatuses = await repository
      .listCertificationWorkflowStatuses();
    const statusesByWorkflow = new Map(
      workflowStatuses.map((status) => [status.workflowKey, status] as const),
    );

    assertEquals(
      workflowStatuses.map((status) => status.workflowKey),
      ["core", "deepLinking", "nrps", "ags"],
    );
    assertEquals(
      statusesByWorkflow.get("core")?.latestInternal?.summary,
      "Core launch verification passed.",
    );
    assertEquals(
      statusesByWorkflow.get("deepLinking")?.latestInternal?.summary,
      "Deep Linking verification failed on content-item return.",
    );
    assertEquals(
      statusesByWorkflow.get("nrps")?.latestInternal?.summary,
      "NRPS verification is awaiting roster comparison.",
    );
    assertEquals(
      statusesByWorkflow.get("ags")?.latestInternal?.summary,
      "AGS score publish verification passed.",
    );
  });
});

Deno.test("ops repository keeps official certification evidence global and separate from internal workflow evidence", async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await seedCanvasCertificationTarget(pool);
    const repository = await createOpsRepositoryForTest(pool);

    await repository.recordBrokerVerificationRun({
      deploymentRecordId: 1,
      source: "manual",
      scope: "lti13LaunchAgsNrps",
      workflowKey: "core",
      status: "passed",
      certificationState: null,
      summary: "Core launch verification passed.",
      detailUrl: "https://example.test/verification/core-pass",
      checkedAt: "2026-03-24T12:50:00Z",
    });
    await repository.recordBrokerVerificationRun({
      deploymentRecordId: null,
      source: "1edtech",
      scope: "lti13LaunchAgsNrps",
      workflowKey: "core",
      status: "passed",
      certificationState: "ltiAdvantageCertified",
      summary: "1EdTech lists Lantern as LTI Advantage Certified.",
      detailUrl: "https://example.test/verification/1edtech-directory",
      checkedAt: "2026-03-24T13:00:00Z",
    });

    const workflowStatuses = await repository
      .listCertificationWorkflowStatuses();
    const coreStatus = workflowStatuses.find((status) =>
      status.workflowKey === "core"
    );
    const officialEvidence = await repository
      .getLatestOfficialCertificationEvidence();

    assertEquals(coreStatus?.latestInternal?.deploymentRecordId, 1);
    assertEquals(
      coreStatus?.latestInternal?.summary,
      "Core launch verification passed.",
    );
    assertExists(officialEvidence);
    assertEquals(officialEvidence.workflowKey, "core");
    assertEquals(officialEvidence.state, "ltiAdvantageCertified");
    assertEquals(
      officialEvidence.directoryUrl,
      "https://example.test/verification/1edtech-directory",
    );
    assertEquals(officialEvidence.checkedAt, "2026-03-24T13:00:00.000Z");

    const client = await pool.connect();

    try {
      const result = await client.queryObject<
        { deploymentRecordId: number | null }
      >({
        text: `
          SELECT deployment_record_id
          FROM broker_verification_runs
          WHERE source = '1edtech'
            AND workflow_key = 'core'
          ORDER BY checked_at DESC, id DESC
          LIMIT 1
        `,
        camelCase: true,
      });

      assertEquals(result.rows[0]?.deploymentRecordId ?? null, null);
    } finally {
      client.release();
    }
  });
});

Deno.test("ops repository ignores legacy coarse verification rows without a workflow key", async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await seedCanvasCertificationTarget(pool);
    const repository = await createOpsRepositoryForTest(pool);
    const client = await pool.connect();

    try {
      await client.queryArray({
        text: `
          INSERT INTO broker_verification_runs (
            deployment_record_id,
            scope,
            source,
            status,
            summary,
            detail_url,
            certification_state,
            checked_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        args: [
          1,
          "lti13LaunchAgsNrps",
          "manual",
          "passed",
          "Legacy coarse verification row.",
          "https://example.test/verification/legacy-row",
          null,
          "2026-03-24T12:40:00Z",
        ],
      });
    } finally {
      client.release();
    }

    const workflowStatuses = await repository
      .listCertificationWorkflowStatuses();

    for (const workflowStatus of workflowStatuses) {
      assertEquals(workflowStatus.latestInternal, null);
    }

    assertEquals(
      await repository.getLatestOfficialCertificationEvidence(),
      null,
    );
  });
});

async function seedCanvasCertificationTarget(
  pool: Parameters<typeof createOpsRepositoryForTest>[0],
): Promise<void> {
  const packageVersion = buildPackageVersionRecord({
    id: 1,
    approvalStatus: "approved",
    reviewedAt: "2026-03-23T18:05:00Z",
  });
  const client = await pool.connect();

  try {
    await insertPackageVersion(client, packageVersion);
    await insertDeployment(
      client,
      packageVersion.appId,
      packageVersion.id,
      buildCanvasDeploymentBinding(),
      {
        id: 1,
        slug: "chapter-4-asteroids-pilot",
        label: "Chapter 4 Asteroids Pilot Deployment",
      },
    );
  } finally {
    client.release();
  }
}
