import type { RetryRuntimeSessionLookup } from '../ops/types.ts';
import type {
  BrokerVerificationStatus,
  ControlPlaneDeploymentDetailSnapshot,
  ControlPlaneDeploymentHealth,
  ControlPlaneDeploymentInventoryRow,
  ControlPlaneDiagnosticItem,
  ControlPlaneHealthDimension,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
  InternalBrokerVerificationStatus,
  OfficialBrokerCertificationStatus,
  PilotUsageMetrics,
  RetryableGradePublicationLookup,
} from '../ops/types.ts';
import { buildDeploymentRecentLaunch } from './package_review_test_builder_ops_launches.ts';
import {
  DEFAULT_PHASE3_AT,
  DEFAULT_PHASE4_AT,
  DEFAULT_UPDATED_AT,
} from './package_review_test_defaults.ts';

export { buildDeploymentRecentLaunch } from './package_review_test_builder_ops_launches.ts';

export function buildPilotUsageMetrics(
  overrides: Partial<PilotUsageMetrics> = {},
): PilotUsageMetrics {
  return {
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    totalLaunches: overrides.totalLaunches ?? 4,
    attemptsStarted: overrides.attemptsStarted ?? 3,
    attemptsCompleted: overrides.attemptsCompleted ?? 2,
    gradePublishesSucceeded: overrides.gradePublishesSucceeded ?? 2,
    gradePublishesFailed: overrides.gradePublishesFailed ?? 1,
    recentActiveUsers: overrides.recentActiveUsers ?? 2,
    lastLaunchAt: overrides.lastLaunchAt ?? DEFAULT_PHASE4_AT,
    measuredAt: overrides.measuredAt ?? DEFAULT_PHASE4_AT,
  };
}

export function buildControlPlaneHealthDimension(
  overrides: Partial<ControlPlaneHealthDimension> = {},
): ControlPlaneHealthDimension {
  return {
    name: overrides.name ?? 'review',
    status: overrides.status ?? 'healthy',
    summary: overrides.summary ?? 'Approved version is pinned for the pilot.',
    checkedAt: overrides.checkedAt ?? DEFAULT_PHASE4_AT,
  };
}

export function buildControlPlaneDeploymentHealth(
  overrides: Partial<ControlPlaneDeploymentHealth> = {},
): ControlPlaneDeploymentHealth {
  return {
    overallStatus: overrides.overallStatus ?? 'attention',
    summary:
      overrides.summary ??
      'Deployment is readable in the control plane and needs one operator follow-up.',
    dimensions: overrides.dimensions ?? {
      review: buildControlPlaneHealthDimension({
        name: 'review',
        status: 'healthy',
        summary: 'Reviewed version is approved.',
      }),
      enablement: buildControlPlaneHealthDimension({
        name: 'enablement',
        status: 'healthy',
        summary: 'Deployment pin and Canvas binding are present.',
      }),
      launch: buildControlPlaneHealthDimension({
        name: 'launch',
        status: 'attention',
        summary: 'Latest launch needs confirmation from fresh operator evidence.',
      }),
      gradePublication: buildControlPlaneHealthDimension({
        name: 'gradePublication',
        status: 'attention',
        summary: 'Latest grade publish requires review.',
      }),
      nrps: buildControlPlaneHealthDimension({
        name: 'nrps',
        status: 'healthy',
        summary: 'Roster verification succeeded on the saved deployment path.',
      }),
      brokerVerification: buildControlPlaneHealthDimension({
        name: 'brokerVerification',
        status: 'healthy',
        summary: 'Latest broker verification evidence passed.',
      }),
    },
  };
}

export function buildDeploymentActivitySnapshot(
  overrides: Partial<DeploymentActivitySnapshot> = {},
): DeploymentActivitySnapshot {
  return {
    status: overrides.status ?? 'succeeded',
    occurredAt: overrides.occurredAt ?? DEFAULT_PHASE4_AT,
    summary: overrides.summary ?? 'Latest operator-visible activity succeeded.',
    attemptId: overrides.attemptId ?? 'attempt-123',
    contextId: overrides.contextId ?? 'course-42',
    detail: overrides.detail ?? { code: 'ok' },
  };
}

