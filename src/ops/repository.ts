import type { Pool, PoolClient } from "@db/postgres";
import type { DeploymentBinding, LaunchServiceClaims } from "../lti/types.ts";
import { createPackageReviewRepository } from "../package_review/repository.ts";
import type {
  ApprovalStatus,
  AuditActorType,
  AuditEventStatus,
  GradePublicationStatus,
  PlacementAuditSnapshot,
} from "../package_review/types.ts";
import { deriveDeploymentHealth, formatDiagnosticItem } from "./service.ts";
import type {
  BrokerVerificationRunStatus,
  BrokerVerificationSource,
  BrokerVerificationStatus,
  ControlPlaneActivityStatus,
  ControlPlaneDeploymentDetailSnapshot,
  ControlPlaneDeploymentInventoryRow,
  ControlPlaneDiagnosticItem,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
  OfficialCertificationState,
  RetryableGradePublicationLookup,
  RetryRuntimeSessionLookup,
} from "./types.ts";

const SUPPORTED_BROKER_SCOPE = "canvasLti13LaunchAgsNrps";

const INVENTORY_BASE_QUERY = `
  SELECT
    deployments.id AS deployment_id,
    deployments.slug AS deployment_slug,
    deployments.label AS deployment_label,
    deployments.app_id,
    COALESCE(enabled_package.title, latest_package.title, deployments.label) AS app_title,
    COALESCE(enabled_package.owner_id, latest_package.owner_id) AS owner_id,
    deployments.enabled_package_version_id,
    enabled_package.version AS enabled_package_version,
    enabled_package.approval_status,
    enabled_package.reviewed_at,
    deployments.canvas_environment AS binding_canvas_environment,
    deployments.issuer AS binding_issuer,
    deployments.client_id AS binding_client_id,
    deployments.deployment_id AS binding_deployment_id,
    deployments.updated_at,
    latest_launch.last_launch_at,
    latest_launch.last_launch_status,
    latest_nrps.last_nrps_read_at,
    latest_nrps.last_nrps_read_status,
    latest_grade.last_grade_publish_at,
    latest_grade.last_grade_publish_status,
    COALESCE(launch_usage.total_launches, 0)::integer AS total_launches,
    COALESCE(attempt_usage.attempts_started, 0)::integer AS attempts_started,
    COALESCE(attempt_usage.attempts_completed, 0)::integer AS attempts_completed,
    COALESCE(grade_usage.grade_publishes_succeeded, 0)::integer AS grade_publishes_succeeded,
    COALESCE(grade_usage.grade_publishes_failed, 0)::integer AS grade_publishes_failed,
    COALESCE(attempt_usage.recent_active_users, 0)::integer AS recent_active_users,
    COALESCE(launch_usage.last_launch_at, latest_launch.last_launch_at) AS usage_last_launch_at,
    CURRENT_TIMESTAMP AS measured_at
  FROM deployments
  LEFT JOIN package_versions AS enabled_package
    ON enabled_package.id = deployments.enabled_package_version_id
  LEFT JOIN LATERAL (
    SELECT
      package_versions.title,
      package_versions.owner_id
    FROM package_versions
    WHERE package_versions.app_id = deployments.app_id
    ORDER BY package_versions.imported_at DESC, package_versions.id DESC
    LIMIT 1
  ) AS latest_package ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      audit_events.occurred_at AS last_launch_at,
      CASE
        WHEN audit_events.event_type = 'launch.rejected'
          OR audit_events.status = 'failed'
          THEN 'failed'
        ELSE 'succeeded'
      END AS last_launch_status
    FROM audit_events
    WHERE audit_events.deployment_record_id = deployments.id
      AND audit_events.event_type LIKE 'launch.%'
    ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
    LIMIT 1
  ) AS latest_launch ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      audit_events.occurred_at AS last_nrps_read_at,
      CASE
        WHEN audit_events.status = 'failed'
          THEN 'failed'
        WHEN audit_events.status = 'succeeded'
          THEN 'succeeded'
        ELSE 'pending'
      END AS last_nrps_read_status
    FROM audit_events
    WHERE audit_events.deployment_record_id = deployments.id
      AND audit_events.event_type = 'deployment.nrps_verified'
    ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
    LIMIT 1
  ) AS latest_nrps ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      grade_publications.updated_at AS last_grade_publish_at,
      grade_publications.status AS last_grade_publish_status
    FROM attempts
    INNER JOIN grade_publications
      ON grade_publications.attempt_id = attempts.attempt_id
    WHERE attempts.deployment_record_id = deployments.id
    ORDER BY grade_publications.updated_at DESC, grade_publications.id DESC
    LIMIT 1
  ) AS latest_grade ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::integer AS total_launches,
      MAX(audit_events.occurred_at) AS last_launch_at
    FROM audit_events
    WHERE audit_events.deployment_record_id = deployments.id
      AND audit_events.event_type = 'launch.accepted'
  ) AS launch_usage ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::integer AS attempts_started,
      COUNT(*) FILTER (WHERE attempts.completion_state = 'completed')::integer
        AS attempts_completed,
      COUNT(DISTINCT attempts.user_id)::integer AS recent_active_users
    FROM attempts
    WHERE attempts.deployment_record_id = deployments.id
  ) AS attempt_usage ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE grade_publications.status = 'published')::integer
        AS grade_publishes_succeeded,
      COUNT(*) FILTER (WHERE grade_publications.status = 'failed')::integer
        AS grade_publishes_failed
    FROM attempts
    INNER JOIN grade_publications
      ON grade_publications.attempt_id = attempts.attempt_id
    WHERE attempts.deployment_record_id = deployments.id
  ) AS grade_usage ON TRUE
`;

