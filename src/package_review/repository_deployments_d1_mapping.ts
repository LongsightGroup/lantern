import {
  expectD1NullableNumber,
  expectD1NullableString,
  expectD1NullableStringLiteral,
  expectD1Number,
  expectD1String,
  expectD1StringLiteral,
} from '../db/d1_row.ts';
import { requireLtiProfileId } from '../lti/profile.ts';
import type { DeploymentRow } from './repository_row_types.ts';
import { normalizeTimestamp } from './repository_value_support.ts';
import type { LanternLtiProfileSettingsRecord } from './types.ts';

export const D1_DEPLOYMENT_SELECT = `
  SELECT
    deployments.id,
    deployments.slug,
    deployments.label,
    deployments.app_id AS appId,
    deployments.enabled_package_version_id AS enabledPackageVersionId,
    package_versions.version AS enabledPackageVersion,
    deployments.lms_type AS lmsType,
    deployments.canvas_environment AS canvasEnvironment,
    deployments.issuer,
    deployments.client_id AS clientId,
    deployments.deployment_id AS deploymentId,
    deployments.authorization_endpoint AS authorizationEndpoint,
    deployments.access_token_url AS accessTokenUrl,
    deployments.jwks_url AS jwksUrl,
    deployments.lti_profile_override AS ltiProfileOverride,
    deployments.updated_at AS updatedAt
  FROM deployments
  LEFT JOIN package_versions
    ON package_versions.id = deployments.enabled_package_version_id
`;

export interface D1DeploymentRow extends Record<string, unknown> {
  id: unknown;
  slug: unknown;
  label: unknown;
  appId: unknown;
  enabledPackageVersionId: unknown;
  enabledPackageVersion: unknown;
  lmsType: unknown;
  canvasEnvironment: unknown;
  issuer: unknown;
  clientId: unknown;
  deploymentId: unknown;
  authorizationEndpoint: unknown;
  accessTokenUrl: unknown;
  jwksUrl: unknown;
  ltiProfileOverride: unknown;
  updatedAt: unknown;
}

export interface D1LanternSettingsRow extends Record<string, unknown> {
  defaultLtiProfile: unknown;
  updatedAt: unknown;
}

export function mapD1DeploymentFields(row: D1DeploymentRow): DeploymentRow {
  return {
    id: expectD1Number(row.id, 'deployments.id'),
    slug: expectD1String(row.slug, 'deployments.slug'),
    label: expectD1String(row.label, 'deployments.label'),
    appId: expectD1String(row.appId, 'deployments.appId'),
    enabledPackageVersionId: expectD1NullableNumber(
      row.enabledPackageVersionId,
      'deployments.enabledPackageVersionId',
    ),
    enabledPackageVersion: expectD1NullableString(
      row.enabledPackageVersion,
      'deployments.enabledPackageVersion',
    ),
    lmsType: expectD1StringLiteral(row.lmsType, 'deployments.lmsType', [
      'canvas',
      'moodle',
      'sakai',
      'preview',
    ]),
    canvasEnvironment: expectD1NullableStringLiteral(
      row.canvasEnvironment,
      'deployments.canvasEnvironment',
      [
        'production',
        'beta',
        'test',
      ],
    ),
    issuer: expectD1NullableString(row.issuer, 'deployments.issuer'),
    clientId: expectD1NullableString(row.clientId, 'deployments.clientId'),
    deploymentId: expectD1NullableString(row.deploymentId, 'deployments.deploymentId'),
    authorizationEndpoint: expectD1NullableString(
      row.authorizationEndpoint,
      'deployments.authorizationEndpoint',
    ),
    accessTokenUrl: expectD1NullableString(row.accessTokenUrl, 'deployments.accessTokenUrl'),
    jwksUrl: expectD1NullableString(row.jwksUrl, 'deployments.jwksUrl'),
    ltiProfileOverride: expectD1NullableStringLiteral(
      row.ltiProfileOverride,
      'deployments.ltiProfileOverride',
      [
        'certification',
        'governedCompatibility',
      ],
    ),
    updatedAt: expectD1String(row.updatedAt, 'deployments.updatedAt'),
  };
}

export function mapD1LanternLtiProfileSettingsRow(
  row: D1LanternSettingsRow,
): LanternLtiProfileSettingsRecord {
  const defaultLtiProfile = expectD1String(
    row.defaultLtiProfile,
    'lantern_settings.defaultLtiProfile',
  );

  return {
    defaultLtiProfile: requireLtiProfileId(
      defaultLtiProfile,
      `Unsupported saved LTI profile ${defaultLtiProfile}.`,
    ),
    updatedAt: normalizeTimestamp(expectD1String(row.updatedAt, 'lantern_settings.updatedAt')),
  };
}