export function buildDeploymentGradePublicationSnapshot(
  overrides: Partial<DeploymentGradePublicationSnapshot> = {},
): DeploymentGradePublicationSnapshot {
  return {
    attemptId: overrides.attemptId ?? 'attempt-123',
    status: overrides.status ?? 'failed',
    lineItemUrl: overrides.lineItemUrl ?? 'https://canvas.example/api/lti/courses/42/line_items/9',
    platformUserId: overrides.platformUserId ?? 'canvas-user-123',
    scoreGiven: overrides.scoreGiven ?? 85,
    scoreMaximum: overrides.scoreMaximum ?? 100,
    activityProgress: overrides.activityProgress ?? 'Completed',
    gradingProgress: overrides.gradingProgress ?? 'Failed',
    publishedAt: overrides.publishedAt ?? null,
    updatedAt: overrides.updatedAt ?? DEFAULT_PHASE4_AT,
    errorCode: overrides.errorCode ?? 'canvas_score_rejected',
    errorDetail: overrides.errorDetail ?? { status: 422 },
  };
}

export function buildControlPlaneDiagnosticItem(
  overrides: Partial<ControlPlaneDiagnosticItem> = {},
): ControlPlaneDiagnosticItem {
  return {
    id: overrides.id ?? 1,
    kind: overrides.kind ?? 'gradePublication',
    eventType: overrides.eventType ?? 'grade_publish.failed',
    actorType: overrides.actorType ?? 'platform',
    status: overrides.status ?? 'failed',
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    attemptId: overrides.attemptId ?? 'attempt-123',
    code: overrides.code ?? 'canvas_score_rejected',
    summary: overrides.summary ?? 'Canvas rejected the score publish.',
    operatorSummary:
      overrides.operatorSummary ??
      'Grade publish failed and can be retried from the control plane.',
    retryable: overrides.retryable ?? false,
    detail: overrides.detail ?? { httpStatus: 422 },
    occurredAt: overrides.occurredAt ?? DEFAULT_PHASE4_AT,
  };
}

export function buildRetryRuntimeSessionLookup(
  overrides: Partial<RetryRuntimeSessionLookup> = {},
): RetryRuntimeSessionLookup {
  return {
    sessionId: overrides.sessionId ?? 'runtime-session-123',
    attemptId: overrides.attemptId ?? 'attempt-123',
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    deploymentSlug: overrides.deploymentSlug ?? 'chapter-4-asteroids-pilot',
    appId: overrides.appId ?? 'chapter-4-asteroids',
    packageVersionId: overrides.packageVersionId ?? 1,
    packageVersion: overrides.packageVersion ?? '0.1.0',
    services: overrides.services ?? {
      ags: {
        scope: [
          'https://purl.imsglobal.org/spec/lti-ags/scope/score',
          'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
        ],
        lineitemsUrl: 'https://canvas.example/api/lti/courses/42/line_items',
        lineitemUrl: 'https://canvas.example/api/lti/courses/42/line_items/9',
      },
      nrps: {
        contextMembershipsUrl: 'https://canvas.example/api/lti/courses/42/names_and_roles',
        serviceVersions: ['2.0'],
      },
    },
    createdAt: overrides.createdAt ?? DEFAULT_PHASE3_AT,
    expiresAt: overrides.expiresAt ?? '2026-03-26T02:45:00Z',
  };
}

export function buildRetryableGradePublicationLookup(
  overrides: Partial<RetryableGradePublicationLookup> = {},
): RetryableGradePublicationLookup {
  return {
    attemptId: overrides.attemptId ?? 'attempt-123',
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    deploymentSlug: overrides.deploymentSlug ?? 'chapter-4-asteroids-pilot',
    publication: overrides.publication ?? buildDeploymentGradePublicationSnapshot(),
    binding: overrides.binding ?? {
      lms: 'canvas',
      canvasEnvironment: 'production',
      issuer: 'https://canvas.instructure.com',
      clientId: '10000000000001',
      deploymentId: 'deployment-123',
    },
    runtimeSession: overrides.runtimeSession ?? buildRetryRuntimeSessionLookup(),
  };
}

export function buildInternalBrokerVerificationStatus(
  overrides: Partial<InternalBrokerVerificationStatus> = {},
): InternalBrokerVerificationStatus {
  return {
    source: overrides.source ?? 'manual',
    status: overrides.status ?? 'passed',
    checkedAt: overrides.checkedAt ?? DEFAULT_PHASE4_AT,
    summary:
      overrides.summary ??
      'Canvas launch, AGS publish, and NRPS verification all passed for the supported broker path.',
    evidenceUrl: overrides.evidenceUrl ?? 'https://example.test/verification/internal-run',
  };
}

