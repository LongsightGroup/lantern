import type { DeploymentBinding } from '../lti/types.ts';
import type { ApprovalStatus, GradePublicationStatus } from '../package_review/types.ts';
import {
  buildActivityDimension,
  buildBrokerVerificationDimension,
  buildEnablementDimension,
  buildGradePublicationDimension,
  buildReviewDimension,
  summarizeOverallHealth,
} from './health_support.ts';
import type {
  BrokerVerificationRunStatus,
  ControlPlaneActivityStatus,
  ControlPlaneDeploymentHealth,
  PilotUsageMetrics,
} from './types.ts';

export interface DeploymentHealthInput {
  approvalStatus: ApprovalStatus | null;
  reviewedAt?: string | null;
  enabledPackageVersionId: number | null;
  binding: DeploymentBinding | null;
  lastLaunchStatus: ControlPlaneActivityStatus | null;
  lastLaunchAt?: string | null;
  lastGradePublishStatus: GradePublicationStatus | null;
  lastGradePublishAt?: string | null;
  lastNrpsReadStatus: ControlPlaneActivityStatus | null;
  lastNrpsReadAt?: string | null;
  brokerVerificationStatus: BrokerVerificationRunStatus | null;
  brokerCheckedAt?: string | null;
}

export function deriveDeploymentHealth(input: DeploymentHealthInput): ControlPlaneDeploymentHealth {
  const review = buildReviewDimension(input.approvalStatus, input.reviewedAt);
  const enablement = buildEnablementDimension(input.enabledPackageVersionId, input.binding);
  const launch = buildActivityDimension({
    name: 'launch',
    status: input.lastLaunchStatus,
    checkedAt: input.lastLaunchAt ?? null,
    notRunSummary: 'No launch has been recorded yet.',
    healthySummary: 'Latest launch reached the governed runtime handoff.',
    failedSummary: 'Latest launch failed and needs operator review.',
    pendingSummary: 'Latest launch evidence is still pending review.',
  });
  const gradePublication = buildGradePublicationDimension(
    input.lastGradePublishStatus,
    input.lastGradePublishAt ?? null,
  );
  const nrps = buildActivityDimension({
    name: 'nrps',
    status: input.lastNrpsReadStatus,
    checkedAt: input.lastNrpsReadAt ?? null,
    notRunSummary: 'Roster verification has not run yet.',
    healthySummary: 'Roster verification succeeded on the saved deployment path.',
    failedSummary: 'Latest roster verification failed.',
    pendingSummary: 'Roster verification is still pending review.',
  });
  const brokerVerification = buildBrokerVerificationDimension(
    input.brokerVerificationStatus,
    input.brokerCheckedAt ?? null,
  );
  const dimensions = {
    review,
    enablement,
    launch,
    gradePublication,
    nrps,
    brokerVerification,
  };
  const statuses = Object.values(dimensions).map((dimension) => dimension.status);
  const overallStatus =
    review.status === 'failed'
      ? 'failed'
      : statuses.every((status) => status === 'healthy')
        ? 'healthy'
        : statuses.some((status) => status === 'failed' || status === 'attention')
          ? 'attention'
          : 'unknown';

  return {
    overallStatus,
    summary: summarizeOverallHealth(overallStatus, dimensions),
    dimensions,
  };
}

export function summarizePilotUsage(metrics: PilotUsageMetrics): Array<{
  label: string;
  value: string;
}> {
  return [
    {
      label: 'Launches recorded',
      value: String(metrics.totalLaunches),
    },
    {
      label: 'Attempts completed',
      value: String(metrics.attemptsCompleted),
    },
    {
      label: 'Grade publishes',
      value: `${metrics.gradePublishesSucceeded} passed / ${metrics.gradePublishesFailed} failed`,
    },
    {
      label: 'Recent active users',
      value: String(metrics.recentActiveUsers),
    },
  ];
}
