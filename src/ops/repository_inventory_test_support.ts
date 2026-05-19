import type { InventoryQueryRow } from './repository_types.ts';
import type { DeploymentActivitySnapshot } from './types.ts';

export function buildInventoryQueryRow(
  overrides: Partial<InventoryQueryRow> = {},
): InventoryQueryRow {
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
    reviewedAt: overrides.reviewedAt ?? '2026-03-23T18:05:00Z',
    bindingLmsType: overrides.bindingLmsType ?? 'canvas',
    installEvidenceStatus: overrides.installEvidenceStatus ?? null,
    installEvidenceSummary: overrides.installEvidenceSummary ?? null,
    installEvidenceDetail: overrides.installEvidenceDetail ?? null,
    installEvidenceOccurredAt: overrides.installEvidenceOccurredAt ?? null,
    internalBrokerVerificationScope: overrides.internalBrokerVerificationScope ?? null,
    internalBrokerVerificationSource: overrides.internalBrokerVerificationSource ?? null,
    internalBrokerVerificationStatus: overrides.internalBrokerVerificationStatus ?? null,
    internalBrokerVerificationSummary: overrides.internalBrokerVerificationSummary ?? null,
    internalBrokerVerificationDetailUrl: overrides.internalBrokerVerificationDetailUrl ?? null,
    internalBrokerVerificationCheckedAt: overrides.internalBrokerVerificationCheckedAt ?? null,
    officialBrokerVerificationScope: overrides.officialBrokerVerificationScope ?? null,
    officialBrokerVerificationStatus: overrides.officialBrokerVerificationStatus ?? null,
    officialBrokerVerificationCertificationState:
      overrides.officialBrokerVerificationCertificationState ?? null,
    officialBrokerVerificationDetailUrl: overrides.officialBrokerVerificationDetailUrl ?? null,
    officialBrokerVerificationCheckedAt: overrides.officialBrokerVerificationCheckedAt ?? null,
    bindingCanvasEnvironment: overrides.bindingCanvasEnvironment ?? 'production',
    bindingIssuer: overrides.bindingIssuer ?? 'https://canvas.instructure.com',
    bindingClientId: overrides.bindingClientId ?? '10000000000001',
    bindingDeploymentId: overrides.bindingDeploymentId ?? 'deployment-123',
    bindingAuthorizationEndpoint: overrides.bindingAuthorizationEndpoint ?? null,
    bindingAccessTokenUrl: overrides.bindingAccessTokenUrl ?? null,
    bindingJwksUrl: overrides.bindingJwksUrl ?? null,
    updatedAt: overrides.updatedAt ?? '2026-03-24T12:30:00Z',
    lastLaunchAt: overrides.lastLaunchAt ?? '2026-03-24T12:30:00Z',
    lastLaunchStatus: overrides.lastLaunchStatus ?? 'succeeded',
    lastNrpsReadAt: overrides.lastNrpsReadAt ?? '2026-03-24T12:33:00Z',
    lastNrpsReadStatus: overrides.lastNrpsReadStatus ?? 'succeeded',
    lastGradePublishAt: overrides.lastGradePublishAt ?? '2026-03-24T12:35:00Z',
    lastGradePublishStatus: overrides.lastGradePublishStatus ?? 'failed',
    totalLaunches: overrides.totalLaunches ?? 1,
    attemptsStarted: overrides.attemptsStarted ?? 1,
    attemptsCompleted: overrides.attemptsCompleted ?? 1,
    gradePublishesSucceeded: overrides.gradePublishesSucceeded ?? 0,
    gradePublishesFailed: overrides.gradePublishesFailed ?? 1,
    recentActiveUsers: overrides.recentActiveUsers ?? 1,
    usageLastLaunchAt: overrides.usageLastLaunchAt ?? '2026-03-24T12:30:00Z',
    measuredAt: overrides.measuredAt ?? '2026-03-24T12:50:00Z',
  };
}

export function readInventoryInstallEvidence(row: unknown): DeploymentActivitySnapshot | null {
  return (
    (row as { installEvidence?: DeploymentActivitySnapshot | null } | undefined)?.installEvidence ??
      null
  );
}

export function readDetailInstallEvidence(detail: unknown): DeploymentActivitySnapshot | null {
  return (
    (detail as { latestInstallEvidence?: DeploymentActivitySnapshot | null } | undefined)
      ?.latestInstallEvidence ?? null
  );
}
