import type { ControlPlaneDiagnosticItem } from './types.ts';

const SECRET_DETAIL_KEYS = new Set([
  'accessToken',
  'authorization',
  'bearerToken',
  'clientAssertion',
  'clientSecret',
  'idToken',
  'refreshToken',
  'secret',
  'token',
]);

const NON_RETRYABLE_GRADE_FAILURE_CODES = new Set([
  'line_item_failed',
  'missing_ags_context',
  'missing_ags_scope',
  'missing_binding',
]);

export function formatDiagnosticItem(
  item: ControlPlaneDiagnosticItem,
  options: {
    retryableAttemptId?: string | null;
  } = {},
): ControlPlaneDiagnosticItem {
  const detail = sanitizeDetailRecord(item.detail);

  return {
    ...item,
    operatorSummary: buildOperatorSummary({
      ...item,
      detail,
    }),
    retryable: isRetryableDiagnostic(
      {
        ...item,
        detail,
      },
      options.retryableAttemptId ?? null,
    ),
    detail,
  };
}

function buildOperatorSummary(item: ControlPlaneDiagnosticItem): string {
  if (item.kind === 'launch') {
    return buildLaunchOperatorSummary(item);
  }

  if (item.kind === 'nrps') {
    return item.status === 'failed'
      ? 'Roster verification failed for the saved deployment path.'
      : 'Roster verification evidence was recorded for this deployment.';
  }

  if (item.kind === 'brokerVerification') {
    const savedDeployment = describeSavedDeploymentPath(item.detail);

    return item.status === 'failed'
      ? `Broker verification failed for ${savedDeployment} path.`
      : `Broker verification evidence was recorded for ${savedDeployment} path.`;
  }

  if (item.kind === 'reviewer') {
    return item.status === 'failed'
      ? 'Reviewer activity ended in a failed state and needs follow-up.'
      : 'Reviewer evidence was recorded for this reviewed placement.';
  }

  if (item.code === 'token_request_failed') {
    return `Lantern could not get a service token for ${describeSavedDeploymentPath(
      item.detail,
    )} from the control plane.`;
  }

  return item.status === 'failed'
    ? 'Grade publish failed and can be retried from the control plane.'
    : 'Grade publication evidence was recorded for this deployment.';
}

function buildLaunchOperatorSummary(item: ControlPlaneDiagnosticItem): string {
  const savedDeployment = describeSavedDeploymentPath(item.detail);

  switch (item.code) {
    case 'deployment_binding_missing':
      return `Launch rejected because Lantern could not find ${savedDeployment}.`;
    case 'deployment_mismatch':
      return `Launch rejected because the incoming launch claims did not match ${savedDeployment}.`;
    case 'login_state_expired':
      return 'Launch rejected because the saved login state expired before Lantern could continue the governed resource-link baseline.';
    case 'login_state_missing':
      return `Launch rejected because Lantern could not find the saved login state for ${savedDeployment}.`;
    case 'login_state_used':
      return 'Launch rejected because the saved login state was already used.';
    case 'missing_baseline_claim': {
      const claim = readStringDetail(item.detail, 'claim') ?? 'a required governed baseline claim';

      return `Launch rejected because ${savedDeployment} did not include governed baseline claim ${claim}.`;
    }
    case 'missing_pinned_package_version':
      return `Launch rejected because ${savedDeployment} does not have an approved governed runtime pin.`;
    case 'package_not_approved':
      return `Launch rejected because the governed package version is not approved for ${savedDeployment}.`;
    case 'reviewed_placement_context_mismatch':
      return 'Launch rejected because the reviewed placement does not match the saved governed launch context.';
    case 'reviewed_placement_deployment_mismatch':
      return `Launch rejected because the reviewed placement does not belong to ${savedDeployment}.`;
    case 'reviewed_placement_not_found':
      return `Launch rejected because the reviewed placement is no longer available on ${savedDeployment}.`;
    case 'reviewed_placement_resource_link_conflict':
      return `Launch rejected because the reviewed placement binding conflicts with the saved resource link on ${savedDeployment}.`;
    case 'signature_validation_failed':
      return `Launch rejected because Lantern could not verify the signed id_token against ${savedDeployment}.`;
    case 'unsupported_lti_version':
      return `Launch rejected because ${savedDeployment} only supports the governed resource-link baseline on LTI 1.3.0.`;
    case 'unsupported_message_type':
      return `Launch rejected because ${savedDeployment} only supports the governed resource-link baseline on /lti/launch.`;
    default:
      return item.status === 'failed'
        ? 'Launch failed before Lantern could hand the learner into the governed resource-link runtime.'
        : 'Launch evidence was recorded for this deployment.';
  }
}

function isRetryableDiagnostic(
  item: ControlPlaneDiagnosticItem,
  retryableAttemptId: string | null,
): boolean {
  if (
    item.kind !== 'gradePublication' ||
    item.status !== 'failed' ||
    item.attemptId === null ||
    item.attemptId !== retryableAttemptId
  ) {
    return false;
  }

  return !NON_RETRYABLE_GRADE_FAILURE_CODES.has(item.code ?? '');
}

function sanitizeDetailRecord(detail: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(detail)) {
    if (SECRET_DETAIL_KEYS.has(key)) {
      continue;
    }

    sanitized[key] = sanitizeDetailValue(value);
  }

  return sanitized;
}

function sanitizeDetailValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeDetailValue(entry));
  }

  if (isRecord(value)) {
    return sanitizeDetailRecord(value);
  }

  return value;
}

function describeSavedDeploymentPath(detail: Record<string, unknown>): string {
  const lms = readStringDetail(detail, 'lms');

  if (lms === 'canvas') {
    return 'the saved Canvas deployment';
  }

  if (lms === 'moodle') {
    return 'the saved Moodle deployment';
  }

  if (lms === 'sakai') {
    return 'the saved Sakai deployment';
  }

  return 'the saved deployment';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStringDetail(detail: Record<string, unknown>, key: string): string | null {
  const value = detail[key];

  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
