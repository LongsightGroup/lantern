import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects, runD1 } from '../db/d1.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import { mapAttemptEvidenceArtifactRow } from '../package_review/repository_mappers_attempts.ts';
import type { AttemptEvidenceArtifactRow } from '../package_review/repository_row_types.ts';
import type { AttemptEvidenceArtifactRecord } from '../package_review/types.ts';
import { BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS } from './broker_verification_paths.ts';
import {
  assertBrokerVerificationRunInput,
  mapActivitySnapshotRow,
  mapBrokerVerificationStatusRows,
  mapCertificationWorkflowStatusRow,
  mapDiagnosticRows,
  mapGradePublicationSnapshotRow,
  mapInventoryRow,
  mapLatestOfficialCertificationEvidenceRow,
  mapRecentLaunchRows,
  mapRuntimeEvidenceSnapshotRow,
} from './repository_mapping.ts';
import { mapRetryLookupRow } from './repository_retry_mapping.ts';
import type {
  ActivitySnapshotRow,
  CertificationWorkflowStatusRow,
  DiagnosticRow,
  GradePublicationSnapshotRow,
  InternalBrokerVerificationRow,
  InventoryQueryRow,
  LatestOfficialCertificationEvidenceRow,
  OfficialBrokerVerificationRow,
  OpsRepository,
  RecentLaunchRow,
  RecordBrokerVerificationRunInput,
  RetryLookupRow,
} from './repository_types.ts';
import type {
  ControlPlaneAnonymousEvidenceArtifact,
  ControlPlaneDiagnosticItem,
  ControlPlaneRuntimeEvidenceSnapshot,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
  RetryableGradePublicationLookup,
} from './types.ts';

const DEPLOYMENT_SUPPORTED_PATH_SQL = `
  CASE deployments.lms_type
    WHEN 'canvas' THEN '${BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS.canvas}'
    WHEN 'moodle' THEN '${BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS.moodle}'
    WHEN 'sakai' THEN '${BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS.sakai}'
    ELSE NULL
  END
`;

export function createD1OpsRepository(
  db: D1Database,
  packageReviewRepository: PackageReviewRepository,
): OpsRepository {
  return {
    async listControlPlaneDeployments() {
      const rows = await queryD1Objects<D1InventoryQueryRow>(
        db,
        `${D1_INVENTORY_QUERY} ORDER BY deployments.updated_at DESC, deployments.id DESC`,
      );

      return rows.map((row) => mapInventoryRow(mapD1InventoryRow(row)));
    },

    async getControlPlaneDeploymentDetail(deploymentRecordId) {
      const inventory = await getInventoryRow(db, deploymentRecordId);

      if (inventory === null) {
        return null;
      }

      const latestLaunch = await getActivitySnapshot(
        db,
        D1_LATEST_LAUNCH_QUERY,
        deploymentRecordId,
      );
      const latestRuntimeSession = await getRuntimeEvidenceSnapshot(
        db,
        D1_LATEST_RUNTIME_SESSION_QUERY,
        deploymentRecordId,
      );
      const latestRuntimeOutcome = await getRuntimeEvidenceSnapshot(
        db,
        D1_LATEST_RUNTIME_OUTCOME_QUERY,
        deploymentRecordId,
      );
      const latestGradePublish = await getLatestGradePublication(db, deploymentRecordId);
      const retryableGradePublication =
        latestGradePublish?.status === 'failed'
          ? await getRetryableGradePublicationLookupForD1(db, latestGradePublish.attemptId)
          : null;
      const latestRuntimeAttemptId =
        latestRuntimeOutcome?.attemptId ?? latestRuntimeSession?.attemptId ?? null;

      return {
        inventory,
        latestInstallEvidence: inventory.installEvidence,
        latestLaunch,
        latestRuntimeSession,
        latestRuntimeOutcome,
        latestAnonymousEvidence: deriveLatestAnonymousEvidence(
          inventory.appId,
          latestRuntimeAttemptId === null
            ? []
            : await listAttemptEvidenceArtifacts(db, latestRuntimeAttemptId),
        ),
        recentLaunches: await listRecentAcceptedLaunches(db, deploymentRecordId),
        latestCompatibilityPath: await getActivitySnapshot(
          db,
          D1_LATEST_COMPATIBILITY_PATH_QUERY,
          deploymentRecordId,
        ),
        latestAgsSmoke: await getActivitySnapshot(
          db,
          D1_LATEST_AGS_SMOKE_QUERY,
          deploymentRecordId,
        ),
        latestNrpsRead: await getActivitySnapshot(db, D1_LATEST_NRPS_QUERY, deploymentRecordId),
        latestGradePublish,
        pilotUsage: inventory.pilotUsage,
        diagnostics: await listDiagnostics(
          db,
          deploymentRecordId,
          retryableGradePublication?.attemptId ?? null,
        ),
        retryableGradePublication,
        brokerVerification: inventory.brokerVerification,
      };
    },

    async listCertificationWorkflowStatuses() {
      const workflowKeys = ['core', 'deepLinking', 'nrps', 'ags'] as const;
      const rows: CertificationWorkflowStatusRow[] = [];

      for (const workflowKey of workflowKeys) {
        const row = await queryD1First<D1CertificationWorkflowStatusRow>(
          db,
          `
            SELECT
              ? AS workflowKey,
              broker_verification_runs.deployment_record_id AS deploymentRecordId,
              deployments.label AS deploymentLabel,
              broker_verification_runs.status,
              broker_verification_runs.summary,
              broker_verification_runs.detail_url AS detailUrl,
              broker_verification_runs.checked_at AS checkedAt
            FROM broker_verification_runs
            LEFT JOIN deployments
              ON deployments.id = broker_verification_runs.deployment_record_id
            WHERE broker_verification_runs.workflow_key = ?
              AND broker_verification_runs.deployment_record_id IS NOT NULL
              AND broker_verification_runs.source IN ('manual', 'ci')
            ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
            LIMIT 1
          `,
          [workflowKey, workflowKey],
        );

        rows.push(
          row === null
            ? {
                workflowKey,
                deploymentRecordId: null,
                deploymentLabel: null,
                status: null,
                summary: null,
                detailUrl: null,
                checkedAt: null,
              }
            : mapD1CertificationWorkflowStatusRow(row),
        );
      }

      return rows.map((row) => mapCertificationWorkflowStatusRow(row));
    },

    async getLatestOfficialCertificationEvidence() {
      const row = await queryD1First<D1LatestOfficialCertificationEvidenceRow>(
        db,
        `
          SELECT
            workflow_key AS workflowKey,
            status,
            certification_state AS certificationState,
            summary,
            detail_url AS detailUrl,
            checked_at AS checkedAt
          FROM broker_verification_runs
          WHERE source = '1edtech'
            AND workflow_key IS NOT NULL
          ORDER BY checked_at DESC, id DESC
          LIMIT 1
        `,
      );

      return mapLatestOfficialCertificationEvidenceRow(
        row === null ? null : mapD1LatestOfficialCertificationEvidenceRow(row),
      );
    },

    async getLatestBrokerVerification() {
      return await this.getLatestBrokerVerificationStatus();
    },

    async getLatestBrokerVerificationStatus() {
      return await getLatestBrokerVerificationStatusForD1(db);
    },

    async recordBrokerVerificationRun(input) {
      await recordBrokerVerificationRunForD1(db, input);
    },

    async getRetryableGradePublicationLookup(attemptId) {
      return await getRetryableGradePublicationLookupForD1(db, attemptId);
    },

    async getPlacementAuditSnapshot(placementId) {
      return await packageReviewRepository.requirePlacementAuditSnapshotById(placementId);
    },
  };
}

