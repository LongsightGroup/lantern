export const SUPPORTED_BROKER_SCOPE = "canvasLti13LaunchAgsNrps";

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
    deployments.canvas_environment AS binding_canvas_environment,
    deployments.issuer AS binding_issuer,
    deployments.client_id AS binding_client_id,
    deployments.deployment_id AS binding_deployment_id,
    deployments.moodle_authentication_request_url
      AS binding_moodle_authentication_request_url,
    deployments.moodle_access_token_url AS binding_moodle_access_token_url,
    deployments.moodle_jwks_url AS binding_moodle_jwks_url,
    deployments.sakai_oidc_authentication_url
      AS binding_sakai_oidc_authentication_url,
    deployments.sakai_access_token_url AS binding_sakai_access_token_url,
    deployments.sakai_jwks_url AS binding_sakai_jwks_url,
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
export const INVENTORY_ORDER_BY = `
  ORDER BY deployments.updated_at DESC, deployments.id DESC
`;
export const LATEST_LAUNCH_QUERY = `
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
export const LATEST_NRPS_QUERY = `
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
export const LATEST_GRADE_PUBLICATION_QUERY = `
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

export const DIAGNOSTICS_QUERY = `
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

export const LATEST_INTERNAL_BROKER_VERIFICATION_QUERY = `
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

export const LATEST_OFFICIAL_BROKER_VERIFICATION_QUERY = `
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

export const INSERT_BROKER_VERIFICATION_RUN_QUERY = `
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

export const RETRYABLE_GRADE_PUBLICATION_LOOKUP_QUERY = `
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
