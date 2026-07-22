import type { ImportedPackageVersion } from '../package_review/intake.ts';
import { createReviewedRuntimeContract } from '../package_review/runtime_contract.ts';
import type {
  AccessibilityReview,
  AttemptEventRecord,
  AttemptEvidenceArtifactRecord,
  AttemptRecord,
  AuditEventRecord,
  PackageVersionRecord,
} from '../package_review/types.ts';
import { normalizeAttemptEvent } from '../runtime/attempt_event_normalization.ts';
import { DEFAULT_IMPORTED_AT, DEFAULT_PHASE3_AT } from './package_review_test_defaults.ts';

export function buildAccessibilityReview(
  overrides: Partial<AccessibilityReview> = {},
): AccessibilityReview {
  return {
    keyboard: 'pass',
    focusVisible: 'pass',
    focusNotObscured: 'pass',
    structure: 'pass',
    contrast: 'pass',
    reducedMotion: 'pass',
    equivalentAlternatives: 'not_applicable',
    failureNotes: null,
    exceptionNote: null,
    ...overrides,
  };
}

export function buildPackageVersionRecord(
  overrides: Partial<PackageVersionRecord> = {},
): PackageVersionRecord {
  const record: Omit<PackageVersionRecord, 'runtimeContract' | 'runtimeContractSignature'> = {
    id: 1,
    appId: 'chapter-4-asteroids',
    version: '0.1.0',
    title: 'Chapter 4 Asteroids',
    description: 'Shoot the correct vocabulary target.',
    owner: { type: 'user', id: 'instructor_123' },
    runtime: { kind: 'browser', entrypoint: '/dist/index.html' },
    roles: ['learner', 'instructor'],
    installScope: 'course',
    capabilities: [
      'read_launch_context',
      'read_activity_content',
      'submit_attempt_event',
      'finalize_attempt',
      'read_local_state',
      'write_local_state',
    ],
    grading: {
      mode: 'declarative',
      rubricFile: '/scoring/rubric.json',
      maxScore: 100,
    },
    catalogVisibility: 'catalog',
    approvalStatus: 'pending',
    reviewNotes: null,
    accessibilityReview: null,
    reviewedAt: null,
    validationIssues: [],
    manifestJson: {
      app_id: 'chapter-4-asteroids',
      version: '0.1.0',
      title: 'Chapter 4 Asteroids',
    },
    artifact: {
      snapshotRoot: 'var/packages/chapter-4-asteroids/0.1.0',
      manifestPath: 'var/packages/chapter-4-asteroids/0.1.0/manifest.json',
      entrypointPath: 'var/packages/chapter-4-asteroids/0.1.0/dist/index.html',
      digest: 'sha256:chapter-4-asteroids-0.1.0',
    },
    importedAt: DEFAULT_IMPORTED_AT,
    ...overrides,
  };

  return {
    ...record,
    runtimeContract: overrides.runtimeContract ??
      createReviewedRuntimeContract({
        reviewData: {
          appId: record.appId,
          version: record.version,
          runtime: record.runtime,
          capabilities: record.capabilities,
        },
        artifactDigest: record.artifact.digest,
      }),
    runtimeContractSignature: overrides.runtimeContractSignature ??
      'test-reviewed-runtime-contract-signature',
  };
}

export function buildImportedPackageVersion(
  overrides: Partial<PackageVersionRecord> = {},
): ImportedPackageVersion {
  const record = buildPackageVersionRecord(overrides);

  return {
    reviewData: {
      appId: record.appId,
      version: record.version,
      title: record.title,
      description: record.description,
      owner: record.owner,
      runtime: record.runtime,
      roles: record.roles,
      installScope: record.installScope,
      capabilities: record.capabilities,
      grading: record.grading,
      manifestJson: record.manifestJson,
      validationIssues: record.validationIssues,
    },
    artifact: record.artifact,
    runtimeContract: record.runtimeContract,
    runtimeContractSignature: record.runtimeContractSignature,
  };
}