const INVENTORY_ORDER_BY = `
  ORDER BY deployments.updated_at DESC, deployments.id DESC
`;

const LATEST_LAUNCH_QUERY = `
  SELECT
    audit_events.event_type,
    audit_events.status,
    audit_events.summary,
    audit_events.attempt_id,
    audit_events.detail,
    audit_events.occurred_at
  FROM audit_events
  WHERE audit_events.deployment_record_id = $1
    AND audit_events.event_type LIKE 'launch.%'
  ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
  LIMIT 1
`;

const LATEST_NRPS_QUERY = `
  SELECT
    audit_events.event_type,
    audit_events.status,
    audit_events.summary,
    audit_events.attempt_id,
    audit_events.detail,
    audit_events.occurred_at
  FROM audit_events
  WHERE audit_events.deployment_record_id = $1
    AND audit_events.event_type = 'deployment.nrps_verified'
  ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
  LIMIT 1
`;

const LATEST_GRADE_PUBLICATION_QUERY = `
  SELECT
    grade_publications.attempt_id,
    grade_publications.status,
    grade_publications.line_item_url,
    grade_publications.canvas_user_id,
    grade_publications.score_given,
    grade_publications.score_maximum,
    grade_publications.activity_progress,
    grade_publications.grading_progress,
    grade_publications.published_at,
    grade_publications.updated_at,
    grade_publications.error_code,
    grade_publications.error_detail
  FROM attempts
  INNER JOIN grade_publications
    ON grade_publications.attempt_id = attempts.attempt_id
  WHERE attempts.deployment_record_id = $1
  ORDER BY grade_publications.updated_at DESC, grade_publications.id DESC
  LIMIT 1
`;

const DIAGNOSTICS_QUERY = `
  SELECT
    audit_events.id,
    audit_events.event_type,
    audit_events.actor_type,
    audit_events.status,
    audit_events.deployment_record_id,
    audit_events.attempt_id,
    audit_events.summary,
    audit_events.detail,
    audit_events.occurred_at
  FROM audit_events
  WHERE audit_events.deployment_record_id = $1
    AND (
      audit_events.event_type LIKE 'launch.%'
      OR audit_events.event_type = 'deployment.nrps_verified'
      OR audit_events.event_type LIKE 'grade_publish.%'
      OR audit_events.event_type LIKE 'broker_verification.%'
      OR audit_events.event_type LIKE 'reviewer.%'
    )
  ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
`;

const LATEST_INTERNAL_BROKER_VERIFICATION_QUERY = `
  SELECT
    broker_verification_runs.scope,
    broker_verification_runs.source,
    broker_verification_runs.status,
    broker_verification_runs.summary,
    broker_verification_runs.detail_url,
    broker_verification_runs.checked_at
  FROM broker_verification_runs
  WHERE broker_verification_runs.scope = $1
    AND broker_verification_runs.source IN ('manual', 'ci')
  ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
  LIMIT 1
`;

const LATEST_OFFICIAL_BROKER_VERIFICATION_QUERY = `
  SELECT
    broker_verification_runs.scope,
    broker_verification_runs.status,
    broker_verification_runs.certification_state,
    broker_verification_runs.summary,
    broker_verification_runs.detail_url,
    broker_verification_runs.checked_at
  FROM broker_verification_runs
  WHERE broker_verification_runs.scope = $1
    AND broker_verification_runs.source = '1edtech'
  ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
  LIMIT 1
`;

