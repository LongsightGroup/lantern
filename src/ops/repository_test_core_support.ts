import type { Pool } from "@db/postgres";
import type { DeploymentBinding, RuntimeSessionRecord } from "../lti/types.ts";
import type {
  AttemptRecord,
  AuditEventRecord,
  DeploymentRecord,
  GradePublicationRecord,
  LineItemBindingRecord,
  PackageVersionRecord,
} from "../package_review/types.ts";
import { buildDeploymentRecord } from "../test_helpers/package_review.ts";

type TestClient = Awaited<ReturnType<Pool["connect"]>>;

export type BrokerVerificationRunFixture = {
  certificationState: string | null;
  checkedAt: string;
  deploymentRecordId: number;
  detailUrl: string | null;
  scope: string;
  source: string;
  status: string;
  summary: string;
};

export async function createOpsRepositoryForTest(pool: Pool) {
  const { createOpsRepository } = await import("./repository.ts");
  return createOpsRepository(pool);
}

export async function insertAuditEvent(
  client: TestClient,
  event: AuditEventRecord,
): Promise<void> {
  await client.queryArray({
    text:
      "INSERT INTO audit_events (id, event_type, actor_type, actor_id, deployment_record_id, package_version_id, attempt_id, line_item_binding_id, status, summary, detail, occurred_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)",
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

export async function insertPackageVersion(
  client: TestClient,
  record: PackageVersionRecord,
): Promise<void> {
  await client.queryArray({
    text:
      "INSERT INTO package_versions (id, app_id, version, title, description, owner_type, owner_id, entrypoint, roles, install_scope, capabilities, grading_mode, grading_rubric_file, grading_max_score, approval_status, review_notes, reviewed_at, validation_issues, manifest_json, artifact_root, artifact_digest, imported_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20, $21, $22)",
    args: [
      record.id,
      record.appId,
      record.version,
      record.title,
      record.description,
      record.owner.type,
      record.owner.id,
      record.entrypoint,
      record.roles,
      record.installScope,
      record.capabilities,
      record.grading.mode,
      record.grading.rubricFile,
      record.grading.maxScore,
      record.approvalStatus,
      record.reviewNotes,
      record.reviewedAt,
      JSON.stringify(record.validationIssues),
      JSON.stringify(record.manifestJson),
      record.artifact.snapshotRoot,
      record.artifact.digest,
      record.importedAt,
    ],
  });
}

export async function insertDeployment(
  client: TestClient,
  appId: string,
  enabledPackageVersionId: number,
  binding: DeploymentBinding,
  overrides: Partial<
    Pick<DeploymentRecord, "id" | "slug" | "label" | "updatedAt">
  > = {},
): Promise<void> {
  const record = buildDeploymentRecord({
    id: overrides.id ?? 1,
    appId,
    enabledPackageVersionId,
    binding,
    ...(overrides.slug === undefined ? {} : { slug: overrides.slug }),
    ...(overrides.label === undefined ? {} : { label: overrides.label }),
    ...(overrides.updatedAt === undefined
      ? {}
      : { updatedAt: overrides.updatedAt }),
  });

  await client.queryArray({
    text:
      "INSERT INTO deployments (id, slug, label, app_id, enabled_package_version_id, lms_type, canvas_environment, issuer, client_id, deployment_id, authorization_endpoint, access_token_url, jwks_url, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
    args: [
      record.id,
      record.slug,
      record.label,
      record.appId,
      record.enabledPackageVersionId,
      binding.lms,
      binding.lms === "canvas" ? binding.canvasEnvironment : null,
      binding.issuer,
      binding.clientId,
      binding.deploymentId,
      binding.lms === "canvas" ? null : binding.authorizationEndpoint,
      binding.lms === "canvas" ? null : binding.accessTokenUrl,
      binding.lms === "canvas" ? null : binding.jwksUrl,
      record.updatedAt,
    ],
  });
}

export async function insertAttempt(
  client: TestClient,
  record: AttemptRecord,
): Promise<void> {
  await client.queryArray({
    text:
      "INSERT INTO attempts (id, attempt_id, deployment_record_id, deployment_slug, app_id, package_version_id, package_version, user_id, user_display_name, user_email, user_login, user_role, context_id, resource_link_id, activity_id, status, completion_state, started_at, finalized_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)",
    args: [
      record.id,
      record.attemptId,
      record.deploymentRecordId,
      record.deploymentSlug,
      record.appId,
      record.packageVersionId,
      record.packageVersion,
      record.userId,
      record.userDisplayName,
      record.userEmail,
      record.userLogin,
      record.userRole,
      record.contextId,
      record.resourceLinkId,
      record.activityId,
      record.status,
      record.completionState,
      record.startedAt,
      record.finalizedAt,
    ],
  });
}

export async function insertRuntimeSession(
  client: TestClient,
  record: RuntimeSessionRecord,
): Promise<void> {
  await client.queryArray({
    text:
      "INSERT INTO runtime_sessions (session_id, session_token, attempt_id, deployment_record_id, deployment_slug, app_id, package_version_id, package_version, capabilities, snapshot_root, entrypoint_path, content_path, ags_scope, ags_lineitems_url, ags_lineitem_url, nrps_context_memberships_url, nrps_service_versions, launch_user_role, launch_course_id, launch_assignment_id, launch_activity_id, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)",
    args: [
      record.sessionId,
      record.sessionToken,
      record.attemptId,
      record.deploymentRecordId,
      record.deploymentSlug,
      record.appId,
      record.packageVersionId,
      record.packageVersion,
      record.capabilities,
      record.snapshotRoot,
      record.entrypointPath,
      record.contentPath,
      record.services.ags?.scope ?? [],
      record.services.ags?.lineitemsUrl ?? null,
      record.services.ags?.lineitemUrl ?? null,
      record.services.nrps?.contextMembershipsUrl ?? null,
      record.services.nrps?.serviceVersions ?? [],
      record.launch.userRole,
      record.launch.courseId,
      record.launch.assignmentId ?? null,
      record.launch.activityId,
      record.createdAt,
      record.expiresAt,
    ],
  });
}

export async function insertLineItemBinding(
  client: TestClient,
  record: LineItemBindingRecord,
): Promise<void> {
  await client.queryArray({
    text:
      "INSERT INTO line_item_bindings (id, deployment_record_id, package_version_id, context_id, resource_link_id, activity_id, line_items_url, line_item_url, resource_id, tag, label, score_maximum, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
    args: [
      record.id,
      record.deploymentRecordId,
      record.packageVersionId,
      record.contextId,
      record.resourceLinkId,
      record.activityId,
      record.lineItemsUrl,
      record.lineItemUrl,
      record.resourceId,
      record.tag,
      record.label,
      record.scoreMaximum,
      record.createdAt,
      record.updatedAt,
    ],
  });
}

export async function insertGradePublication(
  client: TestClient,
  record: GradePublicationRecord,
): Promise<void> {
  await client.queryArray({
    text:
      "INSERT INTO grade_publications (id, attempt_id, line_item_binding_id, line_item_url, platform_user_id, score_given, score_maximum, activity_progress, grading_progress, status, created_at, updated_at, published_at, error_code, error_detail) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)",
    args: [
      record.id,
      record.attemptId,
      record.lineItemBindingId,
      record.lineItemUrl,
      record.platformUserId,
      record.scoreGiven,
      record.scoreMaximum,
      record.activityProgress,
      record.gradingProgress,
      record.status,
      record.createdAt,
      record.updatedAt,
      record.publishedAt,
      record.errorCode,
      JSON.stringify(record.errorDetail),
    ],
  });
}

export async function insertBrokerVerificationRun(
  client: TestClient,
  record: BrokerVerificationRunFixture,
): Promise<void> {
  await client.queryArray({
    text:
      "INSERT INTO broker_verification_runs (deployment_record_id, scope, source, status, summary, detail_url, certification_state, checked_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    args: [
      record.deploymentRecordId,
      record.scope,
      record.source,
      record.status,
      record.summary,
      record.detailUrl,
      record.certificationState,
      record.checkedAt,
    ],
  });
}