export function buildOfficialBrokerCertificationStatus(
  overrides: Partial<OfficialBrokerCertificationStatus> = {},
): OfficialBrokerCertificationStatus {
  return {
    state: overrides.state ?? 'notCertified',
    checkedAt: overrides.checkedAt ?? DEFAULT_PHASE4_AT,
    directoryUrl: overrides.directoryUrl ?? null,
  };
}

export function buildBrokerVerificationStatus(
  overrides: Partial<BrokerVerificationStatus> = {},
): BrokerVerificationStatus {
  return {
    supportedPath: overrides.supportedPath ?? 'lti13LaunchAgsNrps',
    internal: overrides.internal ?? buildInternalBrokerVerificationStatus(),
    official: overrides.official ?? buildOfficialBrokerCertificationStatus(),
  };
}

export function buildControlPlaneDeploymentInventoryRow(
  overrides: Partial<ControlPlaneDeploymentInventoryRow> = {},
): ControlPlaneDeploymentInventoryRow {
  return {
    deploymentId: overrides.deploymentId ?? 1,
    deploymentSlug: overrides.deploymentSlug ?? 'chapter-4-asteroids-pilot',
    deploymentLabel: overrides.deploymentLabel ?? 'Chapter 4 Asteroids Pilot Deployment',
    appId: overrides.appId ?? 'chapter-4-asteroids',
    appTitle: overrides.appTitle ?? 'Chapter 4 Asteroids',
    ownerId: overrides.ownerId ?? 'instructor_123',
    enabledPackageVersionId: overrides.enabledPackageVersionId ?? 1,
    enabledPackageVersion: overrides.enabledPackageVersion ?? '0.1.0',
    approvalStatus: overrides.approvalStatus ?? 'approved',
    binding: overrides.binding ?? {
      lms: 'canvas',
      canvasEnvironment: 'production',
      issuer: 'https://canvas.instructure.com',
      clientId: '10000000000001',
      deploymentId: 'deployment-123',
    },
    installEvidence: overrides.installEvidence ?? null,
    updatedAt: overrides.updatedAt ?? DEFAULT_UPDATED_AT,
    lastLaunchAt: overrides.lastLaunchAt ?? DEFAULT_PHASE4_AT,
    lastLaunchStatus: overrides.lastLaunchStatus ?? 'succeeded',
    lastGradePublishAt: overrides.lastGradePublishAt ?? DEFAULT_PHASE4_AT,
    lastGradePublishStatus: overrides.lastGradePublishStatus ?? 'failed',
    lastNrpsReadAt: overrides.lastNrpsReadAt ?? DEFAULT_PHASE4_AT,
    lastNrpsReadStatus: overrides.lastNrpsReadStatus ?? 'succeeded',
    pilotUsage: overrides.pilotUsage ?? buildPilotUsageMetrics(),
    health: overrides.health ?? buildControlPlaneDeploymentHealth(),
    brokerVerification:
      overrides.brokerVerification === undefined
        ? buildBrokerVerificationStatus()
        : overrides.brokerVerification,
  };
}

export function buildControlPlaneDeploymentDetailSnapshot(
  overrides: Partial<ControlPlaneDeploymentDetailSnapshot> = {},
): ControlPlaneDeploymentDetailSnapshot {
  return {
    inventory: overrides.inventory ?? buildControlPlaneDeploymentInventoryRow(),
    latestInstallEvidence: overrides.latestInstallEvidence ?? null,
    latestLaunch:
      overrides.latestLaunch ??
      buildDeploymentActivitySnapshot({
        summary: 'Latest launch completed and reached the runtime handoff.',
      }),
    recentLaunches: overrides.recentLaunches ?? [buildDeploymentRecentLaunch()],
    latestAgsSmoke: overrides.latestAgsSmoke ?? null,
    latestNrpsRead:
      overrides.latestNrpsRead ??
      buildDeploymentActivitySnapshot({
        summary: 'Latest roster verification succeeded.',
      }),
    latestGradePublish: overrides.latestGradePublish ?? buildDeploymentGradePublicationSnapshot(),
    pilotUsage: overrides.pilotUsage ?? buildPilotUsageMetrics(),
    diagnostics: overrides.diagnostics ?? [buildControlPlaneDiagnosticItem()],
    retryableGradePublication:
      overrides.retryableGradePublication ?? buildRetryableGradePublicationLookup(),
    brokerVerification:
      overrides.brokerVerification === undefined
        ? buildBrokerVerificationStatus()
        : overrides.brokerVerification,
  };
}
