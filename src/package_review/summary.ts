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
    label: 'Launch context',
    detail: 'Reads course, assignment, and learner context at launch time.',
    flagged: false,
    flagLabel: null,
  },
  read_activity_content: {
    id: 'read_activity_content',
    label: 'Activity content',
    detail: 'Reads the institution-provided activity bundle for this app.',
    flagged: false,
    flagLabel: null,
  },
  submit_attempt_event: {
    id: 'submit_attempt_event',
    label: 'Attempt events',
    detail: 'Reports learner progress and answer events back to Lantern.',
    flagged: true,
    flagLabel: 'Results signal',
  },
  finalize_attempt: {
    id: 'finalize_attempt',
    label: 'Attempt finalization',
    detail: 'Can close out a learner attempt so grading can continue downstream.',
    flagged: true,
    flagLabel: 'Completion gate',
  },
  read_local_state: {
    id: 'read_local_state',
    label: 'Saved state read',
    detail: 'Reads prior learner state kept inside Lantern-managed storage.',
    flagged: false,
    flagLabel: null,
  },
  write_local_state: {
    id: 'write_local_state',
    label: 'Saved state write',
    detail: 'Writes learner progress back into Lantern-managed storage.',
    flagged: true,
    flagLabel: 'Learner record',
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
      return 'This exact version is cleared for deployment pinning.';
    case 'rejected':
      return 'This exact version is frozen and cannot be enabled.';
    case 'pending':
      return 'This version is imported but still waiting on an admin decision.';
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
  return roles.map((role) => (role === 'learner' ? 'Learner' : 'Instructor')).join(' and ');
}

export function summarizeGrading(grading: GradingSettings): {
  label: string;
  detail: string;
} {
  if (grading.mode === 'declarative') {
    return {
      label: 'Declarative grading',
      detail: `Rubric file ${
        grading.rubricFile ?? 'not recorded'
      } with max score ${grading.maxScore ?? 'not recorded'}.`,
    };
  }

  if (grading.mode === 'manual') {
    return {
      label: 'Manual grading',
      detail: 'Instructors review the work outside the app runtime.',
    };
  }

  return {
    label: 'Completion grading',
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
      label: 'Manifest and file layout verified',
      detail: `Lantern reviewed the manifest contract and the snapshotted artifact at ${packageVersion.artifact.snapshotRoot}.`,
      issues: [],
    };
  }

  return {
    label: 'Validation fixes required',
    detail: 'This version is blocked until each package issue is corrected.',
    issues: packageVersion.validationIssues,
  };
}

export function describeDeploymentPin(deployment: DeploymentRecord | null): string {
  if (!deployment || deployment.enabledPackageVersion === null) {
    return 'No reviewed version is pinned yet.';
  }

  return `Pinned to version ${deployment.enabledPackageVersion}.`;
}