const INSERT_BROKER_VERIFICATION_RUN_QUERY = `
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
`;

const RETRYABLE_GRADE_PUBLICATION_LOOKUP_QUERY = `
  SELECT
    attempts.attempt_id,
    attempts.deployment_record_id,
    attempts.deployment_slug,
    grade_publications.status AS publication_status,
    grade_publications.line_item_url,
    grade_publications.canvas_user_id,
    grade_publications.score_given,
    grade_publications.score_maximum,
    grade_publications.activity_progress,
    grade_publications.grading_progress,
    grade_publications.published_at,
    grade_publications.updated_at,
    grade_publications.error_code,
    grade_publications.error_detail,
    deployments.canvas_environment AS binding_canvas_environment,
    deployments.issuer AS binding_issuer,
    deployments.client_id AS binding_client_id,
    deployments.deployment_id AS binding_deployment_id,
    runtime_session.session_id,
    runtime_session.attempt_id AS runtime_attempt_id,
    runtime_session.deployment_record_id AS runtime_deployment_record_id,
    runtime_session.deployment_slug AS runtime_deployment_slug,
    runtime_session.app_id AS runtime_app_id,
    runtime_session.package_version_id AS runtime_package_version_id,
    runtime_session.package_version AS runtime_package_version,
    runtime_session.ags_scope AS runtime_ags_scope,
    runtime_session.ags_lineitems_url AS runtime_ags_lineitems_url,
    runtime_session.ags_lineitem_url AS runtime_ags_lineitem_url,
    runtime_session.nrps_context_memberships_url AS runtime_nrps_context_memberships_url,
    runtime_session.nrps_service_versions AS runtime_nrps_service_versions,
    runtime_session.created_at AS runtime_created_at,
    runtime_session.expires_at AS runtime_expires_at
  FROM attempts
  INNER JOIN grade_publications
    ON grade_publications.attempt_id = attempts.attempt_id
  INNER JOIN deployments
    ON deployments.id = attempts.deployment_record_id
  LEFT JOIN LATERAL (
    SELECT
      runtime_sessions.session_id,
      runtime_sessions.attempt_id,
      runtime_sessions.deployment_record_id,
      runtime_sessions.deployment_slug,
      runtime_sessions.app_id,
      runtime_sessions.package_version_id,
      runtime_sessions.package_version,
      runtime_sessions.ags_scope,
      runtime_sessions.ags_lineitems_url,
      runtime_sessions.ags_lineitem_url,
      runtime_sessions.nrps_context_memberships_url,
      runtime_sessions.nrps_service_versions,
      runtime_sessions.created_at,
      runtime_sessions.expires_at
    FROM runtime_sessions
    WHERE runtime_sessions.attempt_id = attempts.attempt_id
    ORDER BY runtime_sessions.created_at DESC, runtime_sessions.session_id DESC
    LIMIT 1
  ) AS runtime_session ON TRUE
  WHERE attempts.attempt_id = $1
    AND grade_publications.status = 'failed'
  LIMIT 1
`;

interface InventoryQueryRow {
  deploymentId: number;
  deploymentSlug: string;
  deploymentLabel: string;
  appId: string;
  appTitle: string;
  ownerId: string | null;
  enabledPackageVersionId: number | null;
  enabledPackageVersion: string | null;
  approvalStatus: ApprovalStatus | null;
  reviewedAt: Date | string | null;
  bindingCanvasEnvironment: string | null;
  bindingIssuer: string | null;
  bindingClientId: string | null;
  bindingDeploymentId: string | null;
  updatedAt: Date | string;
  lastLaunchAt: Date | string | null;
  lastLaunchStatus: ControlPlaneActivityStatus | null;
  lastNrpsReadAt: Date | string | null;
  lastNrpsReadStatus: ControlPlaneActivityStatus | null;
  lastGradePublishAt: Date | string | null;
  lastGradePublishStatus: GradePublicationStatus | null;
  totalLaunches: number | string;
  attemptsStarted: number | string;
  attemptsCompleted: number | string;
  gradePublishesSucceeded: number | string;
  gradePublishesFailed: number | string;
  recentActiveUsers: number | string;
  usageLastLaunchAt: Date | string | null;
  measuredAt: Date | string;
}

interface ActivitySnapshotRow {
  eventType: string;
  status: AuditEventStatus;
  summary: string;
  attemptId: string | null;
  detail: Record<string, unknown>;
  occurredAt: Date | string;
}

