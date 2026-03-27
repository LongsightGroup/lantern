import { assertEquals, assertExists } from "@std/assert";
import { buildAuditEventRecord } from "../test_helpers/package_review.ts";
import {
  bootstrapPackageReviewSchema,
  resetPackageReviewTables,
  withPackageReviewTestDatabase,
} from "../test_helpers/postgres.ts";
import { mapInventoryRow } from "./repository_mapping.ts";
import type { InventoryQueryRow } from "./repository_types.ts";
import type { DeploymentActivitySnapshot } from "./types.ts";
import {
  createOpsRepositoryForTest,
  insertAuditEvent,
} from "./repository_test_core_support.ts";
import { seedOpsRepositoryFixtures } from "./repository_test_seed.ts";

Deno.test("ops inventory mapping keeps exact Canvas, Moodle, and Sakai bindings legible in shared control-plane rows", () => {
  const canvasInventory = mapInventoryRow(
    buildInventoryQueryRow({
      bindingLmsType: "canvas",
      bindingCanvasEnvironment: "production",
      bindingIssuer: "https://canvas.instructure.com",
      bindingClientId: "10000000000001",
      bindingDeploymentId: "canvas-deployment-123",
    }),
    null,
  );
  const moodleInventory = mapInventoryRow(
    buildInventoryQueryRow({
      deploymentId: 2,
      deploymentSlug: "chapter-4-asteroids-moodle",
      deploymentLabel: "Chapter 4 Asteroids Moodle Deployment",
      bindingLmsType: "moodle",
      bindingCanvasEnvironment: null,
      bindingIssuer: "https://moodle.example",
      bindingClientId: "moodle-client-123",
      bindingDeploymentId: "moodle-deployment-123",
      bindingMoodleAuthenticationRequestUrl:
        "https://moodle.example/mod/lti/auth.php",
      bindingMoodleAccessTokenUrl: "https://moodle.example/mod/lti/token.php",
      bindingMoodleJwksUrl: "https://moodle.example/mod/lti/certs.php",
    }),
    null,
  );
  const sakaiInventory = mapInventoryRow(
    buildInventoryQueryRow({
      deploymentId: 3,
      deploymentSlug: "chapter-4-asteroids-sakai",
      deploymentLabel: "Chapter 4 Asteroids Sakai Deployment",
      bindingLmsType: "sakai",
      bindingCanvasEnvironment: null,
      bindingIssuer: "https://sakai.example",
      bindingClientId: "sakai-client-123",
      bindingDeploymentId: "sakai-deployment-123",
      bindingSakaiOidcAuthenticationUrl:
        "https://sakai.example/imsoidc/lti13/oidc_auth",
      bindingSakaiAccessTokenUrl: "https://sakai.example/imsblis/lti13/token/3",
      bindingSakaiJwksUrl: "https://sakai.example/imsblis/lti13/keyset",
    }),
    null,
  );

  assertEquals(canvasInventory.binding, {
    lms: "canvas",
    canvasEnvironment: "production",
    issuer: "https://canvas.instructure.com",
    clientId: "10000000000001",
    deploymentId: "canvas-deployment-123",
  });
  assertEquals(moodleInventory.binding, {
    lms: "moodle",
    issuer: "https://moodle.example",
    clientId: "moodle-client-123",
    deploymentId: "moodle-deployment-123",
    authenticationRequestUrl: "https://moodle.example/mod/lti/auth.php",
    accessTokenUrl: "https://moodle.example/mod/lti/token.php",
    jwksUrl: "https://moodle.example/mod/lti/certs.php",
  });
  assertEquals(sakaiInventory.binding, {
    lms: "sakai",
    issuer: "https://sakai.example",
    clientId: "sakai-client-123",
    deploymentId: "sakai-deployment-123",
    oidcAuthenticationUrl: "https://sakai.example/imsoidc/lti13/oidc_auth",
    accessTokenUrl: "https://sakai.example/imsblis/lti13/token/3",
    jwksUrl: "https://sakai.example/imsblis/lti13/keyset",
  });
  assertEquals(
    canvasInventory.health.dimensions.enablement.summary,
    "Deployment pin and Canvas binding are present.",
  );
  assertEquals(
    moodleInventory.health.dimensions.enablement.summary,
    "Deployment pin and Moodle binding are present.",
  );
  assertEquals(
    sakaiInventory.health.dimensions.enablement.summary,
    "Deployment pin and Sakai binding are present.",
  );
});

