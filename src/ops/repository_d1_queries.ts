import { BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS } from './broker_verification_paths.ts';

export const DEPLOYMENT_SUPPORTED_PATH_SQL = `
  CASE deployments.lms_type
    WHEN 'canvas' THEN '${BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS.canvas}'
    WHEN 'moodle' THEN '${BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS.moodle}'
    WHEN 'sakai' THEN '${BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS.sakai}'
    ELSE NULL
  END
`;

const INTERNAL_BROKER_VERIFICATION_FILTER = `
  broker_verification_runs.deployment_record_id = deployments.id
    AND broker_verification_runs.scope = ${DEPLOYMENT_SUPPORTED_PATH_SQL}
    AND broker_verification_runs.source IN ('manual', 'ci')
`;

const OFFICIAL_BROKER_VERIFICATION_FILTER = `
  broker_verification_runs.scope = ${DEPLOYMENT_SUPPORTED_PATH_SQL}
    AND broker_verification_runs.source = '1edtech'
`;

function latestBrokerVerificationColumn(column: string, filter: string): string {
  return `
    (
      SELECT broker_verification_runs.${column}
      FROM broker_verification_runs
      WHERE ${filter}
      ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
      LIMIT 1
    )
  `;
}

export const D1_INVENTORY_QUERY = `
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
    ${
  latestBrokerVerificationColumn('scope', INTERNAL_BROKER_VERIFICATION_FILTER)
} AS internalBrokerVerificationScope,
    ${
  latestBrokerVerificationColumn('source', INTERNAL_BROKER_VERIFICATION_FILTER)
} AS internalBrokerVerificationSource,
    ${
  latestBrokerVerificationColumn('status', INTERNAL_BROKER_VERIFICATION_FILTER)
} AS internalBrokerVerificationStatus,
    ${
  latestBrokerVerificationColumn('summary', INTERNAL_BROKER_VERIFICATION_FILTER)
} AS internalBrokerVerificationSummary,
    ${
  latestBrokerVerificationColumn('detail_url', INTERNAL_BROKER_VERIFICATION_FILTER)
} AS internalBrokerVerificationDetailUrl,
    ${
  latestBrokerVerificationColumn('checked_at', INTERNAL_BROKER_VERIFICATION_FILTER)
} AS internalBrokerVerificationCheckedAt,
    ${
  latestBrokerVerificationColumn('scope', OFFICIAL_BROKER_VERIFICATION_FILTER)
} AS officialBrokerVerificationScope,
    ${
  latestBrokerVerificationColumn('status', OFFICIAL_BROKER_VERIFICATION_FILTER)
} AS officialBrokerVerificationStatus,
    ${
  latestBrokerVerificationColumn('certification_state', OFFICIAL_BROKER_VERIFICATION_FILTER)
} AS officialBrokerVerificationCertificationState,
    ${
  latestBrokerVerificationColumn('detail_url', OFFICIAL_BROKER_VERIFICATION_FILTER)
} AS officialBrokerVerificationDetailUrl,
    ${
  latestBrokerVerificationColumn('checked_at', OFFICIAL_BROKER_VERIFICATION_FILTER)
} AS officialBrokerVerificationCheckedAt,
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

export const D1_LATEST_LAUNCH_QUERY = `
  ${D1_ACTIVITY_SELECT}
  WHERE deployment_record_id = ?
    AND event_type LIKE 'launch.%'
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1
`;

export const D1_LATEST_RUNTIME_SESSION_QUERY = `
  ${D1_ACTIVITY_SELECT}
  WHERE deployment_record_id = ?
    AND event_type = 'runtime.session.started'
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1
`;

export const D1_LATEST_RUNTIME_OUTCOME_QUERY = `
  ${D1_ACTIVITY_SELECT}
  WHERE deployment_record_id = ?
    AND event_type LIKE 'runtime.%'
    AND event_type NOT IN ('runtime.session.started', 'runtime.capability.allowed')
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1
`;

export const D1_LATEST_COMPATIBILITY_PATH_QUERY = `
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

export const D1_LATEST_NRPS_QUERY = `
  ${D1_ACTIVITY_SELECT}
  WHERE deployment_record_id = ?
    AND event_type = 'deployment.nrps_verified'
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1
`;

export const D1_LATEST_AGS_SMOKE_QUERY = `
  ${D1_ACTIVITY_SELECT}
  WHERE deployment_record_id = ?
    AND event_type = 'deployment.ags_smoke_verified'
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1
`;