interface GradePublicationSnapshotRow {
  attemptId: string;
  status: GradePublicationStatus;
  lineItemUrl: string;
  canvasUserId: string;
  scoreGiven: number | string;
  scoreMaximum: number | string;
  activityProgress: DeploymentGradePublicationSnapshot["activityProgress"];
  gradingProgress: DeploymentGradePublicationSnapshot["gradingProgress"];
  publishedAt: Date | string | null;
  updatedAt: Date | string;
  errorCode: string | null;
  errorDetail: Record<string, unknown> | null;
}

interface DiagnosticRow {
  id: number;
  eventType: string;
  actorType: AuditActorType;
  status: AuditEventStatus;
  deploymentRecordId: number | null;
  attemptId: string | null;
  summary: string;
  detail: Record<string, unknown>;
  occurredAt: Date | string;
}

type PersistedBrokerVerificationRunStatus =
  | BrokerVerificationRunStatus
  | "notCertified";

export interface RecordBrokerVerificationRunInput {
  source: BrokerVerificationSource;
  scope: BrokerVerificationStatus["supportedPath"];
  status: PersistedBrokerVerificationRunStatus;
  certificationState:
    | Exclude<OfficialCertificationState, "notCertified">
    | null;
  summary: string;
  detailUrl: string | null;
  checkedAt: string;
}

interface InternalBrokerVerificationRow {
  scope: BrokerVerificationStatus["supportedPath"];
  source: BrokerVerificationSource;
  status: BrokerVerificationRunStatus;
  summary: string;
  detailUrl: string | null;
  checkedAt: Date | string;
}

interface OfficialBrokerVerificationRow {
  scope: BrokerVerificationStatus["supportedPath"];
  status: PersistedBrokerVerificationRunStatus;
  certificationState:
    | Exclude<OfficialCertificationState, "notCertified">
    | null;
  summary: string;
  detailUrl: string | null;
  checkedAt: Date | string;
}

interface RetryLookupRow {
  attemptId: string;
  deploymentRecordId: number;
  deploymentSlug: string;
  publicationStatus: GradePublicationStatus;
  lineItemUrl: string;
  canvasUserId: string;
  scoreGiven: number | string;
  scoreMaximum: number | string;
  activityProgress: DeploymentGradePublicationSnapshot["activityProgress"];
  gradingProgress: DeploymentGradePublicationSnapshot["gradingProgress"];
  publishedAt: Date | string | null;
  updatedAt: Date | string;
  errorCode: string | null;
  errorDetail: Record<string, unknown> | null;
  bindingCanvasEnvironment: string | null;
  bindingIssuer: string | null;
  bindingClientId: string | null;
  bindingDeploymentId: string | null;
  sessionId: string | null;
  runtimeAttemptId: string | null;
  runtimeDeploymentRecordId: number | null;
  runtimeDeploymentSlug: string | null;
  runtimeAppId: string | null;
  runtimePackageVersionId: number | null;
  runtimePackageVersion: string | null;
  runtimeAgsScope: string[] | null;
  runtimeAgsLineitemsUrl: string | null;
  runtimeAgsLineitemUrl: string | null;
  runtimeNrpsContextMembershipsUrl: string | null;
  runtimeNrpsServiceVersions: string[] | null;
  runtimeCreatedAt: Date | string | null;
  runtimeExpiresAt: Date | string | null;
}

export interface OpsRepository {
  listControlPlaneDeployments(): Promise<ControlPlaneDeploymentInventoryRow[]>;
  getControlPlaneDeploymentDetail(
    deploymentRecordId: number,
  ): Promise<ControlPlaneDeploymentDetailSnapshot | null>;
  getLatestBrokerVerification(): Promise<BrokerVerificationStatus | null>;
  getLatestBrokerVerificationStatus(): Promise<BrokerVerificationStatus | null>;
  recordBrokerVerificationRun(
    input: RecordBrokerVerificationRunInput,
  ): Promise<void>;
  getRetryableGradePublicationLookup(
    attemptId: string,
  ): Promise<RetryableGradePublicationLookup | null>;
  getPlacementAuditSnapshot(
    placementId: string,
  ): Promise<PlacementAuditSnapshot>;
}

