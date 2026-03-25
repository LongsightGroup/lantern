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
    if (item.code === 'deployment_mismatch') {
      return 'Launch rejected because the incoming Canvas deployment did not match the saved deployment binding.';
    }

    if (item.code === 'signature_validation_failed') {
      return 'Launch rejected because Lantern could not verify the signed id_token against the saved Canvas login.';
    }

    return item.status === 'failed'
      ? 'Launch failed before Lantern could hand the learner into the governed runtime.'
      : 'Launch evidence was recorded for this deployment.';
  }

  if (item.kind === 'nrps') {
    return item.status === 'failed'
      ? 'Roster verification failed for the saved deployment path.'
      : 'Roster verification evidence was recorded for this deployment.';
  }

  if (item.kind === 'brokerVerification') {
    return item.status === 'failed'
      ? 'Broker verification failed for the supported Canvas path.'
      : 'Broker verification evidence was recorded for the supported Canvas path.';
  }

  if (item.kind === 'reviewer') {
    return item.status === 'failed'
      ? 'Reviewer activity ended in a failed state and needs follow-up.'
      : 'Reviewer evidence was recorded for this reviewed placement.';
  }

  if (item.code === 'token_request_failed') {
    return 'Lantern could not get a Canvas service token for this attempt from the control plane.';
  }

  return item.status === 'failed'
    ? 'Grade publish failed and can be retried from the control plane.'
    : 'Grade publication evidence was recorded for this deployment.';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