Deno.test("ops inventory health keeps broker verification wording deployment-scoped across canvas, moodle, and sakai", () => {
  const canvasInventory = mapInventoryRow(
    buildInventoryQueryRow({
      internalBrokerVerificationScope: "canvasLti13LaunchAgsNrps",
      internalBrokerVerificationSource: "manual",
      internalBrokerVerificationStatus: "passed",
      internalBrokerVerificationSummary:
        "Canvas launch, AGS publish, and NRPS verification passed.",
      internalBrokerVerificationCheckedAt: "2026-03-24T12:50:00Z",
    }),
  );
  const moodleInventory = mapInventoryRow(
    buildInventoryQueryRow({
      deploymentId: 2,
      deploymentSlug: "chapter-4-asteroids-moodle",
      deploymentLabel: "Chapter 4 Asteroids Moodle Deployment",
      bindingLmsType: "moodle",
      bindingCanvasEnvironment: null,
      bindingIssuer: "https://moodle.example",
      bindingClientId: "moodle-client-123",
      bindingDeploymentId: "moodle-deployment-123",
      bindingMoodleAuthenticationRequestUrl:
        "https://moodle.example/mod/lti/auth.php",
      bindingMoodleAccessTokenUrl: "https://moodle.example/mod/lti/token.php",
      bindingMoodleJwksUrl: "https://moodle.example/mod/lti/certs.php",
      internalBrokerVerificationScope: "moodleLti13LaunchAgsScore",
      internalBrokerVerificationSource: "ci",
      internalBrokerVerificationStatus: "failed",
      internalBrokerVerificationSummary:
        "Latest Moodle CI verification failed on the AGS score publish.",
      internalBrokerVerificationCheckedAt: "2026-03-24T13:10:00Z",
    }),
  );
  const sakaiInventory = mapInventoryRow(
    buildInventoryQueryRow({
      deploymentId: 3,
      deploymentSlug: "chapter-4-asteroids-sakai",
      deploymentLabel: "Chapter 4 Asteroids Sakai Deployment",
      bindingLmsType: "sakai",
      bindingCanvasEnvironment: null,
      bindingIssuer: "https://sakai.example",
      bindingClientId: "sakai-client-123",
      bindingDeploymentId: "sakai-deployment-123",
      bindingSakaiOidcAuthenticationUrl:
        "https://sakai.example/imsoidc/lti13/oidc_auth",
      bindingSakaiAccessTokenUrl: "https://sakai.example/imsblis/lti13/token/3",
      bindingSakaiJwksUrl: "https://sakai.example/imsblis/lti13/keyset",
      internalBrokerVerificationScope: "sakaiLti13LaunchAgsScore",
      internalBrokerVerificationSource: "manual",
      internalBrokerVerificationStatus: "pending",
      internalBrokerVerificationSummary:
        "Sakai launch and AGS smoke verification is pending follow-up.",
      internalBrokerVerificationCheckedAt: "2026-03-24T13:20:00Z",
    }),
  );

  assertEquals(
    canvasInventory.health.dimensions.brokerVerification.summary,
    "Latest deployment-scoped broker verification passed.",
  );
  assertEquals(
    moodleInventory.health.dimensions.brokerVerification.summary,
    "Latest deployment-scoped broker verification failed.",
  );
  assertEquals(
    sakaiInventory.health.dimensions.brokerVerification.summary,
    "Deployment-scoped broker verification is still pending.",
  );
});