export function createOpsRepository(pool: Pool): OpsRepository {
  const packageReviewRepository = createPackageReviewRepository(pool);

  return {
    async listControlPlaneDeployments() {
      return await withClient(pool, async (client) => {
        const [result, brokerVerification] = await Promise.all([
          client.queryObject<InventoryQueryRow>({
            text: `${INVENTORY_BASE_QUERY}\n${INVENTORY_ORDER_BY}`,
            camelCase: true,
          }),
          getLatestBrokerVerificationStatusForClient(client),
        ]);

        return result.rows.map((row) =>
          mapInventoryRow(row, brokerVerification)
        );
      });
    },

    async getControlPlaneDeploymentDetail(deploymentRecordId) {
      return await withClient(pool, async (client) => {
        const brokerVerification =
          await getLatestBrokerVerificationStatusForClient(
            client,
          );
        const inventory = await getInventoryRow(
          client,
          deploymentRecordId,
          brokerVerification,
        );

        if (inventory === null) {
          return null;
        }

        const [latestLaunch, latestNrpsRead, latestGradePublish] = await Promise
          .all([
            getActivitySnapshot(
              client,
              LATEST_LAUNCH_QUERY,
              deploymentRecordId,
            ),
            getActivitySnapshot(client, LATEST_NRPS_QUERY, deploymentRecordId),
            getLatestGradePublication(client, deploymentRecordId),
          ]);
        const retryableGradePublication =
          latestGradePublish?.status === "failed"
            ? await getRetryableGradePublicationLookupForClient(
              client,
              latestGradePublish.attemptId,
            )
            : null;
        const diagnostics = await listDiagnostics(
          client,
          deploymentRecordId,
          retryableGradePublication?.attemptId ?? null,
        );

        return {
          inventory,
          latestLaunch,
          latestNrpsRead,
          latestGradePublish,
          pilotUsage: inventory.pilotUsage,
          diagnostics,
          retryableGradePublication,
          brokerVerification: inventory.brokerVerification,
        };
      });
    },

    async getLatestBrokerVerification() {
      return await this.getLatestBrokerVerificationStatus();
    },

    async getLatestBrokerVerificationStatus() {
      return await withClient(
        pool,
        async (client) =>
          await getLatestBrokerVerificationStatusForClient(client),
      );
    },

    async recordBrokerVerificationRun(input) {
      return await withClient(
        pool,
        async (client) =>
          await recordBrokerVerificationRunForClient(client, input),
      );
    },

    async getRetryableGradePublicationLookup(attemptId) {
      return await withClient(
        pool,
        async (client) =>
          await getRetryableGradePublicationLookupForClient(client, attemptId),
      );
    },

    async getPlacementAuditSnapshot(placementId) {
      return await packageReviewRepository.requirePlacementAuditSnapshotById(
        placementId,
      );
    },
  };
}

async function getInventoryRow(
  client: PoolClient,
  deploymentRecordId: number,
  brokerVerification: BrokerVerificationStatus | null,
): Promise<ControlPlaneDeploymentInventoryRow | null> {
  const result = await client.queryObject<InventoryQueryRow>({
    text: `${INVENTORY_BASE_QUERY}
      WHERE deployments.id = $1
      ${INVENTORY_ORDER_BY}`,
    args: [deploymentRecordId],
    camelCase: true,
  });

  return result.rows[0]
    ? mapInventoryRow(result.rows[0], brokerVerification)
    : null;
}

async function getActivitySnapshot(
  client: PoolClient,
  text: string,
  deploymentRecordId: number,
): Promise<DeploymentActivitySnapshot | null> {
  const result = await client.queryObject<ActivitySnapshotRow>({
    text,
    args: [deploymentRecordId],
    camelCase: true,
  });
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    status: mapAuditActivityStatus(row.eventType, row.status),
    occurredAt: normalizeTimestamp(row.occurredAt),
    summary: row.summary,
    attemptId: row.attemptId,
    contextId: readStringDetail(row.detail, "contextId"),
    detail: row.detail,
  };
}

async function getLatestGradePublication(
  client: PoolClient,
  deploymentRecordId: number,
): Promise<DeploymentGradePublicationSnapshot | null> {
  const result = await client.queryObject<GradePublicationSnapshotRow>({
    text: LATEST_GRADE_PUBLICATION_QUERY,
    args: [deploymentRecordId],
    camelCase: true,
  });
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    attemptId: row.attemptId,
    status: row.status,
    lineItemUrl: row.lineItemUrl,
    canvasUserId: row.canvasUserId,
    scoreGiven: normalizeNumeric(row.scoreGiven),
    scoreMaximum: normalizeNumeric(row.scoreMaximum),
    activityProgress: row.activityProgress,
    gradingProgress: row.gradingProgress,
    publishedAt: normalizeOptionalTimestamp(row.publishedAt),
    updatedAt: normalizeTimestamp(row.updatedAt),
    errorCode: row.errorCode,
    errorDetail: row.errorDetail,
  };
}

