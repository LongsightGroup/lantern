import type { Pool } from "@db/postgres";
import type {
  AttemptEventRecord,
  AttemptRecord,
  AuditEventRecord,
  CanvasLineItemBindingRecord,
  DeepLinkingResourceOption,
  DeploymentRecord,
  GradePublicationRecord,
  PackageVersionRecord,
  PlacementAuditSnapshot,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
  ReviewedPlacementRecord,
} from "./types.ts";
import type { ImportedPackageVersion } from "./intake.ts";
import type {
  DeepLinkingSessionRecord,
  DeploymentBinding,
  LoginStateRecord,
  PersistedDeploymentLmsType,
  RuntimeSessionRecord,
} from "../lti/types.ts";
import { createAuditEventRepositoryMethods } from "./repository_audit_events.ts";
import { createAttemptFlowRepositoryMethods } from "./repository_attempt_flows.ts";
import { createAttemptQueryRepositoryMethods } from "./repository_attempt_queries.ts";
import { createDeepLinkingSessionRepositoryMethods } from "./repository_deep_linking_sessions.ts";
import { createDeploymentLoginRepositoryMethods } from "./repository_deployment_login.ts";
import { createDeploymentMutationRepositoryMethods } from "./repository_deployment_mutations.ts";
import { createGradePublicationRepositoryMethods } from "./repository_grade_publications.ts";
import { createLineItemRepositoryMethods } from "./repository_line_items.ts";
import { createPackageVersionRepositoryMethods } from "./repository_package_versions.ts";
import { createPreviewRepositoryMethods } from "./repository_preview.ts";
import { createReviewedPlacementRepositoryMethods } from "./repository_reviewed_placements.ts";
import { createRuntimeLookupRepositoryMethods } from "./repository_runtime_lookup.ts";
import { createRuntimeSessionRepositoryMethods } from "./repository_runtime_sessions.ts";

