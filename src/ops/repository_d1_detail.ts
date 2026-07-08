import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects } from '../db/d1.ts';
import { mapAttemptEvidenceArtifactRow } from '../package_review/repository_mappers_attempts.ts';
import type { AttemptEvidenceArtifactRecord } from '../package_review/types.ts';
import {
  type D1ActivitySnapshotRow,
  type D1AttemptEvidenceArtifactRow,
  type D1DiagnosticRow,
  type D1GradePublicationSnapshotRow,
  type D1InventoryQueryRow,
  type D1RecentLaunchRow,
  type D1RetryLookupRow,
  mapD1ActivitySnapshotRow,
  mapD1AttemptEvidenceArtifactRow,
  mapD1DiagnosticRow,
  mapD1GradePublicationRow,
  mapD1InventoryRow,
  mapD1RecentLaunchRow,
  mapD1RetryLookupRow,
} from './repository_d1_mapping.ts';
import {
  D1_INVENTORY_QUERY,
  D1_LATEST_AGS_SMOKE_QUERY,
  D1_LATEST_COMPATIBILITY_PATH_QUERY,
  D1_LATEST_LAUNCH_QUERY,
  D1_LATEST_NRPS_QUERY,
  D1_LATEST_RUNTIME_OUTCOME_QUERY,
  D1_LATEST_RUNTIME_SESSION_QUERY,
} from './repository_d1_queries.ts';
import {
  mapActivitySnapshotRow,
  mapDiagnosticRows,
  mapGradePublicationSnapshotRow,
  mapInventoryRow,
  mapRecentLaunchRows,
  mapRuntimeEvidenceSnapshotRow,
} from './repository_mapping.ts';
import { mapRetryLookupRow } from './repository_retry_mapping.ts';
import type {
  ControlPlaneAnonymousEvidenceArtifact,
  ControlPlaneDiagnosticItem,
  ControlPlaneRuntimeEvidenceSnapshot,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
  RetryableGradePublicationLookup,
} from './types.ts';

export async function getControlPlaneDeploymentDetailForD1(
  db: D1Database,
  deploymentRecordId: number,
) {
  const inventory = await getInventoryRow(db, deploymentRecordId);

  if (inventory === null) {
    return null;
  }

  const latestLaunch = await getActivitySnapshot(db, D1_LATEST_LAUNCH_QUERY, deploymentRecordId);
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
  const retryableGradePublication = latestGradePublish?.status === 'failed'
    ? await getRetryableGradePublicationLookupForD1(db, latestGradePublish.attemptId)
    : null;
  const latestRuntimeAttemptId = latestRuntimeOutcome?.attemptId ??
    latestRuntimeSession?.attemptId ?? null;

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
}

export async function getInventoryRow(db: D1Database, deploymentRecordId: number) {
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

export async function getRetryableGradePublicationLookupForD1(
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
        runtime_sessions.lti_tool_session_id AS runtimeLtiToolSessionId,
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