const D1_INVENTORY_QUERY = `
  SELECT
    deployments.id AS deploymentId,
    deployments.slug AS deploymentSlug,
    deployments.label AS deploymentLabel,
    deployments.app_id AS appId,
    COALESCE(
      enabled_package.title,
      (
        SELECT package_versions.title
        FROM package_versions
        WHERE package_versions.app_id = deployments.app_id
        ORDER BY package_versions.imported_at DESC, package_versions.id DESC
        LIMIT 1
      ),
      deployments.label
    ) AS appTitle,
    COALESCE(
      enabled_package.owner_id,
      (
        SELECT package_versions.owner_id
        FROM package_versions
        WHERE package_versions.app_id = deployments.app_id
        ORDER BY package_versions.imported_at DESC, package_versions.id DESC
        LIMIT 1
      )
    ) AS ownerId,
    deployments.enabled_package_version_id AS enabledPackageVersionId,
    enabled_package.version AS enabledPackageVersion,
    enabled_package.approval_status AS approvalStatus,
    enabled_package.reviewed_at AS reviewedAt,
    deployments.lms_type AS bindingLmsType,
    (
      SELECT audit_events.status
      FROM audit_events
      WHERE audit_events.deployment_record_id = deployments.id
        AND audit_events.event_type = 'deployment.binding_saved'
      ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
      LIMIT 1
    ) AS installEvidenceStatus,
    (
      SELECT audit_events.summary
      FROM audit_events
      WHERE audit_events.deployment_record_id = deployments.id
        AND audit_events.event_type = 'deployment.binding_saved'
      ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
      LIMIT 1
    ) AS installEvidenceSummary,
    (
      SELECT audit_events.detail
      FROM audit_events
      WHERE audit_events.deployment_record_id = deployments.id
        AND audit_events.event_type = 'deployment.binding_saved'
      ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
      LIMIT 1
    ) AS installEvidenceDetail,
    (
      SELECT audit_events.occurred_at
      FROM audit_events
      WHERE audit_events.deployment_record_id = deployments.id
        AND audit_events.event_type = 'deployment.binding_saved'
      ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
      LIMIT 1
    ) AS installEvidenceOccurredAt,
    (
      SELECT broker_verification_runs.scope
      FROM broker_verification_runs
      WHERE broker_verification_runs.deployment_record_id = deployments.id
        AND broker_verification_runs.scope = ${DEPLOYMENT_SUPPORTED_PATH_SQL}
        AND broker_verification_runs.source IN ('manual', 'ci')
      ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
      LIMIT 1
    ) AS internalBrokerVerificationScope,
    (
      SELECT broker_verification_runs.source
      FROM broker_verification_runs
      WHERE broker_verification_runs.deployment_record_id = deployments.id
        AND broker_verification_runs.scope = ${DEPLOYMENT_SUPPORTED_PATH_SQL}
        AND broker_verification_runs.source IN ('manual', 'ci')
      ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
      LIMIT 1
    ) AS internalBrokerVerificationSource,
    (
      SELECT broker_verification_runs.status
      FROM broker_verification_runs
      WHERE broker_verification_runs.deployment_record_id = deployments.id
        AND broker_verification_runs.scope = ${DEPLOYMENT_SUPPORTED_PATH_SQL}
        AND broker_verification_runs.source IN ('manual', 'ci')
      ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
      LIMIT 1
    ) AS internalBrokerVerificationStatus,
    (
      SELECT broker_verification_runs.summary
      FROM broker_verification_runs
      WHERE broker_verification_runs.deployment_record_id = deployments.id
        AND broker_verification_runs.scope = ${DEPLOYMENT_SUPPORTED_PATH_SQL}
        AND broker_verification_runs.source IN ('manual', 'ci')
      ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
      LIMIT 1
    ) AS internalBrokerVerificationSummary,
    (
      SELECT broker_verification_runs.detail_url
      FROM broker_verification_runs
      WHERE broker_verification_runs.deployment_record_id = deployments.id
        AND broker_verification_runs.scope = ${DEPLOYMENT_SUPPORTED_PATH_SQL}
        AND broker_verification_runs.source IN ('manual', 'ci')
      ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
      LIMIT 1
    ) AS internalBrokerVerificationDetailUrl,
    (
      SELECT broker_verification_runs.checked_at
      FROM broker_verification_runs
      WHERE broker_verification_runs.deployment_record_id = deployments.id
        AND broker_verification_runs.scope = ${DEPLOYMENT_SUPPORTED_PATH_SQL}
        AND broker_verification_runs.source IN ('manual', 'ci')
      ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
      LIMIT 1
    ) AS internalBrokerVerificationCheckedAt,
    (
      SELECT broker_verification_runs.scope
      FROM broker_verification_runs
      WHERE broker_verification_runs.scope = ${DEPLOYMENT_SUPPORTED_PATH_SQL}
        AND broker_verification_runs.source = '1edtech'
      ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
      LIMIT 1
    ) AS officialBrokerVerificationScope,
    (
      SELECT broker_verification_runs.status
      FROM broker_verification_runs
      WHERE broker_verification_runs.scope = ${DEPLOYMENT_SUPPORTED_PATH_SQL}
        AND broker_verification_runs.source = '1edtech'
      ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
      LIMIT 1
    ) AS officialBrokerVerificationStatus,
    (
      SELECT broker_verification_runs.certification_state
      FROM broker_verification_runs
      WHERE broker_verification_runs.scope = ${DEPLOYMENT_SUPPORTED_PATH_SQL}
        AND broker_verification_runs.source = '1edtech'
      ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
      LIMIT 1
    ) AS officialBrokerVerificationCertificationState,
    (
      SELECT broker_verification_runs.detail_url
      FROM broker_verification_runs
      WHERE broker_verification_runs.scope = ${DEPLOYMENT_SUPPORTED_PATH_SQL}
        AND broker_verification_runs.source = '1edtech'
      ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
      LIMIT 1
    ) AS officialBrokerVerificationDetailUrl,
    (
      SELECT broker_verification_runs.checked_at
      FROM broker_verification_runs
      WHERE broker_verification_runs.scope = ${DEPLOYMENT_SUPPORTED_PATH_SQL}
        AND broker_verification_runs.source = '1edtech'
      ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
      LIMIT 1
    ) AS officialBrokerVerificationCheckedAt,
    deployments.canvas_environment AS bindingCanvasEnvironment,
    deployments.issuer AS bindingIssuer,
    deployments.client_id AS bindingClientId,
    deployments.deployment_id AS bindingDeploymentId,
    deployments.authorization_endpoint AS bindingAuthorizationEndpoint,
    deployments.access_token_url AS bindingAccessTokenUrl,
    deployments.jwks_url AS bindingJwksUrl,
    deployments.updated_at AS updatedAt,
    (
      SELECT audit_events.occurred_at
      FROM audit_events
      WHERE audit_events.deployment_record_id = deployments.id
        AND audit_events.event_type LIKE 'launch.%'
      ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
      LIMIT 1
    ) AS lastLaunchAt,
    (
      SELECT CASE
        WHEN audit_events.event_type = 'launch.rejected'
          OR audit_events.status = 'failed'
          THEN 'failed'
        ELSE 'succeeded'
      END
      FROM audit_events
      WHERE audit_events.deployment_record_id = deployments.id
        AND audit_events.event_type LIKE 'launch.%'
      ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
      LIMIT 1
    ) AS lastLaunchStatus,
    (
      SELECT audit_events.occurred_at
      FROM audit_events
      WHERE audit_events.deployment_record_id = deployments.id
        AND audit_events.event_type = 'deployment.nrps_verified'
      ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
      LIMIT 1
    ) AS lastNrpsReadAt,
    (
      SELECT CASE
        WHEN audit_events.status = 'failed' THEN 'failed'
        WHEN audit_events.status = 'succeeded' THEN 'succeeded'
        ELSE 'pending'
      END
      FROM audit_events
      WHERE audit_events.deployment_record_id = deployments.id
        AND audit_events.event_type = 'deployment.nrps_verified'
      ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
      LIMIT 1
    ) AS lastNrpsReadStatus,
    (
      SELECT grade_publications.updated_at
      FROM attempts
      INNER JOIN grade_publications
        ON grade_publications.attempt_id = attempts.attempt_id
      WHERE attempts.deployment_record_id = deployments.id
      ORDER BY grade_publications.updated_at DESC, grade_publications.id DESC
      LIMIT 1
    ) AS lastGradePublishAt,
    (
      SELECT grade_publications.status
      FROM attempts
      INNER JOIN grade_publications
        ON grade_publications.attempt_id = attempts.attempt_id
      WHERE attempts.deployment_record_id = deployments.id
      ORDER BY grade_publications.updated_at DESC, grade_publications.id DESC
      LIMIT 1
    ) AS lastGradePublishStatus,
    (
      SELECT COUNT(*)
      FROM audit_events
      WHERE audit_events.deployment_record_id = deployments.id
        AND audit_events.event_type = 'launch.accepted'
    ) AS totalLaunches,
    (
      SELECT COUNT(*)
      FROM attempts
      WHERE attempts.deployment_record_id = deployments.id
    ) AS attemptsStarted,
    (
      SELECT COUNT(*)
      FROM attempts
      WHERE attempts.deployment_record_id = deployments.id
        AND attempts.completion_state = 'completed'
    ) AS attemptsCompleted,
    (
      SELECT COUNT(*)
      FROM attempts
      INNER JOIN grade_publications
        ON grade_publications.attempt_id = attempts.attempt_id
      WHERE attempts.deployment_record_id = deployments.id
        AND grade_publications.status = 'published'
    ) AS gradePublishesSucceeded,
    (
      SELECT COUNT(*)
      FROM attempts
      INNER JOIN grade_publications
        ON grade_publications.attempt_id = attempts.attempt_id
      WHERE attempts.deployment_record_id = deployments.id
        AND grade_publications.status = 'failed'
    ) AS gradePublishesFailed,
    (
      SELECT COUNT(DISTINCT attempts.user_id)
      FROM attempts
      WHERE attempts.deployment_record_id = deployments.id
    ) AS recentActiveUsers,
    COALESCE(
      (
        SELECT MAX(audit_events.occurred_at)
        FROM audit_events
        WHERE audit_events.deployment_record_id = deployments.id
          AND audit_events.event_type = 'launch.accepted'
      ),
      (
        SELECT audit_events.occurred_at
        FROM audit_events
        WHERE audit_events.deployment_record_id = deployments.id
          AND audit_events.event_type LIKE 'launch.%'
        ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
        LIMIT 1
      )
    ) AS usageLastLaunchAt,
    CURRENT_TIMESTAMP AS measuredAt
  FROM deployments
  LEFT JOIN package_versions AS enabled_package
    ON enabled_package.id = deployments.enabled_package_version_id
  WHERE deployments.lms_type <> 'preview'
`;

