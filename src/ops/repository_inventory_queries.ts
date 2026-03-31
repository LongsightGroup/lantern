export { BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS } from "./broker_verification_paths.ts";
import { BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS } from "./broker_verification_paths.ts";

const DEPLOYMENT_BROKER_SUPPORTED_PATH_SQL = `
  CASE deployments.lms_type
    WHEN 'canvas' THEN '${BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS.canvas}'
    WHEN 'moodle' THEN '${BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS.moodle}'
    WHEN 'sakai' THEN '${BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS.sakai}'
    ELSE NULL
  END
`;

export const INVENTORY_BASE_QUERY = `
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
    deployments.lms_type AS binding_lms_type,
    install_evidence.status AS install_evidence_status,
    install_evidence.summary AS install_evidence_summary,
    install_evidence.detail AS install_evidence_detail,
    install_evidence.occurred_at AS install_evidence_occurred_at,
    internal_broker_verification.scope AS internal_broker_verification_scope,
    internal_broker_verification.source AS internal_broker_verification_source,
    internal_broker_verification.status AS internal_broker_verification_status,
    internal_broker_verification.summary AS internal_broker_verification_summary,
    internal_broker_verification.detail_url
      AS internal_broker_verification_detail_url,
    internal_broker_verification.checked_at
      AS internal_broker_verification_checked_at,
    official_broker_verification.scope AS official_broker_verification_scope,
    official_broker_verification.status AS official_broker_verification_status,
    official_broker_verification.certification_state
      AS official_broker_verification_certification_state,
    official_broker_verification.detail_url
      AS official_broker_verification_detail_url,
    official_broker_verification.checked_at
      AS official_broker_verification_checked_at,
    deployments.canvas_environment AS binding_canvas_environment,
    deployments.issuer AS binding_issuer,
    deployments.client_id AS binding_client_id,
    deployments.deployment_id AS binding_deployment_id,
    deployments.authorization_endpoint AS binding_authorization_endpoint,
    deployments.access_token_url AS binding_access_token_url,
    deployments.jwks_url AS binding_jwks_url,
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
      audit_events.status,
      audit_events.summary,
      audit_events.detail,
      audit_events.occurred_at
    FROM audit_events
    WHERE audit_events.deployment_record_id = deployments.id
      AND audit_events.event_type = 'deployment.binding_saved'
    ORDER BY audit_events.occurred_at DESC, audit_events.id DESC
    LIMIT 1
  ) AS install_evidence ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      broker_verification_runs.scope,
      broker_verification_runs.source,
      broker_verification_runs.status,
      broker_verification_runs.summary,
      broker_verification_runs.detail_url,
      broker_verification_runs.checked_at
    FROM broker_verification_runs
    WHERE broker_verification_runs.deployment_record_id = deployments.id
      AND broker_verification_runs.scope = ${DEPLOYMENT_BROKER_SUPPORTED_PATH_SQL}
      AND broker_verification_runs.source IN ('manual', 'ci')
    ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
    LIMIT 1
  ) AS internal_broker_verification ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      broker_verification_runs.scope,
      broker_verification_runs.status,
      broker_verification_runs.certification_state,
      broker_verification_runs.detail_url,
      broker_verification_runs.checked_at
    FROM broker_verification_runs
    WHERE broker_verification_runs.scope = ${DEPLOYMENT_BROKER_SUPPORTED_PATH_SQL}
      AND broker_verification_runs.source = '1edtech'
    ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
    LIMIT 1
  ) AS official_broker_verification ON TRUE
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
  WHERE deployments.lms_type <> 'preview'
`;

export const INVENTORY_ORDER_BY = `
  ORDER BY deployments.updated_at DESC, deployments.id DESC
`;
