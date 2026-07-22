import type {
  AccessibilityReview,
  AttemptEventRecord,
  AttemptEvidenceArtifactRecord,
  AttemptRecord,
  AuditEventRecord,
  AuthoringDraftRecord,
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionOrigin,
  PreviewSessionRecord,
} from './types.ts';
import type { ImportedPackageVersion } from './intake.ts';
import type { RuntimeSessionRecord } from '../lti/types.ts';
import type { AppGenerationRunRecord, AppGenerationWorkspaceRecord } from '../app_writer/types.ts';

export interface PackageReviewRepository {
  registerPackageVersion(input: ImportedPackageVersion): Promise<PackageVersionRecord>;
  registerPythonLabTrialPackageVersion(
    input: ImportedPackageVersion,
  ): Promise<PackageVersionRecord>;
  listPackageVersions(): Promise<PackageVersionRecord[]>;
  listPackageVersionsByApp(appId: string): Promise<PackageVersionRecord[]>;
  deletePythonLabPackageVersion(id: number): Promise<void>;
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
  createPreviewSession(record: PreviewSessionRecord): Promise<PreviewSessionRecord>;
  getPreviewSessionById(sessionId: string): Promise<PreviewSessionRecord | null>;
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
    savedSource: AuthoringDraftRecord['savedSource'];
    updatedAt: string;
  }): Promise<AuthoringDraftRecord>;
  markAuthoringDraftPreviewed(input: {
    draftId: string;
    previewedAt: string;
  }): Promise<AuthoringDraftRecord>;
  createAppGenerationRun(record: AppGenerationRunRecord): Promise<AppGenerationRunRecord>;
  getAppGenerationRunById(generationId: string): Promise<AppGenerationRunRecord | null>;
  updateAppGenerationRun(record: AppGenerationRunRecord): Promise<AppGenerationRunRecord>;
  saveAppGenerationWorkspace(
    record: AppGenerationWorkspaceRecord,
  ): Promise<AppGenerationWorkspaceRecord>;
  getAppGenerationWorkspaceByGenerationId(
    generationId: string,
  ): Promise<AppGenerationWorkspaceRecord | null>;
  appendPreviewEvidence(input: {
    previewSessionId: string;
    eventType: string;
    capability: PreviewEvidenceRecord['capability'];
    summary: string;
    detail: PreviewEvidenceRecord['detail'];
    occurredAt: string;
  }): Promise<PreviewEvidenceRecord>;
  listPreviewEvidence(previewSessionId: string): Promise<PreviewEvidenceRecord[]>;
  createRuntimeSession(record: RuntimeSessionRecord): Promise<RuntimeSessionRecord>;
  getRuntimeSessionById(sessionId: string): Promise<RuntimeSessionRecord | null>;
  createAttempt(record: Omit<AttemptRecord, 'id'>): Promise<AttemptRecord>;
  getAttemptById(attemptId: string): Promise<AttemptRecord | null>;
  listAttemptsByApp(appId: string): Promise<AttemptRecord[]>;
  createAttemptEvidenceArtifact(
    input: Omit<AttemptEvidenceArtifactRecord, 'sequence'>,
  ): Promise<AttemptEvidenceArtifactRecord>;
  getAttemptEvidenceArtifactById(artifactId: string): Promise<AttemptEvidenceArtifactRecord | null>;
  listAttemptEvidenceArtifacts(attemptId: string): Promise<AttemptEvidenceArtifactRecord[]>;
  appendAttemptEvent(input: {
    attemptId: string;
    event: AttemptEventRecord['event'];
    normalizedEvent: Pick<
      AttemptEventRecord,
      'learningVerb' | 'objectId' | 'objectType' | 'result'
    >;
    receivedAt: string;
  }): Promise<AttemptEventRecord>;
  listAttemptEvents(attemptId: string): Promise<AttemptEventRecord[]>;
  finalizeAttempt(input: {
    attemptId: string;
    status: AttemptRecord['status'];
    completionState: AttemptRecord['completionState'];
    finalizedAt: string;
  }): Promise<AttemptRecord>;
  writeAttemptLocalState(input: {
    attemptId: string;
    localState: AttemptRecord['localState'];
  }): Promise<AttemptRecord>;
  recordAuditEvent(record: Omit<AuditEventRecord, 'id'>): Promise<AuditEventRecord>;
  listAuditEventsByAttemptId(attemptId: string): Promise<AuditEventRecord[]>;
  listAuditEventsByEventType(eventType: string): Promise<AuditEventRecord[]>;
}