async function listDiagnostics(
  client: PoolClient,
  deploymentRecordId: number,
  retryableAttemptId: string | null,
): Promise<ControlPlaneDiagnosticItem[]> {
  const result = await client.queryObject<DiagnosticRow>({
    text: DIAGNOSTICS_QUERY,
    args: [deploymentRecordId],
    camelCase: true,
  });

  return result.rows.map((row) =>
    formatDiagnosticItem({
      id: row.id,
      kind: mapDiagnosticKind(row.eventType),
      eventType: row.eventType,
      actorType: row.actorType,
      status: row.status,
      deploymentRecordId: row.deploymentRecordId,
      attemptId: row.attemptId,
      code: readStringDetail(row.detail, "code"),
      summary: row.summary,
      operatorSummary: row.summary,
      retryable: false,
      detail: row.detail,
      occurredAt: normalizeTimestamp(row.occurredAt),
    }, {
      retryableAttemptId,
    })
  );
}

async function getLatestBrokerVerificationStatusForClient(
  client: PoolClient,
): Promise<BrokerVerificationStatus | null> {
  const [internalResult, officialResult] = await Promise.all([
    client.queryObject<InternalBrokerVerificationRow>({
      text: LATEST_INTERNAL_BROKER_VERIFICATION_QUERY,
      args: [SUPPORTED_BROKER_SCOPE],
      camelCase: true,
    }),
    client.queryObject<OfficialBrokerVerificationRow>({
      text: LATEST_OFFICIAL_BROKER_VERIFICATION_QUERY,
      args: [SUPPORTED_BROKER_SCOPE],
      camelCase: true,
    }),
  ]);

  return mapBrokerVerificationStatusRows(
    internalResult.rows[0] ?? null,
    officialResult.rows[0] ?? null,
  );
}

async function recordBrokerVerificationRunForClient(
  client: PoolClient,
  input: RecordBrokerVerificationRunInput,
): Promise<void> {
  assertBrokerVerificationRunInput(input);
  await client.queryArray({
    text: INSERT_BROKER_VERIFICATION_RUN_QUERY,
    args: [
      null,
      input.scope,
      input.source,
      input.status,
      input.summary,
      input.detailUrl,
      input.certificationState,
      input.checkedAt,
    ],
  });
}

async function getRetryableGradePublicationLookupForClient(
  client: PoolClient,
  attemptId: string,
): Promise<RetryableGradePublicationLookup | null> {
  const result = await client.queryObject<RetryLookupRow>({
    text: RETRYABLE_GRADE_PUBLICATION_LOOKUP_QUERY,
    args: [attemptId],
    camelCase: true,
  });
  const row = result.rows[0];

  return row ? mapRetryLookupRow(row) : null;
}