export interface PackageReviewRepository {
  registerPackageVersion(
    input: ImportedPackageVersion,
  ): Promise<PackageVersionRecord>;
  listPackageVersions(): Promise<PackageVersionRecord[]>;
  listPackageVersionsByApp(appId: string): Promise<PackageVersionRecord[]>;
  getPackageVersionById(id: number): Promise<PackageVersionRecord | null>;
  getPackageVersionByAppVersion(
    appId: string,
    version: string,
  ): Promise<PackageVersionRecord | null>;
  approvePackageVersion(input: {
    id: number;
    reviewNotes: string | null;
  }): Promise<PackageVersionRecord>;
  rejectPackageVersion(input: {
    id: number;
    reviewNotes: string | null;
  }): Promise<PackageVersionRecord>;
  getDeploymentBySlug(slug: string): Promise<DeploymentRecord | null>;
  listDeploymentsByApp(appId: string): Promise<DeploymentRecord[]>;
  getDeploymentByBinding(
    binding: Pick<
      DeploymentBinding,
      "lms" | "issuer" | "clientId" | "deploymentId"
    >,
  ): Promise<DeploymentRecord | null>;
  getDeploymentByPlatformIdentity(input: {
    issuer: string;
    clientId: string;
    deploymentId: string;
  }): Promise<DeploymentRecord | null>;
  createLoginState(record: LoginStateRecord): Promise<LoginStateRecord>;
  getLoginStateByState(state: string): Promise<LoginStateRecord | null>;
  consumeLoginState(
    input: { state: string; usedAt: string },
  ): Promise<LoginStateRecord>;
  createDeepLinkingSession(
    record: DeepLinkingSessionRecord,
  ): Promise<DeepLinkingSessionRecord>;
  getDeepLinkingSessionById(
    sessionId: string,
  ): Promise<DeepLinkingSessionRecord | null>;
  updateDeepLinkingSessionSelection(input: {
    sessionId: string;
    selection: DeepLinkingSessionRecord["selection"];
  }): Promise<DeepLinkingSessionRecord>;
  listDeepLinkingResourceOptions(
    appId: string,
  ): Promise<DeepLinkingResourceOption[]>;
  createReviewedPlacement(
    record: ReviewedPlacementRecord,
  ): Promise<ReviewedPlacementRecord>;
  getReviewedPlacementById(
    placementId: string,
  ): Promise<ReviewedPlacementRecord | null>;
  getPlacementAuditSnapshotById(
    placementId: string,
  ): Promise<PlacementAuditSnapshot | null>;
  requirePlacementAuditSnapshotById(
    placementId: string,
  ): Promise<PlacementAuditSnapshot>;
  bindReviewedPlacementResourceLink(input: {
    placementId: string;
    resourceLinkId: string;
    boundAt: string;
  }): Promise<ReviewedPlacementRecord>;
  createPreviewSession(
    record: PreviewSessionRecord,
  ): Promise<PreviewSessionRecord>;
  getPreviewSessionById(
    sessionId: string,
  ): Promise<PreviewSessionRecord | null>;
  getLatestPreviewSessionByPackageVersion(
    packageVersionId: number,
  ): Promise<PreviewSessionRecord | null>;
  appendPreviewEvidence(input: {
    previewSessionId: string;
    eventType: string;
    capability: PreviewEvidenceRecord["capability"];
    summary: string;
    detail: PreviewEvidenceRecord["detail"];
    occurredAt: string;
  }): Promise<PreviewEvidenceRecord>;
  listPreviewEvidence(
    previewSessionId: string,
  ): Promise<PreviewEvidenceRecord[]>;
  createRuntimeSession(
    record: RuntimeSessionRecord,
  ): Promise<RuntimeSessionRecord>;
  getRuntimeSessionById(
    sessionId: string,
  ): Promise<RuntimeSessionRecord | null>;
  getLatestRuntimeSessionByDeploymentId(
    deploymentRecordId: number,
  ): Promise<RuntimeSessionRecord | null>;
  createAttempt(record: Omit<AttemptRecord, "id">): Promise<AttemptRecord>;
  getAttemptById(attemptId: string): Promise<AttemptRecord | null>;
  appendAttemptEvent(input: {
    attemptId: string;
    event: AttemptEventRecord["event"];
    receivedAt: string;
  }): Promise<AttemptEventRecord>;
  listAttemptEvents(attemptId: string): Promise<AttemptEventRecord[]>;
  finalizeAttempt(input: {
    attemptId: string;
    status: AttemptRecord["status"];
    completionState: AttemptRecord["completionState"];
    finalizedAt: string;
  }): Promise<AttemptRecord>;
  getLineItemBinding(input: {
    deploymentRecordId: number;
    packageVersionId: number;
    contextId: string;
    resourceLinkId: string;
    activityId: string;
  }): Promise<CanvasLineItemBindingRecord | null>;
  saveLineItemBinding(
    record: Omit<CanvasLineItemBindingRecord, "id">,
  ): Promise<CanvasLineItemBindingRecord>;
  getGradePublicationByAttemptId(
    attemptId: string,
  ): Promise<GradePublicationRecord | null>;
  createGradePublication(
    record: Omit<GradePublicationRecord, "id">,
  ): Promise<GradePublicationRecord>;
  updateGradePublication(input: {
    attemptId: string;
    status: GradePublicationRecord["status"];
    updatedAt: string;
    publishedAt: string | null;
    errorCode: string | null;
    errorDetail: Record<string, unknown> | null;
  }): Promise<GradePublicationRecord>;
  recordAuditEvent(
    record: Omit<AuditEventRecord, "id">,
  ): Promise<AuditEventRecord>;
  listAuditEventsByAttemptId(attemptId: string): Promise<AuditEventRecord[]>;
  listAuditEventsByEventType(eventType: string): Promise<AuditEventRecord[]>;
  saveDeploymentBinding(input: {
    slug: string;
    label: string;
    appId: string;
    binding: DeploymentBinding;
  }): Promise<DeploymentRecord>;
  pinDeploymentVersion(input: {
    slug: string;
    label: string;
    appId: string;
    packageVersionId: number;
    lmsType?: PersistedDeploymentLmsType;
  }): Promise<DeploymentRecord>;
}

export function createPackageReviewRepository(
  pool: Pool,
): PackageReviewRepository {
  return {
    ...createPackageVersionRepositoryMethods(pool),
    ...createDeploymentLoginRepositoryMethods(pool),
    ...createRuntimeSessionRepositoryMethods(pool),
    ...createDeepLinkingSessionRepositoryMethods(pool),
    ...createReviewedPlacementRepositoryMethods(pool),
    ...createPreviewRepositoryMethods(pool),
    ...createRuntimeLookupRepositoryMethods(pool),
    ...createAttemptQueryRepositoryMethods(pool),
    ...createAttemptFlowRepositoryMethods(pool),
    ...createLineItemRepositoryMethods(pool),
    ...createGradePublicationRepositoryMethods(pool),
    ...createAuditEventRepositoryMethods(pool),
    ...createDeploymentMutationRepositoryMethods(pool),
  };
}

export { derivePlacementAuditStatus } from "./repository_mappers_review.ts";
