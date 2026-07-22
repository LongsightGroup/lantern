import type { Capability, UserRole } from '../../sdk/app-sdk.ts';
import type {
  AccessibilityReview,
  ApprovalStatus,
  GradingSettings,
  PackageVersionRecord,
  ValidationIssue,
} from './types.ts';
import { ACCESSIBILITY_REVIEW_FIELDS } from './types.ts';

export interface CapabilitySummary {
  id: Capability;
  label: string;
  detail: string;
  flagged: boolean;
  flagLabel: string | null;
  purpose: string;
  dataScope: string;
  retention: string;
  sensitivityLabel: string;
  sensitivityDetail: string;
}

export interface AccessibilityReviewSummary {
  label: string;
  detail: string;
  failedChecks: string[];
  exceptionNote: string | null;
}

const CAPABILITY_COPY: Record<Capability, CapabilitySummary> = {
  read_launch_context: {
    id: 'read_launch_context',
    label: 'Launch context',
    detail:
      'Uses the course, assignment, role, and launch identity the LMS sends when the app opens.',
    flagged: false,
    flagLabel: null,
    purpose: 'Open the correct course activity and label Lantern runtime records.',
    dataScope:
      'Launch-scoped course, assignment, activity, role, and user identifiers from the LMS.',
    retention: 'Stored with the launch, attempt, and audit records for the reviewed app version.',
    sensitivityLabel: 'Standard launch data',
    sensitivityDetail: 'Normal LTI context. The app does not receive LMS credentials.',
  },
  read_activity_content: {
    id: 'read_activity_content',
    label: 'Reviewed app content',
    detail: 'Reads the approved content file saved with this reviewed version.',
    flagged: false,
    flagLabel: null,
    purpose: 'Load the prompts, questions, fixtures, or activity content that reviewers approved.',
    dataScope: 'Package content owned by this app version, not LMS data.',
    retention: 'Stored as part of the immutable reviewed package snapshot.',
    sensitivityLabel: 'Package data',
    sensitivityDetail: 'Expected app operation. This does not expose learner records.',
  },
  submit_attempt_event: {
    id: 'submit_attempt_event',
    label: 'Participation and progress',
    detail: 'Records learner answers, checkpoints, and progress events in Lantern.',
    flagged: false,
    flagLabel: null,
    purpose: 'Support normal instructor reporting, progress review, and activity troubleshooting.',
    dataScope: 'Attempt-bound answer, progress, and completion events emitted by this app.',
    retention: 'Stored in Lantern with the learner attempt and governed audit trail.',
    sensitivityLabel: 'Normal learning telemetry',
    sensitivityDetail: 'Expected LMS-style participation tracking, scoped to this activity.',
  },
  submit_evidence_artifact: {
    id: 'submit_evidence_artifact',
    label: 'Submitted evidence artifacts',
    detail:
      'Lets the app send reviewed evidence artifacts back to Lantern. Lantern owns storage, submission binding, audit, and any later grade publication.',
    flagged: true,
    flagLabel: 'Sensitive evidence',
    purpose:
      'Collect reviewed learner work artifacts for submission review or browser-grader workflows.',
    dataScope:
      'Reviewed structured JSON or screenshot files submitted by this app, scoped to one attempt.',
    retention:
      'Stored in Lantern artifact storage and linked to the attempt, review, and audit records.',
    sensitivityLabel: 'Sensitive learner evidence',
    sensitivityDetail:
      'Can contain learner work and may support grading, so reviewers should confirm it matches the assignment.',
  },
  finalize_attempt: {
    id: 'finalize_attempt',
    label: 'Attempt completion',
    detail:
      'Reports that the learner finished so Lantern can close the attempt and apply reviewed scoring when configured.',
    flagged: false,
    flagLabel: null,
    purpose: 'Mark an activity attempt as completed or abandoned.',
    dataScope:
      'Completion state, timestamp, and reviewed scoring result when the package is configured for scoring.',
    retention: 'Stored with the attempt record and audit trail.',
    sensitivityLabel: 'Normal completion signal',
    sensitivityDetail:
      'Expected LMS behavior. The app still cannot write directly to the LMS gradebook.',
  },
  read_local_state: {
    id: 'read_local_state',
    label: 'Resume saved progress',
    detail: 'Reads saved learner progress for this activity from Lantern.',
    flagged: false,
    flagLabel: null,
    purpose: 'Let learners continue where they left off.',
    dataScope: 'Attempt-local state previously saved by this same app.',
    retention: 'Retained with the learner attempt so the activity can resume later.',
    sensitivityLabel: 'Normal progress state',
    sensitivityDetail: 'Scoped to this app attempt, not a broad learner profile.',
  },
  write_local_state: {
    id: 'write_local_state',
    label: 'Save resumable progress',
    detail: 'Saves learner progress in Lantern so the learner can continue later.',
    flagged: false,
    flagLabel: null,
    purpose: 'Persist in-progress UI state between launches.',
    dataScope: 'App-defined JSON state scoped to this learner attempt.',
    retention:
      'Stored by Lantern for resume behavior and replaced as the app saves newer progress.',
    sensitivityLabel: 'Normal progress state',
    sensitivityDetail: 'Expected learning-app behavior when an activity supports resume.',
  },
  run_code_submission: {
    id: 'run_code_submission',
    label: 'Run Python submission',
    detail:
      'Sends one Python function submission to Lantern’s isolated server-side grader without exposing hidden tests or LMS credentials.',
    flagged: true,
    flagLabel: 'Graded code',
    purpose:
      'Run public practice tests and final hidden-test evaluation for a reviewed Python assignment.',
    dataScope:
      'Learner Python source, server-side test outcomes, and a final score scoped to one attempt.',
    retention: 'Submission source and evaluated result follow the Python Lab retention policy.',
    sensitivityLabel: 'Sensitive learner work',
    sensitivityDetail:
      'Lantern, not the browser, executes the submission and controls final score publication.',
  },
  'lms.roster.members.read': {
    id: 'lms.roster.members.read',
    label: 'Course roster',
    detail: 'Reads the names, roles, and enrollment status for the current LMS course.',
    flagged: true,
    flagLabel: 'Institutional data',
    purpose: 'Display the current course roster through Lantern’s governed LMS boundary.',
    dataScope: 'Opaque subject IDs, display names, canonical roles, and enrollment status.',
    retention:
      'Opaque subject mappings are retained; roster payloads are not stored in audit logs.',
    sensitivityLabel: 'Protected roster data',
    sensitivityDetail:
      'Requires explicit institution or course approval for this exact app version.',
  },
  'lms.roster.contact.read': {
    id: 'lms.roster.contact.read',
    label: 'Roster email addresses',
    detail: 'Adds LMS-provided email addresses to approved roster results.',
    flagged: true,
    flagLabel: 'Contact data',
    purpose: 'Show course contact information when the institution explicitly permits it.',
    dataScope: 'Email addresses returned by the LMS for members of the current course.',
    retention: 'Returned to the app for the active session and excluded from governance logs.',
    sensitivityLabel: 'Personal contact data',
    sensitivityDetail: 'Denied as a whole when this separate permission has not been approved.',
  },
  'lms.roster.profile_photo.read': {
    id: 'lms.roster.profile_photo.read',
    label: 'Roster profile photos',
    detail: 'Proxies LMS-provided profile photos through short-lived Lantern media links.',
    flagged: true,
    flagLabel: 'Profile media',
    purpose: 'Help instructors visually identify learners in the current course.',
    dataScope: 'Profile image URLs supplied by NRPS; apps receive only opaque Lantern URLs.',
    retention: 'Source references expire after five minutes and image bytes are never persisted.',
    sensitivityLabel: 'Protected profile data',
    sensitivityDetail: 'Requires a separate explicit grant and never exposes the upstream URL.',
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
    const maximumScore = grading.maxScore === null
      ? 'Maximum score not recorded yet.'
      : `Maximum score ${grading.maxScore}.`;

    return {
      label: 'Automatic scoring',
      detail:
        `Lantern scores learner work automatically using reviewed scoring rules saved with this app. ${maximumScore}`,
    };
  }

  if (grading.mode === 'manual') {
    return {
      label: 'Instructor scoring',
      detail: 'Instructors review the work outside the app runtime.',
    };
  }

  if (grading.mode === 'sandbox') {
    return {
      label: 'Python sandbox grading',
      detail:
        'Lantern runs the submitted Python function in an isolated Sandbox and publishes only the server-generated score.',
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
      detail:
        `Lantern checked the manifest and saved files for this version in ${packageVersion.artifact.snapshotRoot}.`,
      issues: [],
    };
  }

  return {
    label: 'Fix these items',
    detail: 'This version stays blocked until each issue below is fixed.',
    issues: packageVersion.validationIssues,
  };
}

