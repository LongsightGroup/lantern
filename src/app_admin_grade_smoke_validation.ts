import { requireTrimmedFormValue } from './app_request_support.ts';
import type { DeploymentBinding } from './lti/types.ts';
import type { DeploymentRecord } from './package_review/types.ts';

export type SupportedSmokeLms = Extract<DeploymentBinding['lms'], 'moodle' | 'sakai'>;

export function parseGradeSmokeLms(value: FormDataEntryValue | null): SupportedSmokeLms {
  const lms = requireTrimmedFormValue(value, 'Grade return check target is required.');

  if (lms !== 'moodle' && lms !== 'sakai') {
    throw new Error('Choose a saved Moodle or Sakai setup first.');
  }

  return lms;
}

export function parseDeploymentRecordId(value: FormDataEntryValue | null): number {
  const rawValue = requireTrimmedFormValue(value, 'Grade return check target is required.');
  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('Grade return check target is required.');
  }

  return parsed;
}

export function requireGradeSmokeDeployment(
  deployments: DeploymentRecord[],
  lms: SupportedSmokeLms,
  deploymentRecordId: number,
): DeploymentRecord {
  const deployment = deployments.find((candidate) => candidate.id === deploymentRecordId);

  if (deployment === undefined || deployment.lmsType !== lms || deployment.binding?.lms !== lms) {
    throw new Error('Choose a saved Moodle or Sakai setup first.');
  }

  return deployment;
}

export function requireGradeSmokeBinding(
  deployment: DeploymentRecord,
  lms: SupportedSmokeLms,
): Extract<DeploymentBinding, { lms: SupportedSmokeLms }> {
  if (deployment.binding === null || deployment.binding.lms !== lms) {
    throw new Error(
      `Save the exact ${formatGradeSmokeLmsLabel(lms)} setup before running a grade return check.`,
    );
  }

  return deployment.binding;
}

export function statusForGradeSmokeError(error: unknown): 409 | 500 {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (
    error.message.includes('required') ||
    error.message.includes('Choose one supported') ||
    error.message.includes('Save the exact') ||
    error.message.includes('Import a package version') ||
    error.message.includes('Launch ')
  ) {
    return 409;
  }

  return 500;
}

export function statusForGradeSmokeFailureCode(code: string | null): 409 | 500 {
  if (code === 'missing_ags_context' || code === 'missing_ags_scope') {
    return 409;
  }

  return 500;
}

export function formatGradeSmokeLmsLabel(lms: SupportedSmokeLms): string {
  switch (lms) {
    case 'moodle':
      return 'Moodle';
    case 'sakai':
      return 'Sakai';
  }
}