export function buildAttemptRecord(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: overrides.id ?? 1,
    attemptId: overrides.attemptId ?? 'attempt-123',
    previewSessionId: overrides.previewSessionId ?? 'preview-session-123',
    appId: overrides.appId ?? 'chapter-4-asteroids',
    packageVersionId: overrides.packageVersionId ?? 1,
    packageVersion: overrides.packageVersion ?? '0.1.0',
    userId: overrides.userId ?? 'canvas-user-123',
    userDisplayName: overrides.userDisplayName ?? null,
    userEmail: overrides.userEmail ?? null,
    userLogin: overrides.userLogin ?? null,
    userRole: overrides.userRole ?? 'learner',
    contextId: overrides.contextId ?? 'course-42',
    resourceLinkId: overrides.resourceLinkId ?? 'resource-link-123',
    activityId: overrides.activityId ?? 'activity-123',
    status: overrides.status ?? 'in_progress',
    completionState: overrides.completionState ?? null,
    localState: overrides.localState ?? null,
    startedAt: overrides.startedAt ?? DEFAULT_PHASE3_AT,
    finalizedAt: overrides.finalizedAt ?? null,
  };
}

export function buildAttemptEventRecord(
  overrides: Partial<AttemptEventRecord> = {},
): AttemptEventRecord {
  const event: AttemptEventRecord['event'] = overrides.event ?? {
    type: 'answer',
    questionId: 'q1',
    answer: 'asteroid',
    timestamp: DEFAULT_PHASE3_AT,
  };
  const normalizedEvent = normalizeAttemptEvent(event);

  return {
    id: overrides.id ?? 1,
    attemptId: overrides.attemptId ?? 'attempt-123',
    sequence: overrides.sequence ?? 1,
    eventType: overrides.eventType ?? event.type,
    learningVerb: overrides.learningVerb ?? normalizedEvent.learningVerb,
    objectId: overrides.objectId ?? normalizedEvent.objectId,
    objectType: overrides.objectType ?? normalizedEvent.objectType,
    result: overrides.result ?? normalizedEvent.result,
    event,
    receivedAt: overrides.receivedAt ?? DEFAULT_PHASE3_AT,
  };
}

export function buildAttemptEvidenceArtifactRecord(
  overrides: Partial<AttemptEvidenceArtifactRecord> = {},
): AttemptEvidenceArtifactRecord {
  return {
    artifactId: overrides.artifactId ?? 'artifact-001',
    attemptId: overrides.attemptId ?? 'attempt-123',
    sequence: overrides.sequence ?? 1,
    kind: overrides.kind ?? 'structured_json',
    contentType: overrides.contentType ?? 'application/json',
    fileName: overrides.fileName ?? 'submission.json',
    storageKey: overrides.storageKey ??
      'var/attempt-evidence/attempt-123/artifact-001-submission.json',
    byteSize: overrides.byteSize ?? 128,
    sha256: overrides.sha256 ?? 'sha256:artifact-001',
    createdAt: overrides.createdAt ?? DEFAULT_PHASE3_AT,
  };
}

export function buildAuditEventRecord(overrides: Partial<AuditEventRecord> = {}): AuditEventRecord {
  return {
    id: overrides.id ?? 1,
    eventType: overrides.eventType ?? 'attempt.submitted',
    actorType: overrides.actorType ?? 'system',
    actorId: overrides.actorId ?? null,
    packageVersionId: overrides.packageVersionId ?? 1,
    attemptId: overrides.attemptId === undefined ? 'attempt-123' : overrides.attemptId,
    status: overrides.status ?? 'accepted',
    summary: overrides.summary ?? 'Accepted attempt submission.',
    detail: overrides.detail ?? {
      route: '/runtime/sessions/runtime-session-123/attempt-events',
    },
    occurredAt: overrides.occurredAt ?? DEFAULT_PHASE3_AT,
  };
}
