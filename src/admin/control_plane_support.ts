import type {
  BrokerVerificationStatus,
  ControlPlaneDeploymentInventoryRow,
  OfficialCertificationState,
} from '../ops/types.ts';
export {
  describeSupportedPath,
  resolveSupportedPathForDeployment,
} from '../ops/broker_verification_paths.ts';
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

export function resolveOfficialBrokerVerification(
  latestBrokerVerification: BrokerVerificationStatus | null,
): BrokerVerificationStatus | null {
  if (latestBrokerVerification === null) {
    return null;
  }

  return {
    supportedPath: latestBrokerVerification.supportedPath,
    internal: null,
    official: latestBrokerVerification.official,
  };
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