const D1_ACTIVITY_SELECT = `
  SELECT
    event_type AS eventType,
    status,
    summary,
    attempt_id AS attemptId,
    detail,
    occurred_at AS occurredAt
  FROM audit_events
`;

const D1_LATEST_LAUNCH_QUERY = `
  ${D1_ACTIVITY_SELECT}
  WHERE deployment_record_id = ?
    AND event_type LIKE 'launch.%'
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1
`;

const D1_LATEST_RUNTIME_SESSION_QUERY = `
  ${D1_ACTIVITY_SELECT}
  WHERE deployment_record_id = ?
    AND event_type = 'runtime.session.started'
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1
`;

const D1_LATEST_RUNTIME_OUTCOME_QUERY = `
  ${D1_ACTIVITY_SELECT}
  WHERE deployment_record_id = ?
    AND event_type LIKE 'runtime.%'
    AND event_type NOT IN ('runtime.session.started', 'runtime.capability.allowed')
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1
`;

const D1_LATEST_COMPATIBILITY_PATH_QUERY = `
  ${D1_ACTIVITY_SELECT}
  WHERE deployment_record_id = ?
    AND event_type = 'interop.path_used'
    AND COALESCE(json_extract(detail, '$.scope'), '') IN (
      'login',
      'launch',
      'deep_linking',
      'service'
    )
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1
`;

const D1_LATEST_NRPS_QUERY = `
  ${D1_ACTIVITY_SELECT}
  WHERE deployment_record_id = ?
    AND event_type = 'deployment.nrps_verified'
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1
`;

const D1_LATEST_AGS_SMOKE_QUERY = `
  ${D1_ACTIVITY_SELECT}
  WHERE deployment_record_id = ?
    AND event_type = 'deployment.ags_smoke_verified'
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1
`;

