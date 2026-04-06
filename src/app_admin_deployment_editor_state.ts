import type { DeploymentEditorField, DeploymentEditorState } from './admin/deployment_detail.ts';
import { createErrorNotice } from './app_notice_support.ts';
import type { LmsType } from './lti/types.ts';
import { errorMessage } from './app_status_support.ts';

export function buildInstallEditorState(
  lms: LmsType | null,
  formData: FormData | null,
  title: string,
  error: unknown,
): DeploymentEditorState | null {
  if (lms === null) {
    return null;
  }

  return {
    lms,
    focusSection: 'install',
    notice: createErrorNotice(title, error),
    fieldErrors: buildFieldErrors(lms, errorMessage(error)),
    installValues: collectInstallValues(lms, formData),
    pinPackageVersionId: null,
  };
}

export function buildPinEditorState(
  lms: LmsType | null,
  formData: FormData | null,
  title: string,
  error: unknown,
): DeploymentEditorState | null {
  if (lms === null) {
    return null;
  }

  return {
    lms,
    focusSection: 'pin',
    notice: createErrorNotice(title, error),
    fieldErrors: buildFieldErrors(lms, errorMessage(error)),
    installValues: collectInstallValues(lms, formData),
    pinPackageVersionId: formValueString(formData, 'packageVersionId'),
  };
}

function collectInstallValues(
  lms: LmsType,
  formData: FormData | null,
): Partial<Record<DeploymentEditorField, string>> {
  switch (lms) {
    case 'canvas':
      return collectFieldValues(formData, ['canvasEnvironment', 'clientId', 'deploymentId']);
    case 'moodle':
      return collectFieldValues(formData, [
        'issuer',
        'clientId',
        'deploymentId',
        'authorizationEndpoint',
        'accessTokenUrl',
        'jwksUrl',
      ]);
    case 'sakai':
      return collectFieldValues(formData, [
        'issuer',
        'clientId',
        'deploymentId',
        'authorizationEndpoint',
        'accessTokenUrl',
        'jwksUrl',
      ]);
  }
}

function collectFieldValues(
  formData: FormData | null,
  fields: DeploymentEditorField[],
): Partial<Record<DeploymentEditorField, string>> {
  const values: Partial<Record<DeploymentEditorField, string>> = {};

  for (const field of fields) {
    const value = formValueString(formData, field);

    if (value !== null) {
      values[field] = value;
    }
  }

  return values;
}

function buildFieldErrors(
  lms: LmsType,
  message: string,
): Partial<Record<DeploymentEditorField, string>> {
  const field = resolveFieldError(lms, message);

  return field === null ? {} : { [field]: message };
}

function resolveFieldError(lms: LmsType, message: string): DeploymentEditorField | null {
  switch (lms) {
    case 'canvas':
      switch (message) {
        case 'Canvas Client ID is required.':
          return 'clientId';
        case 'Canvas Deployment ID is required.':
          return 'deploymentId';
        case 'Choose an approved version.':
          return 'packageVersionId';
        default:
          return null;
      }
    case 'moodle':
      switch (message) {
        case 'Moodle Platform ID is required.':
          return 'issuer';
        case 'Moodle Client ID is required.':
          return 'clientId';
        case 'Moodle Deployment ID is required.':
          return 'deploymentId';
        case 'Moodle Authorization endpoint is required.':
          return 'authorizationEndpoint';
        case 'Moodle Access token URL is required.':
          return 'accessTokenUrl';
        case 'Moodle Public keyset URL is required.':
          return 'jwksUrl';
        case 'Choose an approved version.':
          return 'packageVersionId';
        default:
          return null;
      }
    case 'sakai':
      switch (message) {
        case 'Sakai Platform ID is required.':
          return 'issuer';
        case 'Sakai Client ID is required.':
          return 'clientId';
        case 'Sakai Deployment ID is required.':
          return 'deploymentId';
        case 'Sakai Authorization endpoint is required.':
          return 'authorizationEndpoint';
        case 'Sakai Access token URL is required.':
          return 'accessTokenUrl';
        case 'Sakai Public keyset URL is required.':
          return 'jwksUrl';
        case 'Choose an approved version.':
          return 'packageVersionId';
        default:
          return null;
      }
  }
}

function formValueString(formData: FormData | null, field: string): string | null {
  const value = formData?.get(field);
  return typeof value === 'string' ? value : null;
}