export function summarizeAccessibilityReview(
  packageVersion: Pick<PackageVersionRecord, 'approvalStatus' | 'accessibilityReview'>,
): AccessibilityReviewSummary {
  if (packageVersion.approvalStatus === 'pending') {
    return {
      label: 'Pending review',
      detail:
        'Record accessibility evidence during review before this version can be approved or rejected.',
      failedChecks: [],
      exceptionNote: null,
    };
  }

  if (packageVersion.accessibilityReview === null) {
    return {
      label: 'Review missing',
      detail: "This reviewed version predates Lantern's structured accessibility checklist.",
      failedChecks: [],
      exceptionNote: null,
    };
  }

  const failedChecks = listAccessibilityFailures(packageVersion.accessibilityReview);

  return {
    label: failedChecks.length === 0 ? 'Passed review' : 'Flagged review',
    detail: failedChecks.length === 0
      ? 'All recorded checks passed or were marked not applicable.'
      : `Failed checks: ${failedChecks.join(', ')}.`,
    failedChecks,
    exceptionNote: packageVersion.accessibilityReview.exceptionNote,
  };
}

function listAccessibilityFailures(review: AccessibilityReview): string[] {
  return ACCESSIBILITY_REVIEW_FIELDS.filter(({ key }) => review[key] === 'fail').map(
    ({ label }) => label,
  );
}