async function getInventoryRow(db: D1Database, deploymentRecordId: number) {
  const row = await queryD1First<D1InventoryQueryRow>(
    db,
    `
      ${D1_INVENTORY_QUERY}
        AND deployments.id = ?
      ORDER BY deployments.updated_at DESC, deployments.id DESC
    `,
    [deploymentRecordId],
  );

  return row === null ? null : mapInventoryRow(mapD1InventoryRow(row));
}

async function getActivitySnapshot(
  db: D1Database,
  sql: string,
  deploymentRecordId: number,
): Promise<DeploymentActivitySnapshot | null> {
  const row = await queryD1First<D1ActivitySnapshotRow>(db, sql, [deploymentRecordId]);

  return row === null ? null : mapActivitySnapshotRow(mapD1ActivitySnapshotRow(row));
}

async function getRuntimeEvidenceSnapshot(
  db: D1Database,
  sql: string,
  deploymentRecordId: number,
): Promise<ControlPlaneRuntimeEvidenceSnapshot | null> {
  const row = await queryD1First<D1ActivitySnapshotRow>(db, sql, [deploymentRecordId]);

  return row === null ? null : mapRuntimeEvidenceSnapshotRow(mapD1ActivitySnapshotRow(row));
}

async function listRecentAcceptedLaunches(db: D1Database, deploymentRecordId: number) {
  const rows = await queryD1Objects<D1RecentLaunchRow>(
    db,
    `
      SELECT
        audit_events.summary,
        audit_events.actor_id AS actorId,
        COALESCE(
          attempts.user_id,
          NULLIF(json_extract(audit_events.detail, '$.userId'), ''),
          audit_events.actor_id
        ) AS userId,
        COALESCE(
          attempts.user_display_name,
          NULLIF(json_extract(audit_events.detail, '$.userDisplayName'), '')
        ) AS userDisplayName,
        COALESCE(
          attempts.user_email,
          NULLIF(json_extract(audit_events.detail, '$.userEmail'), '')
        ) AS userEmail,
        COALESCE(
          attempts.user_login,
          NULLIF(json_extract(audit_events.detail, '$.userLogin'), '')
        ) AS userLogin,
        audit_events.attempt_id AS attemptId,
        audit_events.detail,
        audit_events.occurred_at AS occurredAt
      FROM audit_events
      LEFT JOIN attempts
        ON attempts.attempt_id = audit_events.attempt_id
      WHERE audit_events.deployment_record_id = ?
        AND audit_events.event_type = 'launch.accepted'
      ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
      LIMIT 10
    `,
    [deploymentRecordId],
  );

  return mapRecentLaunchRows(rows.map(mapD1RecentLaunchRow));
}

async function getLatestGradePublication(
  db: D1Database,
  deploymentRecordId: number,
): Promise<DeploymentGradePublicationSnapshot | null> {
  const row = await queryD1First<D1GradePublicationSnapshotRow>(
    db,
    `
      SELECT
        grade_publications.attempt_id AS attemptId,
        grade_publications.status,
        grade_publications.line_item_url AS lineItemUrl,
        grade_publications.platform_user_id AS platformUserId,
        grade_publications.score_given AS scoreGiven,
        grade_publications.score_maximum AS scoreMaximum,
        grade_publications.activity_progress AS activityProgress,
        grade_publications.grading_progress AS gradingProgress,
        grade_publications.published_at AS publishedAt,
        grade_publications.updated_at AS updatedAt,
        grade_publications.error_code AS errorCode,
        grade_publications.error_detail AS errorDetail
      FROM attempts
      INNER JOIN grade_publications
        ON grade_publications.attempt_id = attempts.attempt_id
      WHERE attempts.deployment_record_id = ?
      ORDER BY grade_publications.updated_at DESC, grade_publications.id DESC
      LIMIT 1
    `,
    [deploymentRecordId],
  );

  return row === null ? null : mapGradePublicationSnapshotRow(mapD1GradePublicationRow(row));
}

async function listDiagnostics(
  db: D1Database,
  deploymentRecordId: number,
  retryableAttemptId: string | null,
): Promise<ControlPlaneDiagnosticItem[]> {
  const rows = await queryD1Objects<D1DiagnosticRow>(
    db,
    `
      SELECT
        id,
        event_type AS eventType,
        actor_type AS actorType,
        status,
        deployment_record_id AS deploymentRecordId,
        attempt_id AS attemptId,
        summary,
        detail,
        occurred_at AS occurredAt
      FROM audit_events
      WHERE deployment_record_id = ?
        AND status = 'failed'
        AND (
          event_type LIKE 'launch.%'
          OR event_type = 'deep_linking.request.rejected'
          OR event_type = 'deployment.nrps_verified'
          OR event_type LIKE 'grade_publish.%'
          OR event_type LIKE 'broker_verification.%'
          OR event_type LIKE 'runtime.%'
          OR event_type LIKE 'reviewer.%'
        )
      ORDER BY occurred_at DESC, id DESC
    `,
    [deploymentRecordId],
  );

  return mapDiagnosticRows(rows.map(mapD1DiagnosticRow), retryableAttemptId);
}

async function getLatestBrokerVerificationStatusForD1(db: D1Database) {
  const internalRow = await queryD1First<D1InternalBrokerVerificationRow>(
    db,
    `
      SELECT
        scope,
        source,
        status,
        summary,
        detail_url AS detailUrl,
        checked_at AS checkedAt
      FROM broker_verification_runs
      WHERE deployment_record_id IS NOT NULL
        AND source IN ('manual', 'ci')
      ORDER BY checked_at DESC, id DESC
      LIMIT 1
    `,
  );

  if (internalRow !== null) {
    const internal = mapD1InternalBrokerVerificationRow(internalRow);
    const officialRow = await queryD1First<D1OfficialBrokerVerificationRow>(
      db,
      `
        SELECT
          scope,
          status,
          certification_state AS certificationState,
          detail_url AS detailUrl,
          checked_at AS checkedAt
        FROM broker_verification_runs
        WHERE scope = ?
          AND source = '1edtech'
        ORDER BY checked_at DESC, id DESC
        LIMIT 1
      `,
      [internal.scope],
    );

    return mapBrokerVerificationStatusRows(
      internal,
      officialRow === null ? null : mapD1OfficialBrokerVerificationRow(officialRow),
    );
  }

  const officialRow = await queryD1First<D1OfficialBrokerVerificationRow>(
    db,
    `
      SELECT
        scope,
        status,
        certification_state AS certificationState,
        detail_url AS detailUrl,
        checked_at AS checkedAt
      FROM broker_verification_runs
      WHERE source = '1edtech'
      ORDER BY checked_at DESC, id DESC
      LIMIT 1
    `,
  );

  return mapBrokerVerificationStatusRows(
    null,
    officialRow === null ? null : mapD1OfficialBrokerVerificationRow(officialRow),
  );
}