Deno.test("ops repository lists deployment-centric inventory rows with owner, version, usage metrics, and current health inputs", async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedOpsRepositoryFixtures(pool);

    const repository = await createOpsRepositoryForTest(pool);
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
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedOpsRepositoryFixtures(pool);

    const repository = await createOpsRepositoryForTest(pool);
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
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedOpsRepositoryFixtures(pool);
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

    const repository = await createOpsRepositoryForTest(pool);
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
    assertEquals(
      canvasInstallEvidence.occurredAt,
      "2026-03-24T12:11:00.000Z",
    );
    assertEquals(
      canvasInstallEvidence.summary,
      "Saved Canvas deployment binding.",
    );
    assertEquals(canvasInstallEvidence.detail.lms, "canvas");

    assertExists(moodleInstallEvidence);
    assertEquals(
      moodleInstallEvidence.occurredAt,
      "2026-03-24T12:21:00.000Z",
    );
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
    assertEquals(
      sakaiInstallEvidence.occurredAt,
      "2026-03-24T12:31:00.000Z",
    );
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

Deno.test("ops repository returns deployment detail snapshots with the latest launch, NRPS read, AGS publish, and diagnostics feed", async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedOpsRepositoryFixtures(pool);

    const repository = await createOpsRepositoryForTest(pool);
    const detail = await repository.getControlPlaneDeploymentDetail(1);

    assertExists(detail);
    assertEquals(detail.inventory.deploymentSlug, "chapter-4-asteroids-pilot");
    assertEquals(detail.latestLaunch?.attemptId, "attempt-123");
    assertEquals(detail.latestNrpsRead?.status, "succeeded");
    assertEquals(detail.latestGradePublish?.errorCode, "canvas_score_rejected");
    assertEquals(detail.diagnostics.length, 3);
  });
});

Deno.test("ops repository returns the latest deployment-scoped AGS smoke verification result for the viewed deployment", async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedOpsRepositoryFixtures(pool);
    const client = await pool.connect();

    try {
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 30,
          deploymentRecordId: 2,
          eventType: "deployment.ags_smoke_verified",
          status: "failed",
          summary: "Moodle AGS smoke verification failed.",
          detail: {
            lms: "moodle",
            agsCapable: true,
            publicationStatus: "failed",
            lineItemUrl:
              "https://moodle.example/mod/lti/services.php/2/lineitems/9",
            error: {
              code: "score_publish_failed",
              message: "Moodle score publish failed with status 500.",
            },
          },
          occurredAt: "2026-03-24T12:38:00Z",
        }),
      );
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 31,
          deploymentRecordId: 3,
          eventType: "deployment.ags_smoke_verified",
          status: "succeeded",
          summary: "Sakai AGS smoke verification succeeded.",
          detail: {
            lms: "sakai",
            agsCapable: true,
            publicationStatus: "succeeded",
            lineItemUrl:
              "https://sakai.example/direct/lti/lineitems/course-42/items/9",
          },
          occurredAt: "2026-03-24T12:39:00Z",
        }),
      );
    } finally {
      client.release();
    }

    const repository = await createOpsRepositoryForTest(pool);
    const moodleDetail = await repository.getControlPlaneDeploymentDetail(2);
    const sakaiDetail = await repository.getControlPlaneDeploymentDetail(3);

    assertExists(moodleDetail);
    assertEquals(moodleDetail.latestAgsSmoke?.status, "failed");
    assertEquals(
      moodleDetail.latestAgsSmoke?.summary,
      "Moodle AGS smoke verification failed.",
    );
    assertEquals(moodleDetail.latestAgsSmoke?.detail.lms, "moodle");
    assertEquals(moodleDetail.latestAgsSmoke?.detail.agsCapable, true);
    assertEquals(
      moodleDetail.latestAgsSmoke?.detail.publicationStatus,
      "failed",
    );
    assertEquals(
      moodleDetail.latestAgsSmoke?.detail.lineItemUrl,
      "https://moodle.example/mod/lti/services.php/2/lineitems/9",
    );

    assertExists(sakaiDetail);
    assertEquals(sakaiDetail.latestAgsSmoke?.status, "succeeded");
    assertEquals(
      sakaiDetail.latestAgsSmoke?.summary,
      "Sakai AGS smoke verification succeeded.",
    );
    assertEquals(sakaiDetail.latestAgsSmoke?.detail.lms, "sakai");
    assertEquals(
      sakaiDetail.latestAgsSmoke?.detail.publicationStatus,
      "succeeded",
    );
  });
});

