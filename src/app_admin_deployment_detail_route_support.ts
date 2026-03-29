import { getManagedDeploymentSlot } from './admin/deployment_detail.ts';
import type { AdminNotice } from './admin/layout.ts';
import { buildCanvasConfigUrl, parseCanvasEnvironment, resolveCanvasIssuer } from './lti/config.ts';
import type { DeploymentBinding, LmsType } from './lti/types.ts';
import { requireTrimmedFormValue } from './app_request_support.ts';

export function parseRequiredPackageVersionId(formData: FormData): number {
  const rawValue = requireTrimmedFormValue(
    formData.get('packageVersionId'),
    'Choose an approved version.',
  );
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('Choose an approved version.');
  }

  return value;
}

export function buildDeploymentDetailNotice(
  canvasNotice: AdminNotice | null,
  registered: string | null,
) {
  switch (registered) {
    case 'canvas':
      return {
        tone: 'success' as const,
        title: 'Canvas setup saved',
        detail:
          'Lantern saved the Canvas environment and Client ID. Finish one real Canvas launch to capture the exact deployment ID automatically.',
      };
    case 'sakai':
      return {
        tone: 'success' as const,
        title: 'Sakai connection saved',
        detail: 'Lantern finished Sakai setup and saved the exact Sakai connection.',
      };
    default:
      return canvasNotice;
  }
}

export function requireTrimmedQueryValue(value: string | null, message: string): string {
  if (value === null) {
    throw new Error(message);
  }

  const trimmed = value.trim();

  if (trimmed === '') {
    throw new Error(message);
  }

  return trimmed;
}

export function normalizeOptionalQueryValue(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function canPinDeploymentVersion(
  slot: ReturnType<typeof getManagedDeploymentSlot>,
  lms: LmsType,
): boolean {
  return slot.deployment.binding?.lms === lms || (lms === 'canvas' && slot.persisted);
}

export function parseOptionalManagedDeploymentLms(value: string | null): LmsType | null {
  switch (value) {
    case 'canvas':
    case 'moodle':
    case 'sakai':
      return value;
    default:
      return null;
  }
}

export function parseManagedDeploymentLms(formData: FormData): LmsType {
  const value = requireTrimmedFormValue(formData.get('lms'), 'LMS is required.');

  switch (value) {
    case 'canvas':
    case 'moodle':
    case 'sakai':
      return value;
    default:
      throw new Error('Choose one supported LMS deployment.');
  }
}

export function buildDeploymentBindingFromFormData(
  lms: LmsType,
  formData: FormData,
): DeploymentBinding {
  switch (lms) {
    case 'canvas': {
      buildCanvasConfigUrl();
      const canvasEnvironment = parseCanvasEnvironment(formData.get('canvasEnvironment'));

      return {
        lms: 'canvas',
        canvasEnvironment,
        issuer: resolveCanvasIssuer(canvasEnvironment),
        clientId: requireTrimmedFormValue(
          formData.get('clientId'),
          'Canvas Client ID is required.',
        ),
        deploymentId: requireTrimmedFormValue(
          formData.get('deploymentId'),
          'Canvas Deployment ID is required.',
        ),
      };
    }
    case 'moodle':
      return {
        lms: 'moodle',
        issuer: requireTrimmedFormValue(formData.get('issuer'), 'Moodle Platform ID is required.'),
        clientId: requireTrimmedFormValue(
          formData.get('clientId'),
          'Moodle Client ID is required.',
        ),
        deploymentId: requireTrimmedFormValue(
          formData.get('deploymentId'),
          'Moodle Deployment ID is required.',
        ),
        authorizationEndpoint: requireTrimmedFormValue(
          formData.get('authorizationEndpoint'),
          'Moodle Authorization endpoint is required.',
        ),
        accessTokenUrl: requireTrimmedFormValue(
          formData.get('accessTokenUrl'),
          'Moodle Access token URL is required.',
        ),
        jwksUrl: requireTrimmedFormValue(
          formData.get('jwksUrl'),
          'Moodle Public keyset URL is required.',
        ),
      };
    case 'sakai':
      return {
        lms: 'sakai',
        issuer: requireTrimmedFormValue(formData.get('issuer'), 'Sakai Platform ID is required.'),
        clientId: requireTrimmedFormValue(formData.get('clientId'), 'Sakai Client ID is required.'),
        deploymentId: requireTrimmedFormValue(
          formData.get('deploymentId'),
          'Sakai Deployment ID is required.',
        ),
        authorizationEndpoint: requireTrimmedFormValue(
          formData.get('authorizationEndpoint'),
          'Sakai Authorization endpoint is required.',
        ),
        accessTokenUrl: requireTrimmedFormValue(
          formData.get('accessTokenUrl'),
          'Sakai Access token URL is required.',
        ),
        jwksUrl: requireTrimmedFormValue(
          formData.get('jwksUrl'),
          'Sakai Public keyset URL is required.',
        ),
      };
  }
}

export function buildBindingAuditDetail(binding: DeploymentBinding): Record<string, string> {
  switch (binding.lms) {
    case 'canvas':
      return {
        lms: binding.lms,
        canvasEnvironment: binding.canvasEnvironment,
        issuer: binding.issuer,
        clientId: binding.clientId,
        deploymentId: binding.deploymentId,
      };
    case 'moodle':
    case 'sakai':
      return {
        lms: binding.lms,
        issuer: binding.issuer,
        clientId: binding.clientId,
        deploymentId: binding.deploymentId,
        authorizationEndpoint: binding.authorizationEndpoint,
        accessTokenUrl: binding.accessTokenUrl,
        jwksUrl: binding.jwksUrl,
      };
  }
}

export function formatLmsLabel(lms: LmsType): string {
  switch (lms) {
    case 'canvas':
      return 'Canvas';
    case 'moodle':
      return 'Moodle';
    case 'sakai':
      return 'Sakai';
  }
}