function mapInventoryRow(
  row: InventoryQueryRow,
  brokerVerification: BrokerVerificationStatus | null,
): ControlPlaneDeploymentInventoryRow {
  const binding = mapDeploymentBinding({
    canvasEnvironment: row.bindingCanvasEnvironment,
    issuer: row.bindingIssuer,
    clientId: row.bindingClientId,
    deploymentId: row.bindingDeploymentId,
  });

  return {
    deploymentId: row.deploymentId,
    deploymentSlug: row.deploymentSlug,
    deploymentLabel: row.deploymentLabel,
    appId: row.appId,
    appTitle: row.appTitle,
    ownerId: row.ownerId,
    enabledPackageVersionId: row.enabledPackageVersionId,
    enabledPackageVersion: row.enabledPackageVersion,
    approvalStatus: row.approvalStatus,
    binding,
    updatedAt: normalizeTimestamp(row.updatedAt),
    lastLaunchAt: normalizeOptionalTimestamp(row.lastLaunchAt),
    lastLaunchStatus: row.lastLaunchStatus,
    lastGradePublishAt: normalizeOptionalTimestamp(row.lastGradePublishAt),
    lastGradePublishStatus: row.lastGradePublishStatus,
    lastNrpsReadAt: normalizeOptionalTimestamp(row.lastNrpsReadAt),
    lastNrpsReadStatus: row.lastNrpsReadStatus,
    pilotUsage: {
      deploymentRecordId: row.deploymentId,
      totalLaunches: normalizeNumeric(row.totalLaunches),
      attemptsStarted: normalizeNumeric(row.attemptsStarted),
      attemptsCompleted: normalizeNumeric(row.attemptsCompleted),
      gradePublishesSucceeded: normalizeNumeric(row.gradePublishesSucceeded),
      gradePublishesFailed: normalizeNumeric(row.gradePublishesFailed),
      recentActiveUsers: normalizeNumeric(row.recentActiveUsers),
      lastLaunchAt: normalizeOptionalTimestamp(row.usageLastLaunchAt),
      measuredAt: normalizeTimestamp(row.measuredAt),
    },
    health: deriveDeploymentHealth({
      approvalStatus: row.approvalStatus,
      reviewedAt: normalizeOptionalTimestamp(row.reviewedAt),
      enabledPackageVersionId: row.enabledPackageVersionId,
      binding,
      lastLaunchStatus: row.lastLaunchStatus,
      lastLaunchAt: normalizeOptionalTimestamp(row.lastLaunchAt),
      lastGradePublishStatus: row.lastGradePublishStatus,
      lastGradePublishAt: normalizeOptionalTimestamp(row.lastGradePublishAt),
      lastNrpsReadStatus: row.lastNrpsReadStatus,
      lastNrpsReadAt: normalizeOptionalTimestamp(row.lastNrpsReadAt),
      brokerVerificationStatus: brokerVerification?.internal?.status ?? null,
      brokerCheckedAt: brokerVerification?.internal?.checkedAt ??
        brokerVerification?.official.checkedAt ??
        null,
    }),
    brokerVerification,
  };
}

function mapBrokerVerificationStatusRows(
  internalRow: InternalBrokerVerificationRow | null,
  officialRow: OfficialBrokerVerificationRow | null,
): BrokerVerificationStatus | null {
  const supportedPath = internalRow?.scope ?? officialRow?.scope ?? null;

  if (supportedPath === null) {
    return null;
  }

  return {
    supportedPath,
    internal: internalRow === null ? null : {
      source: internalRow.source,
      status: internalRow.status,
      checkedAt: normalizeTimestamp(internalRow.checkedAt),
      summary: internalRow.summary,
      evidenceUrl: internalRow.detailUrl,
    },
    official: officialRow === null
      ? {
        state: "notCertified",
        checkedAt: null,
        directoryUrl: null,
      }
      : {
        state: officialRow.certificationState ?? "notCertified",
        checkedAt: normalizeTimestamp(officialRow.checkedAt),
        directoryUrl: officialRow.detailUrl,
      },
  };
}

function assertBrokerVerificationRunInput(
  input: RecordBrokerVerificationRunInput,
): void {
  if (input.source === "1edtech") {
    if (input.status === "notCertified" && input.certificationState !== null) {
      throw new Error(
        "Official not-certified verification runs cannot carry a certification state.",
      );
    }

    if (input.status === "passed" && input.certificationState === null) {
      throw new Error(
        "Official passed verification runs require an explicit certification state.",
      );
    }

    return;
  }

  if (input.status === "notCertified") {
    throw new Error(
      "Only official 1EdTech verification runs can use the notCertified status.",
    );
  }

  if (input.certificationState !== null) {
    throw new Error(
      "Internal verification runs cannot carry an official certification state.",
    );
  }
}

function mapRetryLookupRow(
  row: RetryLookupRow,
): RetryableGradePublicationLookup {
  return {
    attemptId: row.attemptId,
    deploymentRecordId: row.deploymentRecordId,
    deploymentSlug: row.deploymentSlug,
    publication: {
      attemptId: row.attemptId,
      status: row.publicationStatus,
      lineItemUrl: row.lineItemUrl,
      canvasUserId: row.canvasUserId,
      scoreGiven: normalizeNumeric(row.scoreGiven),
      scoreMaximum: normalizeNumeric(row.scoreMaximum),
      activityProgress: row.activityProgress,
      gradingProgress: row.gradingProgress,
      publishedAt: normalizeOptionalTimestamp(row.publishedAt),
      updatedAt: normalizeTimestamp(row.updatedAt),
      errorCode: row.errorCode,
      errorDetail: row.errorDetail,
    },
    binding: mapDeploymentBinding({
      canvasEnvironment: row.bindingCanvasEnvironment,
      issuer: row.bindingIssuer,
      clientId: row.bindingClientId,
      deploymentId: row.bindingDeploymentId,
    }),
    runtimeSession: mapRetryRuntimeSession(row),
  };
}

