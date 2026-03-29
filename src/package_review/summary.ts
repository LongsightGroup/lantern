import type { Capability, UserRole } from '../../sdk/app-sdk.ts';
import type {
  ApprovalStatus,
  DeploymentRecord,
  GradingSettings,
  PackageVersionRecord,
  ValidationIssue,
} from './types.ts';

export interface CapabilitySummary {
  id: Capability;
  label: string;
  detail: string;
  flagged: boolean;
  flagLabel: string | null;
}

const CAPABILITY_COPY: Record<Capability, CapabilitySummary> = {
  read_launch_context: {
    id: 'read_launch_context',
    label: 'Course and assignment details',
    detail: 'Reads the course, assignment, and user details the LMS sends when the app opens.',
    flagged: false,
    flagLabel: null,
  },
  read_activity_content: {
    id: 'read_activity_content',
    label: 'App content',
    detail: 'Reads the approved app content for this version.',
    flagged: false,
    flagLabel: null,
  },
  submit_attempt_event: {
    id: 'submit_attempt_event',
    label: 'Progress updates',
    detail: 'Sends learner answers and progress back to Lantern while the activity is in use.',
    flagged: true,
    flagLabel: 'Learner work leaves the app',
  },
  finalize_attempt: {
    id: 'finalize_attempt',
    label: 'Finish attempt',
    detail:
      'Lets the app mark work complete so Lantern can score it and return a grade when applicable.',
    flagged: true,
    flagLabel: 'Can affect scores or grades',
  },
  read_local_state: {
    id: 'read_local_state',
    label: 'Read saved progress',
    detail: 'Reads saved learner progress from Lantern.',
    flagged: false,
    flagLabel: null,
  },
  write_local_state: {
    id: 'write_local_state',
    label: 'Save progress',
    detail: 'Stores learner progress in Lantern so the learner can continue later.',
    flagged: true,
    flagLabel: 'Stores learner data',
  },
};

export function approvalStatusLabel(status: ApprovalStatus): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'pending':
      return 'Pending review';
  }
}

export function approvalStatusDetail(status: ApprovalStatus): string {
  switch (status) {
    case 'approved':
      return 'This version is approved and can be made live.';
    case 'rejected':
      return 'This version is rejected and cannot be made live.';
    case 'pending':
      return 'This version is waiting for review.';
  }
}

export function approvalStatusClass(status: ApprovalStatus): string {
  return `status-badge status-${status}`;
}

export function summarizeCapabilities(capabilities: Capability[]): CapabilitySummary[] {
  return capabilities.map((capability) => CAPABILITY_COPY[capability]);
}

export function summarizeFlaggedCapabilities(capabilities: Capability[]): CapabilitySummary[] {
  return summarizeCapabilities(capabilities).filter((capability) => capability.flagged);
}

export function summarizeRoles(roles: UserRole[]): string {
  return roles.map((role) => (role === 'learner' ? 'Learners' : 'Instructors')).join(' and ');
}

export function summarizeGrading(grading: GradingSettings): {
  label: string;
  detail: string;
} {
  if (grading.mode === 'declarative') {
    const maximumScore =
      grading.maxScore === null
        ? 'Maximum score not recorded yet.'
        : `Maximum score ${grading.maxScore}.`;

    return {
      label: 'Automatic scoring',
      detail: `Lantern scores learner work automatically using reviewed scoring rules saved with this app. ${maximumScore}`,
    };
  }

  if (grading.mode === 'manual') {
    return {
      label: 'Instructor scoring',
      detail: 'Instructors review the work outside the app runtime.',
    };
  }

  return {
    label: 'Completion-only scoring',
    detail: 'The app only reports completion state, not rubric-scored output.',
  };
}

export function summarizeValidation(
  packageVersion: Pick<PackageVersionRecord, 'validationIssues' | 'artifact'>,
): {
  label: string;
  detail: string;
  issues: ValidationIssue[];
} {
  if (packageVersion.validationIssues.length === 0) {
    return {
      label: 'Checks passed',
      detail: `Lantern checked the manifest and saved files for this version in ${packageVersion.artifact.snapshotRoot}.`,
      issues: [],
    };
  }

  return {
    label: 'Fix these items',
    detail: 'This version stays blocked until each issue below is fixed.',
    issues: packageVersion.validationIssues,
  };
}

export function describeDeploymentPin(deployment: DeploymentRecord | null): string {
  if (!deployment || deployment.enabledPackageVersion === null) {
    return 'No reviewed version is pinned yet.';
  }

  return `Pinned to version ${deployment.enabledPackageVersion}.`;
}