Deno.test("ops repository diagnostics include reviewer events while keeping launch, NRPS, and AGS diagnostics intact", async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedOpsRepositoryFixtures(pool);
    const client = await pool.connect();

    try {
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 4,
          eventType: "reviewer.preview_viewed",
          actorType: "user",
          actorId: "reviewer-123",
          status: "succeeded",
          summary: "Reviewer opened placement evidence.",
          detail: { placementId: "placement-ops-123" },
          occurredAt: "2026-03-24T12:36:00Z",
        }),
      );
    } finally {
      client.release();
    }

    const repository = await createOpsRepositoryForTest(pool);
    const detail = await repository.getControlPlaneDeploymentDetail(1);

    assertExists(detail);
    assertEquals(detail.diagnostics.length, 4);
    assertEquals(
      detail.diagnostics.some((item) => item.eventType === "launch.accepted"),
      true,
    );
    assertEquals(
      detail.diagnostics.some((item) =>
        item.eventType === "deployment.nrps_verified"
      ),
      true,
    );
    assertEquals(
      detail.diagnostics.some((item) =>
        item.eventType === "grade_publish.failed"
      ),
      true,
    );
    assertEquals(
      detail.diagnostics.some((item) =>
        item.eventType === "reviewer.preview_viewed"
      ),
      true,
    );
    assertEquals(
      detail.diagnostics.find((item) =>
        item.eventType === "reviewer.preview_viewed"
      )?.kind,
      "reviewer",
    );
  });
});

Deno.test("ops repository diagnostics keep broker verification wording LMS-neutral with deployment context", async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedOpsRepositoryFixtures(pool);
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

    const repository = await createOpsRepositoryForTest(pool);
    const moodleDetail = await repository.getControlPlaneDeploymentDetail(2);

    assertExists(moodleDetail);
    assertEquals(
      moodleDetail.diagnostics.find((item) =>
        item.eventType === "broker_verification.failed"
      )?.operatorSummary,
      "Broker verification failed for the saved Moodle deployment path.",
    );
  });
});

