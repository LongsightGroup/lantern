import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects, runD1 } from '../db/d1.ts';
import { DEFAULT_LTI_PROFILE_ID, requireLtiProfileId } from '../lti/profile.ts';
import { mapDeploymentRow } from './repository_mappers_package.ts';
import type { DeploymentRow } from './repository_row_types.ts';
import type { PackageReviewRepository } from './repository.ts';
import type { LanternLtiProfileSettingsRecord } from './types.ts';
import { normalizeTimestamp } from './repository_value_support.ts';

export function createD1DeploymentRepositoryMethods(
  db: D1Database,
): Pick<
  PackageReviewRepository,
  | 'getDeploymentBySlug'
  | 'listDeploymentsByApp'
  | 'getDeploymentByBinding'
  | 'getDeploymentByPlatformIdentity'
  | 'completePendingCanvasBinding'
  | 'saveDeploymentBinding'
  | 'saveCanvasRegistration'
  | 'pinDeploymentVersion'
  | 'getLanternLtiProfileSettings'
  | 'saveLanternDefaultLtiProfile'
  | 'saveDeploymentLtiProfileOverride'
> {
  return {
    async getDeploymentBySlug(slug) {
      return await getDeploymentByField(db, 'deployments.slug = ?', [slug]);
    },

    async listDeploymentsByApp(appId) {
      const rows = await queryD1Objects<D1DeploymentRow>(
        db,
        `
          ${D1_DEPLOYMENT_SELECT}
          WHERE deployments.app_id = ?
            AND deployments.lms_type <> 'preview'
          ORDER BY deployments.lms_type ASC, deployments.slug ASC
        `,
        [appId],
      );

      return rows.map(mapD1DeploymentRow);
    },

    async getDeploymentByBinding(binding) {
      return await getDeploymentByField(
        db,
        `
          deployments.lms_type = ?
          AND deployments.issuer = ?
          AND deployments.client_id = ?
          AND deployments.deployment_id = ?
        `,
        [binding.lms, binding.issuer, binding.clientId, binding.deploymentId],
      );
    },

    async getDeploymentByPlatformIdentity(input) {
      const rows = await queryD1Objects<D1DeploymentRow>(
        db,
        `
          ${D1_DEPLOYMENT_SELECT}
          WHERE deployments.issuer = ?
            ${input.clientId === null ? '' : 'AND deployments.client_id = ?'}
            AND deployments.deployment_id = ?
          ORDER BY deployments.lms_type ASC, deployments.id ASC
        `,
        input.clientId === null
          ? [input.issuer, input.deploymentId]
          : [input.issuer, input.clientId, input.deploymentId],
      );

      if (rows.length === 0) {
        if (input.clientId !== null) {
          await rejectMismatchedCanvasDeployment(db, input);
        }

        return null;
      }

      if (rows.length > 1) {
        const clientLabel = input.clientId === null ? '' : ` with client ${input.clientId}`;
        throw new Error(
          `Multiple deployments matched issuer ${input.issuer}${clientLabel} and deployment ${input.deploymentId}. Resolve the duplicate LMS bindings before login can continue.`,
        );
      }

      return mapD1DeploymentRow(rows[0]!);
    },

    async completePendingCanvasBinding(input) {
      const exact = await getDeploymentByField(
        db,
        `
          deployments.lms_type = 'canvas'
          AND deployments.issuer = ?
          AND deployments.client_id = ?
          AND deployments.deployment_id = ?
        `,
        [input.issuer, input.clientId, input.deploymentId],
      );

      if (exact !== null) {
        return exact;
      }

      const pendingRows = await queryD1Objects<D1DeploymentRow>(
        db,
        `
          ${D1_DEPLOYMENT_SELECT}
          WHERE deployments.lms_type = 'canvas'
            AND deployments.issuer = ?
            AND deployments.client_id = ?
            AND deployments.deployment_id IS NULL
          ORDER BY deployments.id ASC
        `,
        [input.issuer, input.clientId],
      );

      if (pendingRows.length === 0) {
        return null;
      }

      if (pendingRows.length > 1) {
        throw new Error(
          `Multiple Canvas registrations matched issuer ${input.issuer} with client ${input.clientId}. Resolve the duplicate Canvas registrations before login can continue.`,
        );
      }

      const pending = mapD1DeploymentFields(pendingRows[0]!);
      await runD1(
        db,
        `
          UPDATE deployments
          SET deployment_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [input.deploymentId, pending.id],
      );

      return await requireDeploymentById(db, pending.id);
    },

    async saveDeploymentBinding(input) {
      await assertDeploymentSlotAvailable(db, input.slug, input.appId, input.binding.lms);
      await assertBindingAvailable(db, {
        slug: input.slug,
        lmsType: input.binding.lms,
        issuer: input.binding.issuer,
        clientId: input.binding.clientId,
        deploymentId: input.binding.deploymentId,
      });

      const columns = bindingColumns(input.binding);

      await runD1(
        db,
        `
          INSERT INTO deployments (
            slug,
            label,
            app_id,
            lms_type,
            canvas_environment,
            issuer,
            client_id,
            deployment_id,
            authorization_endpoint,
            access_token_url,
            jwks_url
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (slug) DO UPDATE SET
            label = excluded.label,
            app_id = excluded.app_id,
            lms_type = excluded.lms_type,
            canvas_environment = excluded.canvas_environment,
            issuer = excluded.issuer,
            client_id = excluded.client_id,
            deployment_id = excluded.deployment_id,
            authorization_endpoint = excluded.authorization_endpoint,
            access_token_url = excluded.access_token_url,
            jwks_url = excluded.jwks_url,
            updated_at = CURRENT_TIMESTAMP
        `,
        [
          input.slug,
          input.label,
          input.appId,
          input.binding.lms,
          columns.canvasEnvironment,
          input.binding.issuer,
          input.binding.clientId,
          input.binding.deploymentId,
          columns.authorizationEndpoint,
          columns.accessTokenUrl,
          columns.jwksUrl,
        ],
      );

      return await requireDeploymentBySlug(db, input.slug);
    },

    async saveCanvasRegistration(input) {
      await assertDeploymentSlotAvailable(db, input.slug, input.appId, 'canvas');
      await assertPendingCanvasRegistrationAvailable(db, input);

      await runD1(
        db,
        `
          INSERT INTO deployments (
            slug,
            label,
            app_id,
            lms_type,
            canvas_environment,
            issuer,
            client_id,
            deployment_id,
            authorization_endpoint,
            access_token_url,
            jwks_url
          ) VALUES (?, ?, ?, 'canvas', ?, ?, ?, NULL, NULL, NULL, NULL)
          ON CONFLICT (slug) DO UPDATE SET
            label = excluded.label,
            app_id = excluded.app_id,
            lms_type = excluded.lms_type,
            canvas_environment = excluded.canvas_environment,
            issuer = excluded.issuer,
            client_id = excluded.client_id,
            deployment_id = NULL,
            authorization_endpoint = NULL,
            access_token_url = NULL,
            jwks_url = NULL,
            updated_at = CURRENT_TIMESTAMP
        `,
        [
          input.slug,
          input.label,
          input.appId,
          input.canvasEnvironment,
          input.issuer,
          input.clientId,
        ],
      );

      return await requireDeploymentBySlug(db, input.slug);
    },

    async pinDeploymentVersion(input) {
      const lmsType = input.lmsType ?? 'canvas';
      const packageVersion = await queryD1First<{
        appId: string;
        approvalStatus: string;
        version: string;
      }>(
        db,
        `
          SELECT
            app_id AS appId,
            approval_status AS approvalStatus,
            version
          FROM package_versions
          WHERE id = ?
        `,
        [input.packageVersionId],
      );

      if (packageVersion === null) {
        throw new Error(`Package version id ${input.packageVersionId} was not found.`);
      }

      if (
        packageVersion.approvalStatus !== 'approved' &&
        !(lmsType === 'preview' && packageVersion.approvalStatus === 'pending')
      ) {
        throw new Error('Only approved package versions can be enabled.');
      }

      const existingDeployment = await requireCompatibleDeploymentSlot(
        db,
        input.slug,
        input.appId,
        lmsType,
      );
      const deploymentAppId = existingDeployment?.appId ?? input.appId;

      if (packageVersion.appId !== deploymentAppId) {
        throw new Error(
          `Package version ${packageVersion.appId}@${packageVersion.version} does not belong to deployment app ${deploymentAppId}.`,
        );
      }

      await runD1(
        db,
        `
          INSERT INTO deployments (
            slug,
            label,
            app_id,
            lms_type,
            enabled_package_version_id
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (slug) DO UPDATE SET
            label = excluded.label,
            lms_type = excluded.lms_type,
            enabled_package_version_id = excluded.enabled_package_version_id,
            updated_at = CURRENT_TIMESTAMP
        `,
        [input.slug, input.label, deploymentAppId, lmsType, input.packageVersionId],
      );

      return await requireDeploymentBySlug(db, input.slug);
    },

    async getLanternLtiProfileSettings() {
      return await ensureLanternLtiProfileSettings(db);
    },

    async saveLanternDefaultLtiProfile(input) {
      const defaultLtiProfile = requireLtiProfileId(input.defaultLtiProfile);

      await runD1(
        db,
        `
          INSERT INTO lantern_settings (
            singleton,
            default_lti_profile
          ) VALUES (1, ?)
          ON CONFLICT (singleton) DO UPDATE SET
            default_lti_profile = excluded.default_lti_profile,
            updated_at = CURRENT_TIMESTAMP
        `,
        [defaultLtiProfile],
      );

      return await ensureLanternLtiProfileSettings(db);
    },

    async saveDeploymentLtiProfileOverride(input) {
      const ltiProfileOverride = input.ltiProfileOverride === null
        ? null
        : requireLtiProfileId(input.ltiProfileOverride);
      const existing = await requireDeploymentById(db, input.deploymentId);

      await runD1(
        db,
        `
          UPDATE deployments
          SET lti_profile_override = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [ltiProfileOverride, existing.id],
      );

      return await requireDeploymentById(db, existing.id);
    },
  };
}

const D1_DEPLOYMENT_SELECT = `
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

interface D1DeploymentRow extends Record<string, unknown> {
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

interface D1LanternSettingsRow extends Record<string, unknown> {
  defaultLtiProfile: unknown;
  updatedAt: unknown;
}

async function getDeploymentByField(
  db: D1Database,
  whereClause: string,
  parameters: readonly unknown[],
) {
  const row = await queryD1First<D1DeploymentRow>(
    db,
    `${D1_DEPLOYMENT_SELECT} WHERE ${whereClause}`,
    parameters,
  );

  return row === null ? null : mapD1DeploymentRow(row);
}

async function requireDeploymentBySlug(db: D1Database, slug: string) {
  const deployment = await getDeploymentByField(db, 'deployments.slug = ?', [slug]);

  if (deployment === null) {
    throw new Error(`Expected deployment ${slug} after D1 write.`);
  }

  return deployment;
}

async function requireDeploymentById(db: D1Database, id: number) {
  const deployment = await getDeploymentByField(db, 'deployments.id = ?', [id]);

  if (deployment === null) {
    throw new Error(`Deployment id ${id} was not found.`);
  }

  return deployment;
}

async function rejectMismatchedCanvasDeployment(
  db: D1Database,
  input: {
    issuer: string;
    clientId: string | null;
    deploymentId: string;
  },
): Promise<void> {
  const canvasRows = await queryD1Objects<D1DeploymentRow>(
    db,
    `
      ${D1_DEPLOYMENT_SELECT}
      WHERE deployments.lms_type = 'canvas'
        AND deployments.issuer = ?
        AND deployments.client_id = ?
      ORDER BY deployments.id ASC
    `,
    [input.issuer, input.clientId],
  );
  const savedCanvas = canvasRows[0] ? mapD1DeploymentFields(canvasRows[0]) : null;

  if (
    canvasRows.length === 1 &&
    savedCanvas !== null &&
    savedCanvas.deploymentId !== null &&
    savedCanvas.deploymentId !== input.deploymentId
  ) {
    throw new Error(
      `Canvas sent deployment ${input.deploymentId} for issuer ${input.issuer} and client ${input.clientId}, but Lantern saved deployment ${savedCanvas.deploymentId}. Update the saved Canvas binding or relaunch from the correct Canvas placement.`,
    );
  }
}

async function assertDeploymentSlotAvailable(
  db: D1Database,
  slug: string,
  appId: string,
  lmsType: DeploymentRow['lmsType'],
): Promise<void> {
  await requireCompatibleDeploymentSlot(db, slug, appId, lmsType);

  const existingAppSlot = await getDeploymentByField(
    db,
    `
      deployments.app_id = ?
      AND deployments.lms_type = ?
      AND deployments.slug <> ?
    `,
    [appId, lmsType, slug],
  );

  if (existingAppSlot !== null) {
    throw new Error(`App ${appId} already has a ${lmsType} deployment.`);
  }
}

async function requireCompatibleDeploymentSlot(
  db: D1Database,
  slug: string,
  appId: string,
  lmsType: DeploymentRow['lmsType'],
) {
  const existing = await getDeploymentByField(db, 'deployments.slug = ?', [slug]);

  if (existing !== null && existing.appId !== appId) {
    throw new Error(`Deployment ${slug} belongs to app ${existing.appId}.`);
  }

  if (existing !== null && existing.lmsType !== lmsType) {
    throw new Error(
      `Deployment ${slug} is already reserved as ${existing.lmsType} and cannot change to ${lmsType}.`,
    );
  }

  return existing;
}

async function assertBindingAvailable(
  db: D1Database,
  input: {
    slug: string;
    lmsType: DeploymentRow['lmsType'];
    issuer: string;
    clientId: string;
    deploymentId: string;
  },
): Promise<void> {
  const conflictingBinding = await getDeploymentByField(
    db,
    `
      deployments.lms_type = ?
      AND deployments.issuer = ?
      AND deployments.client_id = ?
      AND deployments.deployment_id = ?
      AND deployments.slug <> ?
    `,
    [input.lmsType, input.issuer, input.clientId, input.deploymentId, input.slug],
  );

  if (conflictingBinding !== null) {
    throw new Error(
      `${
        formatBindingLabel(
          input.lmsType,
        )
      } ${input.clientId} / ${input.deploymentId} already belongs to another deployment.`,
    );
  }
}

async function assertPendingCanvasRegistrationAvailable(
  db: D1Database,
  input: {
    slug: string;
    issuer: string;
    clientId: string;
  },
): Promise<void> {
  const conflictingPendingRegistration = await getDeploymentByField(
    db,
    `
      deployments.lms_type = 'canvas'
      AND deployments.issuer = ?
      AND deployments.client_id = ?
      AND deployments.deployment_id IS NULL
      AND deployments.slug <> ?
    `,
    [input.issuer, input.clientId, input.slug],
  );

  if (conflictingPendingRegistration !== null) {
    throw new Error(
      `Canvas registration ${input.clientId} is already reserved for another deployment.`,
    );
  }
}

async function ensureLanternLtiProfileSettings(
  db: D1Database,
): Promise<LanternLtiProfileSettingsRecord> {
  const existing = await queryD1First<D1LanternSettingsRow>(
    db,
    `
      SELECT
        default_lti_profile AS defaultLtiProfile,
        updated_at AS updatedAt
      FROM lantern_settings
      WHERE singleton = 1
    `,
  );

  if (existing !== null) {
    return mapD1LanternLtiProfileSettingsRow(existing);
  }

  await runD1(
    db,
    `
      INSERT INTO lantern_settings (
        singleton,
        default_lti_profile
      ) VALUES (1, ?)
      ON CONFLICT (singleton) DO NOTHING
    `,
    [DEFAULT_LTI_PROFILE_ID],
  );

  return await ensureLanternLtiProfileSettings(db);
}

function bindingColumns(
  binding: Parameters<PackageReviewRepository['saveDeploymentBinding']>[0]['binding'],
): {
  canvasEnvironment: DeploymentRow['canvasEnvironment'];
  authorizationEndpoint: DeploymentRow['authorizationEndpoint'];
  accessTokenUrl: DeploymentRow['accessTokenUrl'];
  jwksUrl: DeploymentRow['jwksUrl'];
} {
  switch (binding.lms) {
    case 'canvas':
      return {
        canvasEnvironment: binding.canvasEnvironment,
        authorizationEndpoint: null,
        accessTokenUrl: null,
        jwksUrl: null,
      };
    case 'moodle':
    case 'sakai':
      return {
        canvasEnvironment: null,
        authorizationEndpoint: binding.authorizationEndpoint,
        accessTokenUrl: binding.accessTokenUrl,
        jwksUrl: binding.jwksUrl,
      };
  }
}

function mapD1DeploymentRow(row: D1DeploymentRow) {
  return mapDeploymentRow(mapD1DeploymentFields(row));
}

function mapD1DeploymentFields(row: D1DeploymentRow): DeploymentRow {
  return {
    id: expectNumber(row.id, 'id'),
    slug: expectString(row.slug, 'slug'),
    label: expectString(row.label, 'label'),
    appId: expectString(row.appId, 'appId'),
    enabledPackageVersionId: expectNullableNumber(
      row.enabledPackageVersionId,
      'enabledPackageVersionId',
    ),
    enabledPackageVersion: expectNullableString(row.enabledPackageVersion, 'enabledPackageVersion'),
    lmsType: expectStringLiteral(row.lmsType, 'lmsType', ['canvas', 'moodle', 'sakai', 'preview']),
    canvasEnvironment: expectNullableStringLiteral(row.canvasEnvironment, 'canvasEnvironment', [
      'production',
      'beta',
      'test',
    ]),
    issuer: expectNullableString(row.issuer, 'issuer'),
    clientId: expectNullableString(row.clientId, 'clientId'),
    deploymentId: expectNullableString(row.deploymentId, 'deploymentId'),
    authorizationEndpoint: expectNullableString(row.authorizationEndpoint, 'authorizationEndpoint'),
    accessTokenUrl: expectNullableString(row.accessTokenUrl, 'accessTokenUrl'),
    jwksUrl: expectNullableString(row.jwksUrl, 'jwksUrl'),
    ltiProfileOverride: expectNullableStringLiteral(row.ltiProfileOverride, 'ltiProfileOverride', [
      'certification',
      'governedCompatibility',
    ]),
    updatedAt: expectString(row.updatedAt, 'updatedAt'),
  };
}

function mapD1LanternLtiProfileSettingsRow(
  row: D1LanternSettingsRow,
): LanternLtiProfileSettingsRecord {
  const defaultLtiProfile = expectString(row.defaultLtiProfile, 'defaultLtiProfile');

  return {
    defaultLtiProfile: requireLtiProfileId(
      defaultLtiProfile,
      `Unsupported saved LTI profile ${defaultLtiProfile}.`,
    ),
    updatedAt: normalizeTimestamp(expectString(row.updatedAt, 'updatedAt')),
  };
}

function formatBindingLabel(lms: DeploymentRow['lmsType']): string {
  return `${lms[0]?.toUpperCase() ?? ''}${lms.slice(1)} binding`;
}

function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected D1 deployments.${fieldName} to be text.`);
  }

  return value;
}

function expectNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  return expectString(value, fieldName);
}

function expectNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number') {
    throw new TypeError(`Expected D1 deployments.${fieldName} to be numeric.`);
  }

  return value;
}

function expectNullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  return expectNumber(value, fieldName);
}

function expectStringLiteral<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`Unexpected D1 deployments.${fieldName} value.`);
  }

  return value as T;
}

function expectNullableStringLiteral<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T | null {
  if (value === null) {
    return null;
  }

  return expectStringLiteral(value, fieldName, allowed);
}
