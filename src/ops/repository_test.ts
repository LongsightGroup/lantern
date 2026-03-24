import { assertEquals } from "@std/assert";
import type { Pool } from "@db/postgres";
import {
  buildAttemptRecord,
  buildAuditEventRecord,
  buildCanvasLineItemBindingRecord,
  buildGradePublicationRecord,
  buildPackageVersionRecord,
} from "../test_helpers/package_review.ts";
import {
  bootstrapPackageReviewSchema,
  resetPackageReviewTables,
  withPackageReviewTestDatabase,
} from "../test_helpers/postgres.ts";
import {
  buildDeploymentBinding,
  buildRuntimeSessionRecord,
} from "../test_helpers/lti.ts";

async function seedOpsRepositoryFixtures(pool: Pool): Promise<void> {
  const packageVersion = buildPackageVersionRecord({
    id: 1,
    approvalStatus: "approved",
    reviewedAt: "2026-03-23T18:05:00Z",
  });
  const deploymentBinding = buildDeploymentBinding();
  const attempt = buildAttemptRecord({
    id: 1,
    attemptId: "attempt-123",
    status: "completed",
    completionState: "completed",
    finalizedAt: "2026-03-24T12:31:00Z",
  });
  const otherAttempt = buildAttemptRecord({
    id: 2,
    attemptId: "attempt-999",
    userId: "canvas-user-999",
    startedAt: "2026-03-24T12:40:00Z",
  });
  const lineItemBinding = buildCanvasLineItemBindingRecord({
    id: 1,
    deploymentRecordId: 1,
    packageVersionId: 1,
  });
  const gradePublication = buildGradePublicationRecord({
    id: 1,
    attemptId: "attempt-123",
    lineItemBindingId: 1,
    status: "failed",
    gradingProgress: "Failed",
    publishedAt: null,
    updatedAt: "2026-03-24T12:35:00Z",
    errorCode: "canvas_score_rejected",
    errorDetail: {
      httpStatus: 422,
    },
  });
  const launchAuditEvent = buildAuditEventRecord({
    id: 1,
    eventType: "launch.accepted",
    status: "succeeded",
    summary: "Accepted Canvas launch.",
    occurredAt: "2026-03-24T12:30:00Z",
  });
  const nrpsAuditEvent = buildAuditEventRecord({
    id: 2,
    eventType: "deployment.nrps_verified",
    status: "succeeded",
    summary: "Verified roster access for the deployment.",
    occurredAt: "2026-03-24T12:33:00Z",
    detail: {
      contextId: "course-42",
      memberCount: 2,
    },
  });
  const publishAuditEvent = buildAuditEventRecord({
    id: 3,
    eventType: "grade_publish.failed",
    status: "failed",
    summary: "Canvas rejected the score publish.",
    occurredAt: "2026-03-24T12:35:00Z",
    detail: {
      code: "canvas_score_rejected",
      httpStatus: 422,
    },
  });
  const runtimeSession = buildRuntimeSessionRecord({
    sessionId: "runtime-session-123",
    attemptId: "attempt-123",
    createdAt: "2026-03-24T12:30:00Z",
    expiresAt: "2026-03-25T12:30:00Z",
  });
  const laterDeploymentSession = buildRuntimeSessionRecord({
    sessionId: "runtime-session-999",
    sessionToken: "runtime-token-999",
    attemptId: "attempt-999",
    createdAt: "2026-03-24T12:40:00Z",
    expiresAt: "2026-03-25T12:40:00Z",
  });
  const client = await pool.connect();

  try {
    await client.queryArray("BEGIN");
    await client.queryArray({
      text: `
        INSERT INTO package_versions (
          id,
          app_id,
          version,
          title,
          description,
          owner_type,
          owner_id,
          entrypoint,
          roles,
          install_scope,
          capabilities,
          grading_mode,
          grading_rubric_file,
          grading_max_score,
          approval_status,
          review_notes,
          reviewed_at,
          validation_issues,
          manifest_json,
          artifact_root,
          artifact_digest,
          imported_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18::jsonb, $19::jsonb, $20, $21, $22
        )
      `,
      args: [
        packageVersion.id,
        packageVersion.appId,
        packageVersion.version,
        packageVersion.title,
        packageVersion.description,
        packageVersion.owner.type,
        packageVersion.owner.id,
        packageVersion.entrypoint,
        packageVersion.roles,
        packageVersion.installScope,
        packageVersion.capabilities,
        packageVersion.grading.mode,
        packageVersion.grading.rubricFile,
        packageVersion.grading.maxScore,
        packageVersion.approvalStatus,
        packageVersion.reviewNotes,
        packageVersion.reviewedAt,
        JSON.stringify(packageVersion.validationIssues),
        JSON.stringify(packageVersion.manifestJson),
        packageVersion.artifact.snapshotRoot,
        packageVersion.artifact.digest,
        packageVersion.importedAt,
      ],
    });
    await client.queryArray({
      text: `
        INSERT INTO deployments (
          id,
          slug,
          label,
          app_id,
          enabled_package_version_id,
          canvas_environment,
          issuer,
          client_id,
          deployment_id,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      args: [
        1,
        "chapter-4-asteroids-pilot",
        "Chapter 4 Asteroids Pilot Deployment",
        packageVersion.appId,
        packageVersion.id,
        deploymentBinding.canvasEnvironment,
        deploymentBinding.issuer,
        deploymentBinding.clientId,
        deploymentBinding.deploymentId,
        "2026-03-24T12:30:00Z",
      ],
    });
    await client.queryArray({
      text: `
        INSERT INTO attempts (
          id,
          attempt_id,
          deployment_record_id,
          deployment_slug,
          app_id,
          package_version_id,
          package_version,
          user_id,
          user_role,
          context_id,
          resource_link_id,
          activity_id,
          status,
          completion_state,
          started_at,
          finalized_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16
        )
      `,
      args: [
        attempt.id,
        attempt.attemptId,
        attempt.deploymentRecordId,
        attempt.deploymentSlug,
        attempt.appId,
        attempt.packageVersionId,
        attempt.packageVersion,
        attempt.userId,
        attempt.userRole,
        attempt.contextId,
        attempt.resourceLinkId,
        attempt.activityId,
        attempt.status,
        attempt.completionState,
        attempt.startedAt,
        attempt.finalizedAt,
      ],
    });
    await client.queryArray({
      text: `
        INSERT INTO attempts (
          id,
          attempt_id,
          deployment_record_id,
          deployment_slug,
          app_id,
          package_version_id,
          package_version,
          user_id,
          user_role,
          context_id,
          resource_link_id,
          activity_id,
          status,
          completion_state,
          started_at,
          finalized_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16
        )
      `,
      args: [
        otherAttempt.id,
        otherAttempt.attemptId,
        otherAttempt.deploymentRecordId,
        otherAttempt.deploymentSlug,
        otherAttempt.appId,
        otherAttempt.packageVersionId,
        otherAttempt.packageVersion,
        otherAttempt.userId,
        otherAttempt.userRole,
        otherAttempt.contextId,
        otherAttempt.resourceLinkId,
        otherAttempt.activityId,
        otherAttempt.status,
        otherAttempt.completionState,
        otherAttempt.startedAt,
        otherAttempt.finalizedAt,
      ],
    });
    await client.queryArray({
      text: `
        INSERT INTO runtime_sessions (
          session_id,
          session_token,
          attempt_id,
          deployment_record_id,
          deployment_slug,
          app_id,
          package_version_id,
          package_version,
          capabilities,
          snapshot_root,
          entrypoint_path,
          content_path,
          ags_scope,
          ags_lineitems_url,
          ags_lineitem_url,
          nrps_context_memberships_url,
          nrps_service_versions,
          launch_user_role,
          launch_course_id,
          launch_assignment_id,
          launch_activity_id,
          created_at,
          expires_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23
        )
      `,
      args: [
        runtimeSession.sessionId,
        runtimeSession.sessionToken,
        runtimeSession.attemptId,
        runtimeSession.deploymentRecordId,
        runtimeSession.deploymentSlug,
        runtimeSession.appId,
        runtimeSession.packageVersionId,
        runtimeSession.packageVersion,
        runtimeSession.capabilities,
        runtimeSession.snapshotRoot,
        runtimeSession.entrypointPath,
        runtimeSession.contentPath,
        runtimeSession.services.ags?.scope ?? [],
        runtimeSession.services.ags?.lineitemsUrl ?? null,
        runtimeSession.services.ags?.lineitemUrl ?? null,
        runtimeSession.services.nrps?.contextMembershipsUrl ?? null,
        runtimeSession.services.nrps?.serviceVersions ?? [],
        runtimeSession.launch.userRole,
        runtimeSession.launch.courseId,
        runtimeSession.launch.assignmentId ?? null,
        runtimeSession.launch.activityId,
        runtimeSession.createdAt,
        runtimeSession.expiresAt,
      ],
    });
    await client.queryArray({
      text: `
        INSERT INTO runtime_sessions (
          session_id,
          session_token,
          attempt_id,
          deployment_record_id,
          deployment_slug,
          app_id,
          package_version_id,
          package_version,
          capabilities,
          snapshot_root,
          entrypoint_path,
          content_path,
          ags_scope,
          ags_lineitems_url,
          ags_lineitem_url,
          nrps_context_memberships_url,
          nrps_service_versions,
          launch_user_role,
          launch_course_id,
          launch_assignment_id,
          launch_activity_id,
          created_at,
          expires_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23
        )
      `,
      args: [
        laterDeploymentSession.sessionId,
        laterDeploymentSession.sessionToken,
        laterDeploymentSession.attemptId,
        laterDeploymentSession.deploymentRecordId,
        laterDeploymentSession.deploymentSlug,
        laterDeploymentSession.appId,
        laterDeploymentSession.packageVersionId,
        laterDeploymentSession.packageVersion,
        laterDeploymentSession.capabilities,
        laterDeploymentSession.snapshotRoot,
        laterDeploymentSession.entrypointPath,
        laterDeploymentSession.contentPath,
        laterDeploymentSession.services.ags?.scope ?? [],
        laterDeploymentSession.services.ags?.lineitemsUrl ?? null,
        laterDeploymentSession.services.ags?.lineitemUrl ?? null,
        laterDeploymentSession.services.nrps?.contextMembershipsUrl ?? null,
        laterDeploymentSession.services.nrps?.serviceVersions ?? [],
        laterDeploymentSession.launch.userRole,
        laterDeploymentSession.launch.courseId,
        laterDeploymentSession.launch.assignmentId ?? null,
        laterDeploymentSession.launch.activityId,
        laterDeploymentSession.createdAt,
        laterDeploymentSession.expiresAt,
      ],
    });
    await client.queryArray({
      text: `
        INSERT INTO canvas_line_item_bindings (
          id,
          deployment_record_id,
          package_version_id,
          context_id,
          resource_link_id,
          activity_id,
          line_items_url,
          line_item_url,
          resource_id,
          tag,
          label,
          score_maximum,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
      `,
      args: [
        lineItemBinding.id,
        lineItemBinding.deploymentRecordId,
        lineItemBinding.packageVersionId,
        lineItemBinding.contextId,
        lineItemBinding.resourceLinkId,
        lineItemBinding.activityId,
        lineItemBinding.lineItemsUrl,
        lineItemBinding.lineItemUrl,
        lineItemBinding.resourceId,
        lineItemBinding.tag,
        lineItemBinding.label,
        lineItemBinding.scoreMaximum,
        lineItemBinding.createdAt,
        lineItemBinding.updatedAt,
      ],
    });
    await client.queryArray({
      text: `
        INSERT INTO grade_publications (
          id,
          attempt_id,
          line_item_binding_id,
          line_item_url,
          canvas_user_id,
          score_given,
          score_maximum,
          activity_progress,
          grading_progress,
          status,
          created_at,
          updated_at,
          published_at,
          error_code,
          error_detail
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15::jsonb
        )
      `,
      args: [
        gradePublication.id,
        gradePublication.attemptId,
        gradePublication.lineItemBindingId,
        gradePublication.lineItemUrl,
        gradePublication.canvasUserId,
        gradePublication.scoreGiven,
        gradePublication.scoreMaximum,
        gradePublication.activityProgress,
        gradePublication.gradingProgress,
        gradePublication.status,
        gradePublication.createdAt,
        gradePublication.updatedAt,
        gradePublication.publishedAt,
        gradePublication.errorCode,
        JSON.stringify(gradePublication.errorDetail),
      ],
    });
    await insertAuditEvent(client, launchAuditEvent);
    await insertAuditEvent(client, nrpsAuditEvent);
    await insertAuditEvent(client, publishAuditEvent);
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
        "canvasLti13LaunchAgsNrps",
        "manual",
        "passed",
        "Canvas launch, AGS publish, and NRPS verification passed.",
        "https://example.test/internal-proof",
        null,
        "2026-03-24T12:50:00Z",
      ],
    });
    await client.queryArray("COMMIT");
  } catch (error) {
    await client.queryArray("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertAuditEvent(
  client: Awaited<ReturnType<Pool["connect"]>>,
  event: ReturnType<typeof buildAuditEventRecord>,
): Promise<void> {
  await client.queryArray({
    text: `
      INSERT INTO audit_events (
        id,
        event_type,
        actor_type,
        actor_id,
        deployment_record_id,
        package_version_id,
        attempt_id,
        line_item_binding_id,
        status,
        summary,
        detail,
        occurred_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12
      )
    `,
    args: [
      event.id,
      event.eventType,
      event.actorType,
      event.actorId,
      event.deploymentRecordId,
      event.packageVersionId,
      event.attemptId,
      event.lineItemBindingId,
      event.status,
      event.summary,
      JSON.stringify(event.detail),
      event.occurredAt,
    ],
  });
}

Deno.test(
  "ops repository lists deployment-centric inventory rows with owner, version, usage metrics, and current health inputs",
  async () => {
    await withPackageReviewTestDatabase(async (pool) => {
      await bootstrapPackageReviewSchema(pool);
      await resetPackageReviewTables(pool);
      await seedOpsRepositoryFixtures(pool);

      const modulePath = `./${"repository.ts"}`;
      const opsRepositoryModule = await import(modulePath);
      const repository = opsRepositoryModule.createOpsRepository(pool);
      const rows = await repository.listControlPlaneDeployments();

      assertEquals(rows.length, 1);
      assertEquals(rows[0]?.deploymentSlug, "chapter-4-asteroids-pilot");
      assertEquals(rows[0]?.ownerId, "instructor_123");
      assertEquals(rows[0]?.enabledPackageVersion, "0.1.0");
      assertEquals(rows[0]?.pilotUsage.attemptsCompleted, 1);
      assertEquals(rows[0]?.lastGradePublishStatus, "failed");
    });
  },
);

Deno.test(
  "ops repository returns deployment detail snapshots with the latest launch, NRPS read, AGS publish, and diagnostics feed",
  async () => {
    await withPackageReviewTestDatabase(async (pool) => {
      await bootstrapPackageReviewSchema(pool);
      await resetPackageReviewTables(pool);
      await seedOpsRepositoryFixtures(pool);

      const modulePath = `./${"repository.ts"}`;
      const opsRepositoryModule = await import(modulePath);
      const repository = opsRepositoryModule.createOpsRepository(pool);
      const detail = await repository.getControlPlaneDeploymentDetail(1);

      assertEquals(
        detail.inventory.deploymentSlug,
        "chapter-4-asteroids-pilot",
      );
      assertEquals(detail.latestLaunch?.attemptId, "attempt-123");
      assertEquals(detail.latestNrpsRead?.status, "succeeded");
      assertEquals(
        detail.latestGradePublish?.errorCode,
        "canvas_score_rejected",
      );
      assertEquals(detail.diagnostics.length, 3);
    });
  },
);

Deno.test(
  "ops repository records broker verification runs and returns the latest internal result separately from the latest official certification result",
  async () => {
    await withPackageReviewTestDatabase(async (pool) => {
      await bootstrapPackageReviewSchema(pool);
      await resetPackageReviewTables(pool);

      const modulePath = `./${"repository.ts"}`;
      const opsRepositoryModule = await import(modulePath);
      const repository = opsRepositoryModule.createOpsRepository(pool);

      await repository.recordBrokerVerificationRun({
        source: "manual",
        scope: "canvasLti13LaunchAgsNrps",
        status: "passed",
        certificationState: null,
        summary: "Manual verification passed for the supported Canvas path.",
        detailUrl: "https://example.test/verification/manual-pass",
        checkedAt: "2026-03-24T12:50:00Z",
      });
      await repository.recordBrokerVerificationRun({
        source: "ci",
        scope: "canvasLti13LaunchAgsNrps",
        status: "failed",
        certificationState: null,
        summary: "Latest CI verification failed on the AGS publish step.",
        detailUrl: "https://example.test/verification/ci-failure",
        checkedAt: "2026-03-24T12:55:00Z",
      });
      await repository.recordBrokerVerificationRun({
        source: "1edtech",
        scope: "canvasLti13LaunchAgsNrps",
        status: "passed",
        certificationState: "ltiAdvantageCertified",
        summary: "1EdTech lists Lantern as LTI Advantage Certified.",
        detailUrl: "https://example.test/verification/1edtech-directory",
        checkedAt: "2026-03-24T13:00:00Z",
      });

      const verification = await repository.getLatestBrokerVerificationStatus();

      assertEquals(verification.supportedPath, "canvasLti13LaunchAgsNrps");
      assertEquals(verification.internal?.source, "ci");
      assertEquals(verification.internal?.status, "failed");
      assertEquals(
        verification.internal?.summary,
        "Latest CI verification failed on the AGS publish step.",
      );
      assertEquals(
        verification.internal?.evidenceUrl,
        "https://example.test/verification/ci-failure",
      );
      assertEquals(verification.official.state, "ltiAdvantageCertified");
      assertEquals(
        verification.official.directoryUrl,
        "https://example.test/verification/1edtech-directory",
      );
      assertEquals(verification.official.checkedAt, "2026-03-24T13:00:00.000Z");
    });
  },
);

Deno.test(
  "ops repository keeps internal verification evidence distinct from an older official not-certified result",
  async () => {
    await withPackageReviewTestDatabase(async (pool) => {
      await bootstrapPackageReviewSchema(pool);
      await resetPackageReviewTables(pool);

      const modulePath = `./${"repository.ts"}`;
      const opsRepositoryModule = await import(modulePath);
      const repository = opsRepositoryModule.createOpsRepository(pool);

      await repository.recordBrokerVerificationRun({
        source: "1edtech",
        scope: "canvasLti13LaunchAgsNrps",
        status: "notCertified",
        certificationState: null,
        summary:
          "1EdTech does not list Lantern in the certification directory.",
        detailUrl: "https://example.test/verification/1edtech-directory",
        checkedAt: "2026-03-24T12:40:00Z",
      });
      await repository.recordBrokerVerificationRun({
        source: "manual",
        scope: "canvasLti13LaunchAgsNrps",
        status: "passed",
        certificationState: null,
        summary: "Manual launch, AGS, and NRPS verification passed.",
        detailUrl: "https://example.test/verification/manual-pass",
        checkedAt: "2026-03-24T12:55:00Z",
      });

      const verification = await repository.getLatestBrokerVerificationStatus();

      assertEquals(verification.internal?.source, "manual");
      assertEquals(verification.internal?.status, "passed");
      assertEquals(
        verification.internal?.checkedAt,
        "2026-03-24T12:55:00.000Z",
      );
      assertEquals(verification.official.state, "notCertified");
      assertEquals(verification.official.checkedAt, "2026-03-24T12:40:00.000Z");
      assertEquals(
        verification.official.directoryUrl,
        "https://example.test/verification/1edtech-directory",
      );
    });
  },
);

Deno.test(
  "ops repository does not infer an official certification claim from internal verification evidence alone",
  async () => {
    await withPackageReviewTestDatabase(async (pool) => {
      await bootstrapPackageReviewSchema(pool);
      await resetPackageReviewTables(pool);

      const modulePath = `./${"repository.ts"}`;
      const opsRepositoryModule = await import(modulePath);
      const repository = opsRepositoryModule.createOpsRepository(pool);

      await repository.recordBrokerVerificationRun({
        source: "ci",
        scope: "canvasLti13LaunchAgsNrps",
        status: "passed",
        certificationState: null,
        summary: "CI verification passed for the supported broker path.",
        detailUrl: "https://example.test/verification/ci-pass",
        checkedAt: "2026-03-24T12:45:00Z",
      });

      const verification = await repository.getLatestBrokerVerificationStatus();

      assertEquals(verification.internal?.status, "passed");
      assertEquals(verification.official.state, "notCertified");
      assertEquals(verification.official.checkedAt, null);
      assertEquals(verification.official.directoryUrl, null);
    });
  },
);

Deno.test(
  "ops repository resolves retry lookups by attempt-scoped runtime session rather than the latest session for the deployment",
  async () => {
    await withPackageReviewTestDatabase(async (pool) => {
      await bootstrapPackageReviewSchema(pool);
      await resetPackageReviewTables(pool);
      await seedOpsRepositoryFixtures(pool);

      const modulePath = `./${"repository.ts"}`;
      const opsRepositoryModule = await import(modulePath);
      const repository = opsRepositoryModule.createOpsRepository(pool);
      const lookup = await repository.getRetryableGradePublicationLookup(
        "attempt-123",
      );

      assertEquals(lookup.attemptId, "attempt-123");
      assertEquals(lookup.runtimeSession?.sessionId, "runtime-session-123");
      assertEquals(lookup.runtimeSession?.attemptId, "attempt-123");
      assertEquals(lookup.publication.status, "failed");
      assertEquals(
        lookup.runtimeSession?.sessionId === "runtime-session-999",
        false,
      );
    });
  },
);

Deno.test(
  "ops repository only returns retry lookups for failed grade publications",
  async () => {
    await withPackageReviewTestDatabase(async (pool) => {
      await bootstrapPackageReviewSchema(pool);
      await resetPackageReviewTables(pool);
      await seedOpsRepositoryFixtures(pool);

      const client = await pool.connect();

      try {
        await client.queryArray({
          text: `
            UPDATE grade_publications
            SET status = 'published',
                published_at = $2,
                updated_at = $2,
                error_code = NULL,
                error_detail = NULL
            WHERE attempt_id = $1
          `,
          args: ["attempt-123", "2026-03-24T12:45:00Z"],
        });
      } finally {
        client.release();
      }

      const modulePath = `./${"repository.ts"}`;
      const opsRepositoryModule = await import(modulePath);
      const repository = opsRepositoryModule.createOpsRepository(pool);
      const lookup = await repository.getRetryableGradePublicationLookup(
        "attempt-123",
      );

      assertEquals(lookup, null);
    });
  },
);
