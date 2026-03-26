export const PACKAGE_VERSION_SELECT = `
  SELECT
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
  FROM package_versions
`;

export const DEPLOYMENT_SELECT = `
  SELECT
    deployments.id,
    deployments.slug,
    deployments.label,
    deployments.app_id,
    deployments.enabled_package_version_id,
    deployments.lms_type,
    deployments.canvas_environment,
    deployments.issuer,
    deployments.client_id,
    deployments.deployment_id,
    deployments.moodle_authentication_request_url,
    deployments.moodle_access_token_url,
    deployments.moodle_jwks_url,
    deployments.sakai_oidc_authentication_url,
    deployments.sakai_access_token_url,
    deployments.sakai_jwks_url,
    package_versions.version AS enabled_package_version,
    deployments.updated_at
  FROM deployments
  LEFT JOIN package_versions
    ON package_versions.id = deployments.enabled_package_version_id
`;

export const RUNTIME_SESSION_SELECT = `
  SELECT
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
  FROM runtime_sessions
`;

export const DEEP_LINKING_SESSION_SELECT = `
  SELECT
    session_id,
    session_token,
    deployment_record_id,
    deployment_slug,
    app_id,
    user_id,
    user_role,
    context_id,
    context_title,
    deep_link_return_url,
    data,
    placement,
    accept_types,
    accept_multiple,
    accept_presentation_document_targets,
    accept_line_item,
    selected_package_version_id,
    selected_package_version,
    selected_activity_id,
    selected_content_path,
    created_at,
    expires_at
  FROM deep_linking_sessions
`;

export const REVIEWED_PLACEMENT_SELECT = `
  SELECT
    placement_id,
    deployment_record_id,
    deployment_slug,
    app_id,
    context_id,
    context_title,
    package_version_id,
    package_version,
    package_title,
    activity_id,
    content_path,
    content_title,
    created_by_user_id,
    resource_link_id,
    created_at,
    bound_at
  FROM reviewed_placements
`;

export const PLACEMENT_AUDIT_SNAPSHOT_SELECT = `
  SELECT
    reviewed_placements.placement_id,
    reviewed_placements.deployment_record_id,
    reviewed_placements.deployment_slug,
    reviewed_placements.app_id,
    reviewed_placements.context_id,
    reviewed_placements.context_title,
    reviewed_placements.package_version_id,
    reviewed_placements.package_version,
    reviewed_placements.package_title,
    reviewed_placements.activity_id,
    reviewed_placements.content_path,
    reviewed_placements.content_title,
    reviewed_placements.created_by_user_id,
    reviewed_placements.resource_link_id,
    reviewed_placements.created_at,
    reviewed_placements.bound_at,
    latest_preview.session_id AS latest_preview_session_id,
    latest_preview.latest_preview_occurred_at,
    COALESCE(preview_summary.preview_evidence_count, 0)::integer
      AS preview_evidence_count,
    COALESCE(audit_summary.deep_linking_request_count, 0)::integer
      AS deep_linking_request_count,
    COALESCE(audit_summary.placement_event_count, 0)::integer
      AS placement_event_count,
    COALESCE(audit_summary.reviewer_event_count, 0)::integer
      AS reviewer_event_count,
    audit_summary.latest_audit_occurred_at
  FROM reviewed_placements
  LEFT JOIN LATERAL (
    SELECT
      preview_sessions.session_id,
      MAX(preview_evidence.occurred_at) AS latest_preview_occurred_at
    FROM preview_sessions
    LEFT JOIN preview_evidence
      ON preview_evidence.preview_session_id = preview_sessions.session_id
    WHERE preview_sessions.package_version_id = reviewed_placements.package_version_id
    GROUP BY preview_sessions.session_id, preview_sessions.created_at
    ORDER BY preview_sessions.created_at DESC, preview_sessions.session_id DESC
    LIMIT 1
  ) AS latest_preview ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::integer AS preview_evidence_count
    FROM preview_evidence
    WHERE preview_evidence.preview_session_id = latest_preview.session_id
  ) AS preview_summary ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (
        WHERE audit_events.event_type LIKE 'deep_linking.request.%'
      )::integer AS deep_linking_request_count,
      COUNT(*) FILTER (
        WHERE audit_events.event_type LIKE 'deep_linking.placement.%'
          AND audit_events.detail ->> 'placementId' = reviewed_placements.placement_id
      )::integer AS placement_event_count,
      COUNT(*) FILTER (
        WHERE audit_events.event_type LIKE 'reviewer.%'
          AND audit_events.detail ->> 'placementId' = reviewed_placements.placement_id
      )::integer AS reviewer_event_count,
      MAX(audit_events.occurred_at) AS latest_audit_occurred_at
    FROM audit_events
    WHERE audit_events.deployment_record_id = reviewed_placements.deployment_record_id
      AND audit_events.package_version_id = reviewed_placements.package_version_id
      AND (
        audit_events.event_type LIKE 'deep_linking.request.%'
        OR audit_events.event_type LIKE 'deep_linking.placement.%'
        OR audit_events.event_type LIKE 'reviewer.%'
      )
  ) AS audit_summary ON TRUE
`;

export const PREVIEW_SESSION_SELECT = `
  SELECT
    session_id,
    package_version_id,
    app_id,
    package_version,
    package_title,
    capabilities,
    snapshot_root,
    entrypoint_path,
    launch_user_id,
    launch_user_role,
    launch_course_id,
    launch_assignment_id,
    launch_activity_id,
    fake_attempt_id,
    fake_score_maximum,
    fixture_data,
    created_at
  FROM preview_sessions
`;

export const PREVIEW_EVIDENCE_SELECT = `
  SELECT
    id,
    preview_session_id,
    sequence,
    event_type,
    capability,
    summary,
    detail,
    occurred_at
  FROM preview_evidence
`;

export const LINE_ITEM_BINDING_SELECT = `
  SELECT
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
  FROM canvas_line_item_bindings
`;

export const GRADE_PUBLICATION_SELECT = `
  SELECT
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
  FROM grade_publications
`;
