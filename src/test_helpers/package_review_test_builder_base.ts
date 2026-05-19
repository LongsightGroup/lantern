import type { ImportedPackageVersion } from '../package_review/intake.ts';
import { createReviewedRuntimeContract } from '../package_review/runtime_contract.ts';
import type {
  AccessibilityReview,
  AttemptEventRecord,
  AttemptEvidenceArtifactRecord,
  AttemptRecord,
  AuditEventRecord,
  DeploymentRecord,
  GradePublicationRecord,
  LineItemBindingRecord,
  PackageVersionRecord,
} from '../package_review/types.ts';
import { normalizeAttemptEvent } from '../runtime/attempt_event_normalization.ts';
import {
  DEFAULT_IMPORTED_AT,
  DEFAULT_PHASE3_AT,
  DEFAULT_UPDATED_AT,
} from './package_review_test_defaults.ts';

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
    entrypoint: '/dist/index.html',
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
          entrypoint: record.entrypoint,
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
      entrypoint: record.entrypoint,
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

export function buildDeploymentRecord(overrides: Partial<DeploymentRecord> = {}): DeploymentRecord {
  const appId = overrides.appId ?? 'chapter-4-asteroids';
  const binding = overrides.binding ?? null;
  const lmsType = overrides.lmsType ?? binding?.lms ?? 'canvas';
  const defaultDeploymentIdentity = (() => {
    switch (lmsType) {
      case 'canvas':
        return {
          slug: `${appId}-pilot`,
          label: 'Pilot Deployment',
        };
      case 'moodle':
        return {
          slug: `${appId}-moodle`,
          label: 'Moodle Deployment',
        };
      case 'sakai':
        return {
          slug: `${appId}-sakai`,
          label: 'Sakai Deployment',
        };
      case 'preview':
        return {
          slug: `${appId}-preview`,
          label: 'Preview Deployment',
        };
    }
  })();

  return {
    id: 1,
    slug: defaultDeploymentIdentity.slug,
    label: `${appId.replaceAll('-', ' ')} ${defaultDeploymentIdentity.label}`
      .split(' ')
      .map((segment) => (segment[0] ? `${segment[0].toUpperCase()}${segment.slice(1)}` : segment))
      .join(' '),
    appId,
    enabledPackageVersionId: 1,
    enabledPackageVersion: '0.1.0',
    lmsType,
    binding,
    ltiProfileOverride: null,
    updatedAt: DEFAULT_UPDATED_AT,
    ...overrides,
  };
}

export function buildAttemptRecord(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: overrides.id ?? 1,
    attemptId: overrides.attemptId ?? 'attempt-123',
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    deploymentSlug: overrides.deploymentSlug ?? 'chapter-4-asteroids-pilot',
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

export function buildLineItemBindingRecord(
  overrides: Partial<LineItemBindingRecord> = {},
): LineItemBindingRecord {
  return {
    id: overrides.id ?? 1,
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    packageVersionId: overrides.packageVersionId ?? 1,
    contextId: overrides.contextId ?? 'course-42',
    resourceLinkId: overrides.resourceLinkId ?? 'resource-link-123',
    activityId: overrides.activityId ?? 'activity-123',
    lineItemsUrl: overrides.lineItemsUrl ?? 'https://canvas.example/api/lti/courses/42/line_items',
    lineItemUrl: overrides.lineItemUrl ?? 'https://canvas.example/api/lti/courses/42/line_items/9',
    resourceId: overrides.resourceId ?? 'chapter-4-asteroids:0.1.0',
    tag: overrides.tag ?? 'final-grade',
    label: overrides.label ?? 'Chapter 4 Asteroids Final Grade',
    scoreMaximum: overrides.scoreMaximum ?? 100,
    createdAt: overrides.createdAt ?? DEFAULT_PHASE3_AT,
    updatedAt: overrides.updatedAt ?? DEFAULT_PHASE3_AT,
  };
}

export function buildGradePublicationRecord(
  overrides: Partial<GradePublicationRecord> = {},
): GradePublicationRecord {
  return {
    id: overrides.id ?? 1,
    attemptId: overrides.attemptId ?? 'attempt-123',
    lineItemBindingId: overrides.lineItemBindingId ?? 1,
    lineItemUrl: overrides.lineItemUrl ?? 'https://canvas.example/api/lti/courses/42/line_items/9',
    platformUserId: overrides.platformUserId ?? 'canvas-user-123',
    scoreGiven: overrides.scoreGiven ?? 85,
    scoreMaximum: overrides.scoreMaximum ?? 100,
    activityProgress: overrides.activityProgress ?? 'Completed',
    gradingProgress: overrides.gradingProgress ?? 'FullyGraded',
    status: overrides.status ?? 'published',
    createdAt: overrides.createdAt ?? DEFAULT_PHASE3_AT,
    updatedAt: overrides.updatedAt ?? DEFAULT_PHASE3_AT,
    publishedAt: overrides.publishedAt ?? DEFAULT_PHASE3_AT,
    errorCode: overrides.errorCode ?? null,
    errorDetail: overrides.errorDetail ?? null,
  };
}

export function buildAuditEventRecord(overrides: Partial<AuditEventRecord> = {}): AuditEventRecord {
  return {
    id: overrides.id ?? 1,
    eventType: overrides.eventType ?? 'attempt.submitted',
    actorType: overrides.actorType ?? 'system',
    actorId: overrides.actorId ?? null,
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    packageVersionId: overrides.packageVersionId ?? 1,
    attemptId: overrides.attemptId === undefined ? 'attempt-123' : overrides.attemptId,
    lineItemBindingId: overrides.lineItemBindingId ?? null,
    status: overrides.status ?? 'accepted',
    summary: overrides.summary ?? 'Accepted attempt submission.',
    detail: overrides.detail ?? {
      route: '/runtime/sessions/runtime-session-123/attempt-events',
    },
    occurredAt: overrides.occurredAt ?? DEFAULT_PHASE3_AT,
  };
}
