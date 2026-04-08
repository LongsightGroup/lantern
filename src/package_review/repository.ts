import type { Pool } from "@db/postgres";
import type {
  AccessibilityReview,
  AttemptEventRecord,
  AttemptEvidenceArtifactRecord,
  AttemptRecord,
  AuditEventRecord,
  AuthoringDraftRecord,
  DeepLinkingResourceOption,
  DeploymentRecord,
  GradePublicationRecord,
  LineItemBindingRecord,
  PackageVersionRecord,
  PlacementAuditSnapshot,
  PreviewEvidenceRecord,
  PreviewSessionOrigin,
  PreviewSessionRecord,
  ReviewedPlacementRecord,
} from "./types.ts";
import type { ImportedPackageVersion } from "./intake.ts";
import type {
  DeepLinkingSessionRecord,
  DeploymentBinding,
  DynamicRegistrationStateRecord,
  LoginStateRecord,
  LtiPlacement,
  PersistedDeploymentLmsType,
  RuntimeSessionRecord,
} from "../lti/types.ts";
import type { LtiProfileId } from "../lti/profile.ts";
import { createAuditEventRepositoryMethods } from "./repository_audit_events.ts";
import { createAuthoringRepositoryMethods } from "./repository_authoring.ts";
import { createAttemptFlowRepositoryMethods } from "./repository_attempt_flows.ts";
import { createAttemptEvidenceRepositoryMethods } from "./repository_attempt_evidence.ts";
import { createAttemptQueryRepositoryMethods } from "./repository_attempt_queries.ts";
import { createDeepLinkingSessionRepositoryMethods } from "./repository_deep_linking_sessions.ts";
import { createDeploymentLoginRepositoryMethods } from "./repository_deployment_login.ts";
import { createDeploymentMutationRepositoryMethods } from "./repository_deployment_mutations.ts";
import { createDynamicRegistrationStateRepositoryMethods } from "./repository_dynamic_registration_states.ts";
import { createGradePublicationRepositoryMethods } from "./repository_grade_publications.ts";
import { createLineItemRepositoryMethods } from "./repository_line_items.ts";
import { createLtiProfileSettingsRepositoryMethods } from "./repository_lti_profile_settings.ts";
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
    accessibilityReview: AccessibilityReview | null;
  }): Promise<PackageVersionRecord>;
  rejectPackageVersion(input: {
    id: number;
    reviewNotes: string | null;
    accessibilityReview: AccessibilityReview | null;
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
    clientId: string | null;
    deploymentId: string;
  }): Promise<DeploymentRecord | null>;
  completePendingCanvasBinding(input: {
    issuer: string;
    clientId: string;
    deploymentId: string;
  }): Promise<DeploymentRecord | null>;
  createLoginState(record: LoginStateRecord): Promise<LoginStateRecord>;
  getLoginStateByState(state: string): Promise<LoginStateRecord | null>;
  consumeLoginState(
    input: { state: string; usedAt: string },
  ): Promise<LoginStateRecord>;
  createDynamicRegistrationState(
    record: DynamicRegistrationStateRecord,
  ): Promise<DynamicRegistrationStateRecord>;
  getDynamicRegistrationStateByState(
    state: string,
  ): Promise<DynamicRegistrationStateRecord | null>;
  consumeDynamicRegistrationState(input: {
    state: string;
    usedAt: string;
  }): Promise<DynamicRegistrationStateRecord>;
  createDeepLinkingSession(
    record: DeepLinkingSessionRecord,
  ): Promise<DeepLinkingSessionRecord>;
  getDeepLinkingSessionById(
    sessionId: string,
  ): Promise<DeepLinkingSessionRecord | null>;
  consumeDeepLinkingSession(input: {
    sessionId: string;
    usedAt: string;
  }): Promise<DeepLinkingSessionRecord>;
  updateDeepLinkingSessionSelection(input: {
    sessionId: string;
    selection: DeepLinkingSessionRecord["selection"];
  }): Promise<DeepLinkingSessionRecord>;
  listDeepLinkingResourceOptions(
    appId: string,
    placement: LtiPlacement,
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
    origin?: PreviewSessionOrigin,
  ): Promise<PreviewSessionRecord | null>;
  createAuthoringDraftFromPackageVersion(input: {
    packageVersionId: number;
    draftId: string;
    createdAt: string;
  }): Promise<AuthoringDraftRecord>;
  getAuthoringDraftById(draftId: string): Promise<AuthoringDraftRecord | null>;
  saveAuthoringDraftFiles(input: {
    draftId: string;
    files: Array<{ relativePath: string; contents: string }>;
    latestPromptText: string | null;
    latestGenerationNotes: string[];
    savedSource: AuthoringDraftRecord["savedSource"];
    updatedAt: string;
  }): Promise<AuthoringDraftRecord>;
  markAuthoringDraftPreviewed(input: {
    draftId: string;
    previewedAt: string;
  }): Promise<AuthoringDraftRecord>;
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
  createAttemptEvidenceArtifact(
    input: Omit<
      AttemptEvidenceArtifactRecord,
      "sequence"
    >,
  ): Promise<AttemptEvidenceArtifactRecord>;
  getAttemptEvidenceArtifactById(
    artifactId: string,
  ): Promise<AttemptEvidenceArtifactRecord | null>;
  listAttemptEvidenceArtifacts(
    attemptId: string,
  ): Promise<AttemptEvidenceArtifactRecord[]>;
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
  writeAttemptLocalState(input: {
    attemptId: string;
    localState: AttemptRecord["localState"];
  }): Promise<AttemptRecord>;
  getLineItemBinding(input: {
    deploymentRecordId: number;
    packageVersionId: number;
    contextId: string;
    resourceLinkId: string;
    activityId: string;
  }): Promise<LineItemBindingRecord | null>;
  saveLineItemBinding(
    record: Omit<LineItemBindingRecord, "id">,
  ): Promise<LineItemBindingRecord>;
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
  saveCanvasRegistration(input: {
    slug: string;
    label: string;
    appId: string;
    canvasEnvironment: Extract<
      DeploymentBinding,
      { lms: "canvas" }
    >["canvasEnvironment"];
    issuer: string;
    clientId: string;
  }): Promise<DeploymentRecord>;
  pinDeploymentVersion(input: {
    slug: string;
    label: string;
    appId: string;
    packageVersionId: number;
    lmsType?: PersistedDeploymentLmsType;
  }): Promise<DeploymentRecord>;
  getLanternLtiProfileSettings(): Promise<
    import("./types.ts").LanternLtiProfileSettingsRecord
  >;
  saveLanternDefaultLtiProfile(input: {
    defaultLtiProfile: LtiProfileId;
  }): Promise<import("./types.ts").LanternLtiProfileSettingsRecord>;
  saveDeploymentLtiProfileOverride(input: {
    deploymentId: number;
    ltiProfileOverride: LtiProfileId | null;
  }): Promise<DeploymentRecord>;
}

export function createPackageReviewRepository(
  pool: Pool,
): PackageReviewRepository {
  return {
    ...createPackageVersionRepositoryMethods(pool),
    ...createDeploymentLoginRepositoryMethods(pool),
    ...createDynamicRegistrationStateRepositoryMethods(pool),
    ...createRuntimeSessionRepositoryMethods(pool),
    ...createDeepLinkingSessionRepositoryMethods(pool),
    ...createReviewedPlacementRepositoryMethods(pool),
    ...createAuthoringRepositoryMethods(pool),
    ...createPreviewRepositoryMethods(pool),
    ...createRuntimeLookupRepositoryMethods(pool),
    ...createAttemptQueryRepositoryMethods(pool),
    ...createAttemptEvidenceRepositoryMethods(pool),
    ...createAttemptFlowRepositoryMethods(pool),
    ...createLineItemRepositoryMethods(pool),
    ...createGradePublicationRepositoryMethods(pool),
    ...createAuditEventRepositoryMethods(pool),
    ...createDeploymentMutationRepositoryMethods(pool),
    ...createLtiProfileSettingsRepositoryMethods(pool),
  };
}

export { derivePlacementAuditStatus } from "./repository_mappers_review.ts";