function mapRetryRuntimeSession(
  row: RetryLookupRow,
): RetryRuntimeSessionLookup | null {
  if (
    row.sessionId === null ||
    row.runtimeDeploymentRecordId === null ||
    row.runtimeDeploymentSlug === null ||
    row.runtimeAppId === null ||
    row.runtimePackageVersionId === null ||
    row.runtimePackageVersion === null ||
    row.runtimeCreatedAt === null ||
    row.runtimeExpiresAt === null
  ) {
    return null;
  }

  return {
    sessionId: row.sessionId,
    attemptId: row.runtimeAttemptId ?? row.attemptId,
    deploymentRecordId: row.runtimeDeploymentRecordId,
    deploymentSlug: row.runtimeDeploymentSlug,
    appId: row.runtimeAppId,
    packageVersionId: row.runtimePackageVersionId,
    packageVersion: row.runtimePackageVersion,
    services: mapLaunchServices({
      agsScope: row.runtimeAgsScope ?? [],
      agsLineitemsUrl: row.runtimeAgsLineitemsUrl,
      agsLineitemUrl: row.runtimeAgsLineitemUrl,
      nrpsContextMembershipsUrl: row.runtimeNrpsContextMembershipsUrl,
      nrpsServiceVersions: row.runtimeNrpsServiceVersions ?? [],
    }),
    createdAt: normalizeTimestamp(row.runtimeCreatedAt),
    expiresAt: normalizeTimestamp(row.runtimeExpiresAt),
  };
}

function mapLaunchServices(input: {
  agsScope: string[];
  agsLineitemsUrl: string | null;
  agsLineitemUrl: string | null;
  nrpsContextMembershipsUrl: string | null;
  nrpsServiceVersions: string[];
}): LaunchServiceClaims {
  const hasAgs = input.agsScope.length > 0 ||
    input.agsLineitemsUrl !== null ||
    input.agsLineitemUrl !== null;
  const hasNrps = input.nrpsContextMembershipsUrl !== null;

  return {
    ags: hasAgs
      ? {
        scope: input.agsScope,
        lineitemsUrl: input.agsLineitemsUrl,
        lineitemUrl: input.agsLineitemUrl,
      }
      : null,
    nrps: hasNrps
      ? {
        contextMembershipsUrl: input.nrpsContextMembershipsUrl!,
        serviceVersions: input.nrpsServiceVersions,
      }
      : null,
  };
}

function mapDeploymentBinding(input: {
  canvasEnvironment: string | null;
  issuer: string | null;
  clientId: string | null;
  deploymentId: string | null;
}): DeploymentBinding | null {
  if (
    input.canvasEnvironment === null ||
    input.issuer === null ||
    input.clientId === null ||
    input.deploymentId === null
  ) {
    return null;
  }

  return {
    canvasEnvironment: input
      .canvasEnvironment as DeploymentBinding["canvasEnvironment"],
    issuer: input.issuer,
    clientId: input.clientId,
    deploymentId: input.deploymentId,
  };
}

function mapAuditActivityStatus(
  eventType: string,
  status: AuditEventStatus,
): ControlPlaneActivityStatus {
  if (eventType === "launch.rejected" || status === "failed") {
    return "failed";
  }

  if (status === "accepted" || status === "succeeded") {
    return "succeeded";
  }

  return "pending";
}

function mapDiagnosticKind(
  eventType: string,
): ControlPlaneDiagnosticItem["kind"] {
  if (eventType.startsWith("launch.")) {
    return "launch";
  }

  if (
    eventType === "deployment.nrps_verified"
  ) {
    return "nrps";
  }

  if (eventType.startsWith("broker_verification.")) {
    return "brokerVerification";
  }

  if (eventType.startsWith("reviewer.")) {
    return "reviewer";
  }

  return "gradePublication";
}

function readStringDetail(
  detail: Record<string, unknown>,
  key: string,
): string | null {
  const value = detail[key];

  return typeof value === "string" ? value : null;
}

async function withClient<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    return await run(client);
  } finally {
    client.release();
  }
}

function normalizeTimestamp(value: Date | string | null): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === null) {
    throw new Error("Expected a timestamp value.");
  }

  return value;
}

function normalizeOptionalTimestamp(
  value: Date | string | null,
): string | null {
  if (value === null) {
    return null;
  }

  return normalizeTimestamp(value);
}

function normalizeNumeric(value: number | string): number {
  if (typeof value === "number") {
    return value;
  }

  return Number(value);
}