function buildInventoryQueryRow(
  overrides: Partial<InventoryQueryRow> = {},
): InventoryQueryRow {
  return {
    deploymentId: overrides.deploymentId ?? 1,
    deploymentSlug: overrides.deploymentSlug ?? "chapter-4-asteroids-pilot",
    deploymentLabel: overrides.deploymentLabel ??
      "Chapter 4 Asteroids Pilot Deployment",
    appId: overrides.appId ?? "chapter-4-asteroids",
    appTitle: overrides.appTitle ?? "Chapter 4 Asteroids",
    ownerId: overrides.ownerId ?? "instructor_123",
    enabledPackageVersionId: overrides.enabledPackageVersionId ?? 1,
    enabledPackageVersion: overrides.enabledPackageVersion ?? "0.1.0",
    approvalStatus: overrides.approvalStatus ?? "approved",
    reviewedAt: overrides.reviewedAt ?? "2026-03-23T18:05:00Z",
    bindingLmsType: overrides.bindingLmsType ?? "canvas",
    installEvidenceStatus: overrides.installEvidenceStatus ?? null,
    installEvidenceSummary: overrides.installEvidenceSummary ?? null,
    installEvidenceDetail: overrides.installEvidenceDetail ?? null,
    installEvidenceOccurredAt: overrides.installEvidenceOccurredAt ?? null,
    internalBrokerVerificationScope:
      overrides.internalBrokerVerificationScope ?? null,
    internalBrokerVerificationSource:
      overrides.internalBrokerVerificationSource ?? null,
    internalBrokerVerificationStatus:
      overrides.internalBrokerVerificationStatus ?? null,
    internalBrokerVerificationSummary:
      overrides.internalBrokerVerificationSummary ?? null,
    internalBrokerVerificationDetailUrl:
      overrides.internalBrokerVerificationDetailUrl ?? null,
    internalBrokerVerificationCheckedAt:
      overrides.internalBrokerVerificationCheckedAt ?? null,
    officialBrokerVerificationScope:
      overrides.officialBrokerVerificationScope ?? null,
    officialBrokerVerificationStatus:
      overrides.officialBrokerVerificationStatus ?? null,
    officialBrokerVerificationCertificationState:
      overrides.officialBrokerVerificationCertificationState ?? null,
    officialBrokerVerificationDetailUrl:
      overrides.officialBrokerVerificationDetailUrl ?? null,
    officialBrokerVerificationCheckedAt:
      overrides.officialBrokerVerificationCheckedAt ?? null,
    bindingCanvasEnvironment: overrides.bindingCanvasEnvironment ??
      "production",
    bindingIssuer: overrides.bindingIssuer ?? "https://canvas.instructure.com",
    bindingClientId: overrides.bindingClientId ?? "10000000000001",
    bindingDeploymentId: overrides.bindingDeploymentId ?? "deployment-123",
    bindingMoodleAuthenticationRequestUrl:
      overrides.bindingMoodleAuthenticationRequestUrl ?? null,
    bindingMoodleAccessTokenUrl: overrides.bindingMoodleAccessTokenUrl ?? null,
    bindingMoodleJwksUrl: overrides.bindingMoodleJwksUrl ?? null,
    bindingSakaiOidcAuthenticationUrl:
      overrides.bindingSakaiOidcAuthenticationUrl ?? null,
    bindingSakaiAccessTokenUrl: overrides.bindingSakaiAccessTokenUrl ?? null,
    bindingSakaiJwksUrl: overrides.bindingSakaiJwksUrl ?? null,
    updatedAt: overrides.updatedAt ?? "2026-03-24T12:30:00Z",
    lastLaunchAt: overrides.lastLaunchAt ?? "2026-03-24T12:30:00Z",
    lastLaunchStatus: overrides.lastLaunchStatus ?? "succeeded",
    lastNrpsReadAt: overrides.lastNrpsReadAt ?? "2026-03-24T12:33:00Z",
    lastNrpsReadStatus: overrides.lastNrpsReadStatus ?? "succeeded",
    lastGradePublishAt: overrides.lastGradePublishAt ?? "2026-03-24T12:35:00Z",
    lastGradePublishStatus: overrides.lastGradePublishStatus ?? "failed",
    totalLaunches: overrides.totalLaunches ?? 1,
    attemptsStarted: overrides.attemptsStarted ?? 1,
    attemptsCompleted: overrides.attemptsCompleted ?? 1,
    gradePublishesSucceeded: overrides.gradePublishesSucceeded ?? 0,
    gradePublishesFailed: overrides.gradePublishesFailed ?? 1,
    recentActiveUsers: overrides.recentActiveUsers ?? 1,
    usageLastLaunchAt: overrides.usageLastLaunchAt ?? "2026-03-24T12:30:00Z",
    measuredAt: overrides.measuredAt ?? "2026-03-24T12:50:00Z",
  };
}

function readInventoryInstallEvidence(
  row: unknown,
): DeploymentActivitySnapshot | null {
  return (
    row as { installEvidence?: DeploymentActivitySnapshot | null } | undefined
  )?.installEvidence ?? null;
}

function readDetailInstallEvidence(
  detail: unknown,
): DeploymentActivitySnapshot | null {
  return (
    detail as
      | { latestInstallEvidence?: DeploymentActivitySnapshot | null }
      | undefined
  )?.latestInstallEvidence ?? null;
}