async function recordBrokerVerificationRunForD1(
  db: D1Database,
  input: RecordBrokerVerificationRunInput,
): Promise<void> {
  assertBrokerVerificationRunInput(input);
  await runD1(
    db,
    `
      INSERT INTO broker_verification_runs (
        deployment_record_id,
        scope,
        workflow_key,
        source,
        status,
        summary,
        detail_url,
        certification_state,
        checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.deploymentRecordId,
      input.scope,
      input.workflowKey,
      input.source,
      input.status,
      input.summary,
      input.detailUrl,
      input.certificationState,
      input.checkedAt,
    ],
  );
}

async function getRetryableGradePublicationLookupForD1(
  db: D1Database,
  attemptId: string,
): Promise<RetryableGradePublicationLookup | null> {
  const row = await queryD1First<D1RetryLookupRow>(
    db,
    `
      SELECT
        attempts.attempt_id AS attemptId,
        attempts.deployment_record_id AS deploymentRecordId,
        attempts.deployment_slug AS deploymentSlug,
        grade_publications.status AS publicationStatus,
        grade_publications.line_item_url AS lineItemUrl,
        grade_publications.platform_user_id AS platformUserId,
        grade_publications.score_given AS scoreGiven,
        grade_publications.score_maximum AS scoreMaximum,
        grade_publications.activity_progress AS activityProgress,
        grade_publications.grading_progress AS gradingProgress,
        grade_publications.published_at AS publishedAt,
        grade_publications.updated_at AS updatedAt,
        grade_publications.error_code AS errorCode,
        grade_publications.error_detail AS errorDetail,
        deployments.canvas_environment AS bindingCanvasEnvironment,
        deployments.issuer AS bindingIssuer,
        deployments.client_id AS bindingClientId,
        deployments.deployment_id AS bindingDeploymentId,
        runtime_sessions.session_id AS sessionId,
        runtime_sessions.attempt_id AS runtimeAttemptId,
        runtime_sessions.deployment_record_id AS runtimeDeploymentRecordId,
        runtime_sessions.deployment_slug AS runtimeDeploymentSlug,
        runtime_sessions.app_id AS runtimeAppId,
        runtime_sessions.package_version_id AS runtimePackageVersionId,
        runtime_sessions.package_version AS runtimePackageVersion,
        runtime_sessions.ags_scope AS runtimeAgsScope,
        runtime_sessions.ags_lineitems_url AS runtimeAgsLineitemsUrl,
        runtime_sessions.ags_lineitem_url AS runtimeAgsLineitemUrl,
        runtime_sessions.nrps_context_memberships_url AS runtimeNrpsContextMembershipsUrl,
        runtime_sessions.nrps_service_versions AS runtimeNrpsServiceVersions,
        runtime_sessions.created_at AS runtimeCreatedAt,
        runtime_sessions.expires_at AS runtimeExpiresAt
      FROM attempts
      INNER JOIN grade_publications
        ON grade_publications.attempt_id = attempts.attempt_id
      INNER JOIN deployments
        ON deployments.id = attempts.deployment_record_id
      LEFT JOIN runtime_sessions
        ON runtime_sessions.session_id = (
          SELECT session_id
          FROM runtime_sessions AS candidate_sessions
          WHERE candidate_sessions.attempt_id = attempts.attempt_id
          ORDER BY candidate_sessions.created_at DESC, candidate_sessions.session_id DESC
          LIMIT 1
        )
      WHERE attempts.attempt_id = ?
        AND grade_publications.status = 'failed'
      LIMIT 1
    `,
    [attemptId],
  );

  return row === null ? null : mapRetryLookupRow(mapD1RetryLookupRow(row));
}

async function listAttemptEvidenceArtifacts(
  db: D1Database,
  attemptId: string,
): Promise<AttemptEvidenceArtifactRecord[]> {
  const rows = await queryD1Objects<D1AttemptEvidenceArtifactRow>(
    db,
    `
      SELECT
        artifact_id AS artifactId,
        attempt_id AS attemptId,
        sequence,
        kind,
        content_type AS contentType,
        file_name AS fileName,
        storage_key AS storageKey,
        byte_size AS byteSize,
        sha256,
        created_at AS createdAt
      FROM attempt_evidence_artifacts
      WHERE attempt_id = ?
      ORDER BY sequence ASC
    `,
    [attemptId],
  );

  return rows.map((row) => mapAttemptEvidenceArtifactRow(mapD1AttemptEvidenceArtifactRow(row)));
}

function deriveLatestAnonymousEvidence(
  appId: string,
  evidenceArtifacts: AttemptEvidenceArtifactRecord[],
): ControlPlaneAnonymousEvidenceArtifact[] {
  return evidenceArtifacts.map((artifact) => ({
    artifactId: artifact.artifactId,
    kind: artifact.kind,
    fileName: artifact.fileName,
    contentType: artifact.contentType,
    byteSize: artifact.byteSize,
    sha256: artifact.sha256,
    createdAt: artifact.createdAt,
    artifactUrl: `/admin/packages/${appId}/deployment/evidence/${artifact.artifactId}`,
  }));
}

type Nullable<T> = T | null;

interface D1InventoryQueryRow extends Record<string, unknown> {
  deploymentId: unknown;
  deploymentSlug: unknown;
  deploymentLabel: unknown;
  appId: unknown;
  appTitle: unknown;
  ownerId: unknown;
  enabledPackageVersionId: unknown;
  enabledPackageVersion: unknown;
  approvalStatus: unknown;
  reviewedAt: unknown;
  bindingLmsType: unknown;
  installEvidenceStatus: unknown;
  installEvidenceSummary: unknown;
  installEvidenceDetail: unknown;
  installEvidenceOccurredAt: unknown;
  internalBrokerVerificationScope: unknown;
  internalBrokerVerificationSource: unknown;
  internalBrokerVerificationStatus: unknown;
  internalBrokerVerificationSummary: unknown;
  internalBrokerVerificationDetailUrl: unknown;
  internalBrokerVerificationCheckedAt: unknown;
  officialBrokerVerificationScope: unknown;
  officialBrokerVerificationStatus: unknown;
  officialBrokerVerificationCertificationState: unknown;
  officialBrokerVerificationDetailUrl: unknown;
  officialBrokerVerificationCheckedAt: unknown;
  bindingCanvasEnvironment: unknown;
  bindingIssuer: unknown;
  bindingClientId: unknown;
  bindingDeploymentId: unknown;
  bindingAuthorizationEndpoint: unknown;
  bindingAccessTokenUrl: unknown;
  bindingJwksUrl: unknown;
  updatedAt: unknown;
  lastLaunchAt: unknown;
  lastLaunchStatus: unknown;
  lastNrpsReadAt: unknown;
  lastNrpsReadStatus: unknown;
  lastGradePublishAt: unknown;
  lastGradePublishStatus: unknown;
  totalLaunches: unknown;
  attemptsStarted: unknown;
  attemptsCompleted: unknown;
  gradePublishesSucceeded: unknown;
  gradePublishesFailed: unknown;
  recentActiveUsers: unknown;
  usageLastLaunchAt: unknown;
  measuredAt: unknown;
}

type D1ActivitySnapshotRow = Record<string, unknown>;
type D1RecentLaunchRow = Record<string, unknown>;
type D1GradePublicationSnapshotRow = Record<string, unknown>;
type D1DiagnosticRow = Record<string, unknown>;
type D1InternalBrokerVerificationRow = Record<string, unknown>;
type D1OfficialBrokerVerificationRow = Record<string, unknown>;
type D1CertificationWorkflowStatusRow = Record<string, unknown>;
type D1LatestOfficialCertificationEvidenceRow = Record<string, unknown>;
type D1RetryLookupRow = Record<string, unknown>;
type D1AttemptEvidenceArtifactRow = Record<string, unknown>;

function mapD1InventoryRow(row: D1InventoryQueryRow): InventoryQueryRow {
  return {
    deploymentId: expectNumber(row.deploymentId, 'deploymentId'),
    deploymentSlug: expectString(row.deploymentSlug, 'deploymentSlug'),
    deploymentLabel: expectString(row.deploymentLabel, 'deploymentLabel'),
    appId: expectString(row.appId, 'appId'),
    appTitle: expectString(row.appTitle, 'appTitle'),
    ownerId: expectNullableString(row.ownerId, 'ownerId'),
    enabledPackageVersionId: expectNullableNumber(
      row.enabledPackageVersionId,
      'enabledPackageVersionId',
    ),
    enabledPackageVersion: expectNullableString(row.enabledPackageVersion, 'enabledPackageVersion'),
    approvalStatus: expectNullableStringLiteral(row.approvalStatus, 'approvalStatus', [
      'pending',
      'approved',
      'rejected',
    ]),
    reviewedAt: expectNullableString(row.reviewedAt, 'reviewedAt'),
    bindingLmsType: expectNullableStringLiteral(row.bindingLmsType, 'bindingLmsType', [
      'canvas',
      'moodle',
      'sakai',
    ]),
    installEvidenceStatus: expectNullableStringLiteral(
      row.installEvidenceStatus,
      'installEvidenceStatus',
      ['accepted', 'succeeded', 'failed'],
    ),
    installEvidenceSummary: expectNullableString(
      row.installEvidenceSummary,
      'installEvidenceSummary',
    ),
    installEvidenceDetail: parseNullableJsonField(
      row.installEvidenceDetail,
      'installEvidenceDetail',
    ) as Nullable<Record<string, unknown>>,
    installEvidenceOccurredAt: expectNullableString(
      row.installEvidenceOccurredAt,
      'installEvidenceOccurredAt',
    ),
    internalBrokerVerificationScope: expectNullableSupportedPath(
      row.internalBrokerVerificationScope,
      'internalBrokerVerificationScope',
    ),
    internalBrokerVerificationSource: expectNullableStringLiteral(
      row.internalBrokerVerificationSource,
      'internalBrokerVerificationSource',
      ['manual', 'ci', '1edtech'],
    ),
    internalBrokerVerificationStatus: expectNullableStringLiteral(
      row.internalBrokerVerificationStatus,
      'internalBrokerVerificationStatus',
      ['passed', 'failed', 'notRun'],
    ),
    internalBrokerVerificationSummary: expectNullableString(
      row.internalBrokerVerificationSummary,
      'internalBrokerVerificationSummary',
    ),
    internalBrokerVerificationDetailUrl: expectNullableString(
      row.internalBrokerVerificationDetailUrl,
      'internalBrokerVerificationDetailUrl',
    ),
    internalBrokerVerificationCheckedAt: expectNullableString(
      row.internalBrokerVerificationCheckedAt,
      'internalBrokerVerificationCheckedAt',
    ),
    officialBrokerVerificationScope: expectNullableSupportedPath(
      row.officialBrokerVerificationScope,
      'officialBrokerVerificationScope',
    ),
    officialBrokerVerificationStatus: expectNullableStringLiteral(
      row.officialBrokerVerificationStatus,
      'officialBrokerVerificationStatus',
      ['passed', 'failed', 'notRun', 'notCertified'],
    ),
    officialBrokerVerificationCertificationState: expectNullableStringLiteral(
      row.officialBrokerVerificationCertificationState,
      'officialBrokerVerificationCertificationState',
      ['ltiAdvantageCertified', 'ltiAdvantageComplete'],
    ),
    officialBrokerVerificationDetailUrl: expectNullableString(
      row.officialBrokerVerificationDetailUrl,
      'officialBrokerVerificationDetailUrl',
    ),
    officialBrokerVerificationCheckedAt: expectNullableString(
      row.officialBrokerVerificationCheckedAt,
      'officialBrokerVerificationCheckedAt',
    ),
    bindingCanvasEnvironment: expectNullableString(
      row.bindingCanvasEnvironment,
      'bindingCanvasEnvironment',
    ),
    bindingIssuer: expectNullableString(row.bindingIssuer, 'bindingIssuer'),
    bindingClientId: expectNullableString(row.bindingClientId, 'bindingClientId'),
    bindingDeploymentId: expectNullableString(row.bindingDeploymentId, 'bindingDeploymentId'),
    bindingAuthorizationEndpoint: expectNullableString(
      row.bindingAuthorizationEndpoint,
      'bindingAuthorizationEndpoint',
    ),
    bindingAccessTokenUrl: expectNullableString(row.bindingAccessTokenUrl, 'bindingAccessTokenUrl'),
    bindingJwksUrl: expectNullableString(row.bindingJwksUrl, 'bindingJwksUrl'),
    updatedAt: expectString(row.updatedAt, 'updatedAt'),
    lastLaunchAt: expectNullableString(row.lastLaunchAt, 'lastLaunchAt'),
    lastLaunchStatus: expectNullableStringLiteral(row.lastLaunchStatus, 'lastLaunchStatus', [
      'succeeded',
      'failed',
      'pending',
    ]),
    lastNrpsReadAt: expectNullableString(row.lastNrpsReadAt, 'lastNrpsReadAt'),
    lastNrpsReadStatus: expectNullableStringLiteral(row.lastNrpsReadStatus, 'lastNrpsReadStatus', [
      'succeeded',
      'failed',
      'pending',
    ]),
    lastGradePublishAt: expectNullableString(row.lastGradePublishAt, 'lastGradePublishAt'),
    lastGradePublishStatus: expectNullableStringLiteral(
      row.lastGradePublishStatus,
      'lastGradePublishStatus',
      ['pending', 'published', 'failed'],
    ),
    totalLaunches: expectNumber(row.totalLaunches, 'totalLaunches'),
    attemptsStarted: expectNumber(row.attemptsStarted, 'attemptsStarted'),
    attemptsCompleted: expectNumber(row.attemptsCompleted, 'attemptsCompleted'),
    gradePublishesSucceeded: expectNumber(row.gradePublishesSucceeded, 'gradePublishesSucceeded'),
    gradePublishesFailed: expectNumber(row.gradePublishesFailed, 'gradePublishesFailed'),
    recentActiveUsers: expectNumber(row.recentActiveUsers, 'recentActiveUsers'),
    usageLastLaunchAt: expectNullableString(row.usageLastLaunchAt, 'usageLastLaunchAt'),
    measuredAt: expectString(row.measuredAt, 'measuredAt'),
  };
}

function mapD1ActivitySnapshotRow(row: D1ActivitySnapshotRow): ActivitySnapshotRow {
  return {
    eventType: expectString(row.eventType, 'eventType'),
    status: expectStringLiteral(row.status, 'status', ['accepted', 'succeeded', 'failed']),
    summary: expectString(row.summary, 'summary'),
    attemptId: expectNullableString(row.attemptId, 'attemptId'),
    detail: parseJsonField(row.detail, 'detail') as Record<string, unknown>,
    occurredAt: expectString(row.occurredAt, 'occurredAt'),
  };
}

function mapD1RecentLaunchRow(row: D1RecentLaunchRow): RecentLaunchRow {
  return {
    summary: expectString(row.summary, 'summary'),
    actorId: expectNullableString(row.actorId, 'actorId'),
    userId: expectNullableString(row.userId, 'userId'),
    userDisplayName: expectNullableString(row.userDisplayName, 'userDisplayName'),
    userEmail: expectNullableString(row.userEmail, 'userEmail'),
    userLogin: expectNullableString(row.userLogin, 'userLogin'),
    attemptId: expectNullableString(row.attemptId, 'attemptId'),
    detail: parseJsonField(row.detail, 'detail') as Record<string, unknown>,
    occurredAt: expectString(row.occurredAt, 'occurredAt'),
  };
}

function mapD1GradePublicationRow(row: D1GradePublicationSnapshotRow): GradePublicationSnapshotRow {
  return {
    attemptId: expectString(row.attemptId, 'attemptId'),
    status: expectStringLiteral(row.status, 'status', ['pending', 'published', 'failed']),
    lineItemUrl: expectString(row.lineItemUrl, 'lineItemUrl'),
    platformUserId: expectString(row.platformUserId, 'platformUserId'),
    scoreGiven: expectNumber(row.scoreGiven, 'scoreGiven'),
    scoreMaximum: expectNumber(row.scoreMaximum, 'scoreMaximum'),
    activityProgress: expectStringLiteral(row.activityProgress, 'activityProgress', [
      'Completed',
      'InProgress',
      'Initialized',
    ]),
    gradingProgress: expectStringLiteral(row.gradingProgress, 'gradingProgress', [
      'Pending',
      'PendingManual',
      'FullyGraded',
      'Failed',
    ]),
    publishedAt: expectNullableString(row.publishedAt, 'publishedAt'),
    updatedAt: expectString(row.updatedAt, 'updatedAt'),
    errorCode: expectNullableString(row.errorCode, 'errorCode'),
    errorDetail: parseNullableJsonField(row.errorDetail, 'errorDetail') as Nullable<
      Record<string, unknown>
    >,
  };
}

function mapD1DiagnosticRow(row: D1DiagnosticRow): DiagnosticRow {
  return {
    id: expectNumber(row.id, 'id'),
    eventType: expectString(row.eventType, 'eventType'),
    actorType: expectStringLiteral(row.actorType, 'actorType', ['user', 'system', 'platform']),
    status: expectStringLiteral(row.status, 'status', ['accepted', 'succeeded', 'failed']),
    deploymentRecordId: expectNullableNumber(row.deploymentRecordId, 'deploymentRecordId'),
    attemptId: expectNullableString(row.attemptId, 'attemptId'),
    summary: expectString(row.summary, 'summary'),
    detail: parseJsonField(row.detail, 'detail') as Record<string, unknown>,
    occurredAt: expectString(row.occurredAt, 'occurredAt'),
  };
}

function mapD1InternalBrokerVerificationRow(
  row: D1InternalBrokerVerificationRow,
): InternalBrokerVerificationRow {
  return {
    scope: expectSupportedPath(row.scope, 'scope'),
    source: expectStringLiteral(row.source, 'source', ['manual', 'ci', '1edtech']),
    status: expectStringLiteral(row.status, 'status', ['passed', 'failed', 'notRun']),
    summary: expectString(row.summary, 'summary'),
    detailUrl: expectNullableString(row.detailUrl, 'detailUrl'),
    checkedAt: expectString(row.checkedAt, 'checkedAt'),
  };
}

function mapD1OfficialBrokerVerificationRow(
  row: D1OfficialBrokerVerificationRow,
): OfficialBrokerVerificationRow {
  return {
    scope: expectSupportedPath(row.scope, 'scope'),
    status: expectStringLiteral(row.status, 'status', [
      'passed',
      'failed',
      'notRun',
      'notCertified',
    ]),
    certificationState: expectNullableStringLiteral(row.certificationState, 'certificationState', [
      'ltiAdvantageCertified',
      'ltiAdvantageComplete',
    ]),
    detailUrl: expectNullableString(row.detailUrl, 'detailUrl'),
    checkedAt: expectString(row.checkedAt, 'checkedAt'),
  };
}

function mapD1CertificationWorkflowStatusRow(
  row: D1CertificationWorkflowStatusRow,
): CertificationWorkflowStatusRow {
  return {
    workflowKey: expectStringLiteral(row.workflowKey, 'workflowKey', [
      'core',
      'deepLinking',
      'nrps',
      'ags',
    ]),
    deploymentRecordId: expectNullableNumber(row.deploymentRecordId, 'deploymentRecordId'),
    deploymentLabel: expectNullableString(row.deploymentLabel, 'deploymentLabel'),
    status: expectNullableStringLiteral(row.status, 'status', ['passed', 'failed', 'pending']),
    summary: expectNullableString(row.summary, 'summary'),
    detailUrl: expectNullableString(row.detailUrl, 'detailUrl'),
    checkedAt: expectNullableString(row.checkedAt, 'checkedAt'),
  };
}

function mapD1LatestOfficialCertificationEvidenceRow(
  row: D1LatestOfficialCertificationEvidenceRow,
): LatestOfficialCertificationEvidenceRow {
  return {
    workflowKey: expectStringLiteral(row.workflowKey, 'workflowKey', [
      'core',
      'deepLinking',
      'nrps',
      'ags',
    ]),
    status: expectStringLiteral(row.status, 'status', [
      'passed',
      'failed',
      'notRun',
      'notCertified',
    ]),
    certificationState: expectNullableStringLiteral(row.certificationState, 'certificationState', [
      'ltiAdvantageCertified',
      'ltiAdvantageComplete',
    ]),
    summary: expectString(row.summary, 'summary'),
    detailUrl: expectNullableString(row.detailUrl, 'detailUrl'),
    checkedAt: expectString(row.checkedAt, 'checkedAt'),
  };
}

function mapD1RetryLookupRow(row: D1RetryLookupRow): RetryLookupRow {
  return {
    attemptId: expectString(row.attemptId, 'attemptId'),
    deploymentRecordId: expectNumber(row.deploymentRecordId, 'deploymentRecordId'),
    deploymentSlug: expectString(row.deploymentSlug, 'deploymentSlug'),
    publicationStatus: expectStringLiteral(row.publicationStatus, 'publicationStatus', [
      'pending',
      'published',
      'failed',
    ]),
    lineItemUrl: expectString(row.lineItemUrl, 'lineItemUrl'),
    platformUserId: expectString(row.platformUserId, 'platformUserId'),
    scoreGiven: expectNumber(row.scoreGiven, 'scoreGiven'),
    scoreMaximum: expectNumber(row.scoreMaximum, 'scoreMaximum'),
    activityProgress: expectStringLiteral(row.activityProgress, 'activityProgress', [
      'Completed',
      'InProgress',
      'Initialized',
    ]),
    gradingProgress: expectStringLiteral(row.gradingProgress, 'gradingProgress', [
      'Pending',
      'PendingManual',
      'FullyGraded',
      'Failed',
    ]),
    publishedAt: expectNullableString(row.publishedAt, 'publishedAt'),
    updatedAt: expectString(row.updatedAt, 'updatedAt'),
    errorCode: expectNullableString(row.errorCode, 'errorCode'),
    errorDetail: parseNullableJsonField(row.errorDetail, 'errorDetail') as Nullable<
      Record<string, unknown>
    >,
    bindingCanvasEnvironment: expectNullableString(
      row.bindingCanvasEnvironment,
      'bindingCanvasEnvironment',
    ),
    bindingIssuer: expectNullableString(row.bindingIssuer, 'bindingIssuer'),
    bindingClientId: expectNullableString(row.bindingClientId, 'bindingClientId'),
    bindingDeploymentId: expectNullableString(row.bindingDeploymentId, 'bindingDeploymentId'),
    sessionId: expectNullableString(row.sessionId, 'sessionId'),
    runtimeAttemptId: expectNullableString(row.runtimeAttemptId, 'runtimeAttemptId'),
    runtimeDeploymentRecordId: expectNullableNumber(
      row.runtimeDeploymentRecordId,
      'runtimeDeploymentRecordId',
    ),
    runtimeDeploymentSlug: expectNullableString(row.runtimeDeploymentSlug, 'runtimeDeploymentSlug'),
    runtimeAppId: expectNullableString(row.runtimeAppId, 'runtimeAppId'),
    runtimePackageVersionId: expectNullableNumber(
      row.runtimePackageVersionId,
      'runtimePackageVersionId',
    ),
    runtimePackageVersion: expectNullableString(row.runtimePackageVersion, 'runtimePackageVersion'),
    runtimeAgsScope: parseNullableJsonField(row.runtimeAgsScope, 'runtimeAgsScope') as Nullable<
      string[]
    >,
    runtimeAgsLineitemsUrl: expectNullableString(
      row.runtimeAgsLineitemsUrl,
      'runtimeAgsLineitemsUrl',
    ),
    runtimeAgsLineitemUrl: expectNullableString(row.runtimeAgsLineitemUrl, 'runtimeAgsLineitemUrl'),
    runtimeNrpsContextMembershipsUrl: expectNullableString(
      row.runtimeNrpsContextMembershipsUrl,
      'runtimeNrpsContextMembershipsUrl',
    ),
    runtimeNrpsServiceVersions: parseNullableJsonField(
      row.runtimeNrpsServiceVersions,
      'runtimeNrpsServiceVersions',
    ) as Nullable<string[]>,
    runtimeCreatedAt: expectNullableString(row.runtimeCreatedAt, 'runtimeCreatedAt'),
    runtimeExpiresAt: expectNullableString(row.runtimeExpiresAt, 'runtimeExpiresAt'),
  };
}

function mapD1AttemptEvidenceArtifactRow(
  row: D1AttemptEvidenceArtifactRow,
): AttemptEvidenceArtifactRow {
  return {
    artifactId: expectString(row.artifactId, 'artifactId'),
    attemptId: expectString(row.attemptId, 'attemptId'),
    sequence: expectNumber(row.sequence, 'sequence'),
    kind: expectStringLiteral(row.kind, 'kind', ['screenshot_png', 'structured_json']),
    contentType: expectString(row.contentType, 'contentType'),
    fileName: expectString(row.fileName, 'fileName'),
    storageKey: expectString(row.storageKey, 'storageKey'),
    byteSize: expectNumber(row.byteSize, 'byteSize'),
    sha256: expectString(row.sha256, 'sha256'),
    createdAt: expectString(row.createdAt, 'createdAt'),
  };
}

function parseJsonField(value: unknown, fieldName: string): unknown {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected D1 ${fieldName} to be JSON text.`);
  }

  return JSON.parse(value);
}

function parseNullableJsonField(value: unknown, fieldName: string): unknown | null {
  if (value === null) {
    return null;
  }

  return parseJsonField(value, fieldName);
}

function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected D1 ${fieldName} to be text.`);
  }

  return value;
}

function expectNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  return expectString(value, fieldName);
}

function expectNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number') {
    throw new TypeError(`Expected D1 ${fieldName} to be numeric.`);
  }

  return value;
}

function expectNullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  return expectNumber(value, fieldName);
}

function expectSupportedPath(value: unknown, fieldName: string) {
  return expectStringLiteral(value, fieldName, ['lti13LaunchAgsNrps', 'lti13LaunchAgsScore']);
}

function expectNullableSupportedPath(value: unknown, fieldName: string) {
  if (value === null) {
    return null;
  }

  return expectSupportedPath(value, fieldName);
}

function expectNullableStringLiteral<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T | null {
  if (value === null) {
    return null;
  }

  return expectStringLiteral(value, fieldName, allowed);
}

function expectStringLiteral<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`Unexpected D1 ${fieldName} value.`);
  }

  return value as T;
}
