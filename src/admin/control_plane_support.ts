import type {
  BrokerVerificationStatus,
  ControlPlaneDeploymentInventoryRow,
  OfficialCertificationState,
} from '../ops/types.ts';
import { formatDateTime } from './layout.ts';

export function aggregatePilotUsage(deployments: ControlPlaneDeploymentInventoryRow[]) {
  return deployments.reduce<ControlPlaneDeploymentInventoryRow['pilotUsage']>(
    (summary, deployment) => ({
      deploymentRecordId: 0,
      totalLaunches: summary.totalLaunches + deployment.pilotUsage.totalLaunches,
      attemptsStarted: summary.attemptsStarted + deployment.pilotUsage.attemptsStarted,
      attemptsCompleted: summary.attemptsCompleted + deployment.pilotUsage.attemptsCompleted,
      gradePublishesSucceeded:
        summary.gradePublishesSucceeded + deployment.pilotUsage.gradePublishesSucceeded,
      gradePublishesFailed:
        summary.gradePublishesFailed + deployment.pilotUsage.gradePublishesFailed,
      recentActiveUsers: summary.recentActiveUsers + deployment.pilotUsage.recentActiveUsers,
      lastLaunchAt: pickLatestTimestamp(summary.lastLaunchAt, deployment.pilotUsage.lastLaunchAt),
      measuredAt:
        pickLatestTimestamp(summary.measuredAt, deployment.pilotUsage.measuredAt) ??
        new Date().toISOString(),
    }),
    {
      deploymentRecordId: 0,
      totalLaunches: 0,
      attemptsStarted: 0,
      attemptsCompleted: 0,
      gradePublishesSucceeded: 0,
      gradePublishesFailed: 0,
      recentActiveUsers: 0,
      lastLaunchAt: null,
      measuredAt: new Date().toISOString(),
    },
  );
}

export function resolveBrokerVerification(
  latestBrokerVerification: BrokerVerificationStatus | null,
  deployments: ControlPlaneDeploymentInventoryRow[],
): BrokerVerificationStatus | null {
  const deploymentVerification = pickLatestBrokerVerification(deployments);

  if (latestBrokerVerification === null) {
    return deploymentVerification;
  }

  if (deploymentVerification === null) {
    return latestBrokerVerification;
  }

  return {
    supportedPath: deploymentVerification.supportedPath,
    internal: deploymentVerification.internal,
    official: latestBrokerVerification.official,
  };
}

export function describeSupportedPath(
  supportedPath: BrokerVerificationStatus['supportedPath'],
): string {
  switch (supportedPath) {
    case 'canvasLti13LaunchAgsNrps':
      return 'Canvas LTI 1.3 launch, AGS, and NRPS';
  }
}

export function describeBrokerRunStatus(
  status: 'passed' | 'failed' | 'pending' | 'notRun',
): string {
  switch (status) {
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'pending':
      return 'Pending';
    case 'notRun':
      return 'Not run';
  }
}

export function describeOfficialCertificationState(state: OfficialCertificationState): string {
  switch (state) {
    case 'notCertified':
      return 'Not certified';
    case 'ltiAdvantageCertified':
      return 'LTI Advantage Certified';
    case 'ltiAdvantageComplete':
      return 'LTI Advantage Complete';
  }
}

export function describeEnablementState(deployment: ControlPlaneDeploymentInventoryRow): string {
  if (deployment.enabledPackageVersionId !== null && deployment.binding !== null) {
    return 'Launch-ready';
  }

  if (deployment.enabledPackageVersionId !== null) {
    return 'Version pinned, binding missing';
  }

  if (deployment.binding !== null) {
    return 'Binding saved, version missing';
  }

  return 'Needs configuration';
}

export function describeActivitySnapshot(
  status: ControlPlaneDeploymentInventoryRow['lastLaunchStatus'],
  occurredAt: string | null,
): string {
  if (status === null || occurredAt === null) {
    return 'Not recorded yet';
  }

  return `${describeActivityStatus(status)} at ${formatDateTime(occurredAt)}`;
}

export function describeGradePublicationSnapshot(
  status: ControlPlaneDeploymentInventoryRow['lastGradePublishStatus'],
  occurredAt: string | null,
): string {
  if (status === null || occurredAt === null) {
    return 'Not recorded yet';
  }

  return `${describeGradePublicationStatus(status)} at ${formatDateTime(occurredAt)}`;
}

export function describeFollowUp(deployment: ControlPlaneDeploymentInventoryRow): string {
  if (deployment.lastGradePublishStatus === 'failed') {
    return 'Retry required';
  }

  if (deployment.health.overallStatus === 'healthy') {
    return 'None right now';
  }

  if (deployment.health.overallStatus === 'failed') {
    return 'Blocked';
  }

  if (deployment.health.overallStatus === 'attention') {
    return 'Operator review';
  }

  return 'Awaiting evidence';
}

export function healthStatusClass(
  status: ControlPlaneDeploymentInventoryRow['health']['overallStatus'],
): string {
  switch (status) {
    case 'healthy':
      return 'status-badge status-approved';
    case 'attention':
      return 'status-badge status-pending';
    case 'failed':
      return 'status-badge status-rejected';
    case 'unknown':
      return 'status-badge status-pending';
  }
}

export function describeHealthLabel(
  status: ControlPlaneDeploymentInventoryRow['health']['overallStatus'],
): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'attention':
      return 'Needs attention';
    case 'failed':
      return 'Blocked';
    case 'unknown':
      return 'Not recorded';
  }
}

function pickLatestBrokerVerification(
  deployments: ControlPlaneDeploymentInventoryRow[],
): BrokerVerificationStatus | null {
  return (
    deployments
      .map((deployment) => deployment.brokerVerification)
      .filter((candidate): candidate is BrokerVerificationStatus => candidate !== null)
      .sort((left, right) =>
        newestVerificationTimestamp(right).localeCompare(newestVerificationTimestamp(left)),
      )[0] ?? null
  );
}

function newestVerificationTimestamp(verification: BrokerVerificationStatus): string {
  return verification.internal?.checkedAt ?? verification.official.checkedAt ?? '';
}

function pickLatestTimestamp(left: string | null, right: string | null): string | null {
  if (left === null) {
    return right;
  }

  if (right === null) {
    return left;
  }

  return left.localeCompare(right) >= 0 ? left : right;
}

function describeActivityStatus(
  status: NonNullable<ControlPlaneDeploymentInventoryRow['lastLaunchStatus']>,
): string {
  switch (status) {
    case 'succeeded':
      return 'Succeeded';
    case 'failed':
      return 'Failed';
    case 'pending':
      return 'Pending';
    case 'notRun':
      return 'Not run';
  }
}

function describeGradePublicationStatus(
  status: NonNullable<ControlPlaneDeploymentInventoryRow['lastGradePublishStatus']>,
): string {
  switch (status) {
    case 'published':
      return 'Published';
    case 'failed':
      return 'Failed';
    case 'pending':
      return 'Pending';
  }
}
