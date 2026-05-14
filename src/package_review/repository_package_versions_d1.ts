import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects, runD1 } from '../db/d1.ts';
import type { ImportedPackageVersion } from './intake.ts';
import { mapOptionalPackageVersion, mapPackageVersionRow } from './repository_mappers_package.ts';
import type { PackageVersionRow } from './repository_row_types.ts';
import { sortPackageVersions } from './repository_resource_options.ts';
import type { PackageReviewRepository } from './repository.ts';
import { createD1AuthoringRepositoryMethods } from './repository_authoring_d1.ts';
import { createD1DeepLinkingRepositoryMethods } from './repository_deep_linking_d1.ts';
import { createD1DeploymentRepositoryMethods } from './repository_deployments_d1.ts';
import { createD1GradingRepositoryMethods } from './repository_grading_d1.ts';
import { createD1LaunchStateRepositoryMethods } from './repository_launch_state_d1.ts';
import { createD1PreviewRepositoryMethods } from './repository_preview_d1.ts';

export function createD1PackageReviewRepository(db: D1Database): PackageReviewRepository {
  const portedMethods = {
    ...createD1PackageVersionRepositoryMethods(db),
    ...createD1DeploymentRepositoryMethods(db),
    ...createD1LaunchStateRepositoryMethods(db),
    ...createD1GradingRepositoryMethods(db),
    ...createD1DeepLinkingRepositoryMethods(db),
    ...createD1PreviewRepositoryMethods(db),
    ...createD1AuthoringRepositoryMethods(db),
  };

  return new Proxy(portedMethods, {
    get(target, property, receiver) {
      if (property === Symbol.toStringTag) {
        return 'D1PackageReviewRepository';
      }

      if (property in target) {
        return Reflect.get(target, property, receiver);
      }

      return () => {
        throw new Error(
          `D1 repository method ${String(
            property,
          )} is not ported yet. Continue the Cloudflare D1 repository migration before using this route on Workers.`,
        );
      };
    },
  }) as PackageReviewRepository;
}

export function createD1PackageVersionRepositoryMethods(
  db: D1Database,
): Pick<
  PackageReviewRepository,
  | 'registerPackageVersion'
  | 'listPackageVersions'
  | 'listPackageVersionsByApp'
  | 'getPackageVersionById'
  | 'getPackageVersionByAppVersion'
  | 'approvePackageVersion'
  | 'rejectPackageVersion'
> {
  return {
    async registerPackageVersion(input: ImportedPackageVersion) {
      try {
        await runD1(
          db,
          `
            INSERT INTO package_versions (
              app_id,
              version,
              title,
              description,
              owner_type,
              owner_id,
              entrypoint,
              roles,
              install_scope,
              capabilities,
              grading_mode,
              grading_rubric_file,
              grading_max_score,
              approval_status,
              review_notes,
              accessibility_review,
              reviewed_at,
              validation_issues,
              manifest_json,
              artifact_root,
              artifact_digest,
              runtime_contract,
              runtime_contract_signature
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?, ?, ?, ?, ?
            )
          `,
          [
            input.reviewData.appId,
            input.reviewData.version,
            input.reviewData.title,
            input.reviewData.description,
            input.reviewData.owner.type,
            input.reviewData.owner.id,
            input.reviewData.entrypoint,
            input.reviewData.roles,
            input.reviewData.installScope,
            input.reviewData.capabilities,
            input.reviewData.grading.mode,
            input.reviewData.grading.rubricFile,
            input.reviewData.grading.maxScore,
            input.reviewData.validationIssues,
            input.reviewData.manifestJson,
            input.artifact.snapshotRoot,
            input.artifact.digest,
            input.runtimeContract,
            input.runtimeContractSignature,
          ],
        );
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          throw new Error(
            `Package version ${input.reviewData.appId}@${input.reviewData.version} already exists and cannot be replaced.`,
          );
        }

        throw error;
      }

      return await getRequiredPackageVersionByAppVersion(
        db,
        input.reviewData.appId,
        input.reviewData.version,
      );
    },

    async listPackageVersions() {
      const rows = await queryD1Objects<D1PackageVersionRow>(
        db,
        `${D1_PACKAGE_VERSION_SELECT} ORDER BY app_id ASC, imported_at DESC`,
      );

      return sortPackageVersions(rows.map(mapD1PackageVersionRow));
    },

    async listPackageVersionsByApp(appId) {
      const rows = await queryD1Objects<D1PackageVersionRow>(
        db,
        `${D1_PACKAGE_VERSION_SELECT} WHERE app_id = ?`,
        [appId],
      );

      return sortPackageVersions(rows.map(mapD1PackageVersionRow));
    },

    async getPackageVersionById(id) {
      const row = await queryD1First<D1PackageVersionRow>(
        db,
        `${D1_PACKAGE_VERSION_SELECT} WHERE id = ?`,
        [id],
      );

      return mapOptionalPackageVersion(row === null ? undefined : mapD1PackageVersionFields(row));
    },

    async getPackageVersionByAppVersion(appId, version) {
      const row = await queryD1First<D1PackageVersionRow>(
        db,
        `${D1_PACKAGE_VERSION_SELECT} WHERE app_id = ? AND version = ?`,
        [appId, version],
      );

      return mapOptionalPackageVersion(row === null ? undefined : mapD1PackageVersionFields(row));
    },

    async approvePackageVersion(input) {
      return await reviewD1PackageVersion(
        db,
        input.id,
        'approved',
        input.reviewNotes,
        input.accessibilityReview,
      );
    },

    async rejectPackageVersion(input) {
      return await reviewD1PackageVersion(
        db,
        input.id,
        'rejected',
        input.reviewNotes,
        input.accessibilityReview,
      );
    },
  };
}

export const D1_PACKAGE_VERSION_SELECT = `
  SELECT
    id,
    app_id AS appId,
    version,
    title,
    description,
    owner_type AS ownerType,
    owner_id AS ownerId,
    entrypoint,
    roles,
    install_scope AS installScope,
    capabilities,
    grading_mode AS gradingMode,
    grading_rubric_file AS gradingRubricFile,
    grading_max_score AS gradingMaxScore,
    approval_status AS approvalStatus,
    review_notes AS reviewNotes,
    accessibility_review AS accessibilityReview,
    reviewed_at AS reviewedAt,
    validation_issues AS validationIssues,
    manifest_json AS manifestJson,
    artifact_root AS artifactRoot,
    artifact_digest AS artifactDigest,
    runtime_contract AS runtimeContract,
    runtime_contract_signature AS runtimeContractSignature,
    imported_at AS importedAt
  FROM package_versions
`;

export interface D1PackageVersionRow extends Record<string, unknown> {
  id: unknown;
  appId: unknown;
  version: unknown;
  title: unknown;
  description: unknown;
  ownerType: unknown;
  ownerId: unknown;
  entrypoint: unknown;
  roles: unknown;
  installScope: unknown;
  capabilities: unknown;
  gradingMode: unknown;
  gradingRubricFile: unknown;
  gradingMaxScore: unknown;
  approvalStatus: unknown;
  reviewNotes: unknown;
  accessibilityReview: unknown;
  reviewedAt: unknown;
  validationIssues: unknown;
  manifestJson: unknown;
  artifactRoot: unknown;
  artifactDigest: unknown;
  runtimeContract: unknown;
  runtimeContractSignature: unknown;
  importedAt: unknown;
}

async function getRequiredPackageVersionByAppVersion(
  db: D1Database,
  appId: string,
  version: string,
) {
  const row = await queryD1First<D1PackageVersionRow>(
    db,
    `${D1_PACKAGE_VERSION_SELECT} WHERE app_id = ? AND version = ?`,
    [appId, version],
  );

  if (row === null) {
    throw new Error(`Expected package version ${appId}@${version} after D1 write.`);
  }

  return mapD1PackageVersionRow(row);
}

async function reviewD1PackageVersion(
  db: D1Database,
  id: number,
  approvalStatus: 'approved' | 'rejected',
  reviewNotes: string | null,
  accessibilityReview: PackageVersionRow['accessibilityReview'],
) {
  await runD1(
    db,
    `
      UPDATE package_versions
      SET approval_status = ?,
          review_notes = ?,
          accessibility_review = ?,
          reviewed_at = ?
      WHERE id = ?
    `,
    [approvalStatus, reviewNotes, accessibilityReview, new Date().toISOString(), id],
  );

  const row = await queryD1First<D1PackageVersionRow>(
    db,
    `${D1_PACKAGE_VERSION_SELECT} WHERE id = ?`,
    [id],
  );

  if (row === null) {
    throw new Error(`Expected package version ${id} after D1 review update.`);
  }

  return mapD1PackageVersionRow(row);
}

export function mapD1PackageVersionRow(row: D1PackageVersionRow) {
  return mapPackageVersionRow(mapD1PackageVersionFields(row));
}

function mapD1PackageVersionFields(row: D1PackageVersionRow): PackageVersionRow {
  return {
    id: expectNumber(row.id, 'id'),
    appId: expectString(row.appId, 'appId'),
    version: expectString(row.version, 'version'),
    title: expectString(row.title, 'title'),
    description: expectNullableString(row.description, 'description'),
    ownerType: expectStringLiteral(row.ownerType, 'ownerType', ['user']),
    ownerId: expectString(row.ownerId, 'ownerId'),
    entrypoint: expectString(row.entrypoint, 'entrypoint'),
    roles: parseJsonField(row.roles, 'roles') as PackageVersionRow['roles'],
    installScope: expectStringLiteral(row.installScope, 'installScope', ['course', 'assignment']),
    capabilities: parseJsonField(
      row.capabilities,
      'capabilities',
    ) as PackageVersionRow['capabilities'],
    gradingMode: expectStringLiteral(row.gradingMode, 'gradingMode', [
      'declarative',
      'manual',
      'completion',
      'browser',
    ]),
    gradingRubricFile: expectNullableString(row.gradingRubricFile, 'gradingRubricFile'),
    gradingMaxScore: expectNullableNumber(row.gradingMaxScore, 'gradingMaxScore'),
    approvalStatus: expectStringLiteral(row.approvalStatus, 'approvalStatus', [
      'pending',
      'approved',
      'rejected',
    ]),
    reviewNotes: expectNullableString(row.reviewNotes, 'reviewNotes'),
    accessibilityReview: parseNullableJsonField(
      row.accessibilityReview,
      'accessibilityReview',
    ) as PackageVersionRow['accessibilityReview'],
    reviewedAt: expectNullableString(row.reviewedAt, 'reviewedAt'),
    validationIssues: parseJsonField(
      row.validationIssues,
      'validationIssues',
    ) as PackageVersionRow['validationIssues'],
    manifestJson: parseJsonField(
      row.manifestJson,
      'manifestJson',
    ) as PackageVersionRow['manifestJson'],
    artifactRoot: expectString(row.artifactRoot, 'artifactRoot'),
    artifactDigest: expectString(row.artifactDigest, 'artifactDigest'),
    runtimeContract: parseNullableJsonField(
      row.runtimeContract,
      'runtimeContract',
    ) as PackageVersionRow['runtimeContract'],
    runtimeContractSignature: expectNullableString(
      row.runtimeContractSignature,
      'runtimeContractSignature',
    ),
    importedAt: expectString(row.importedAt, 'importedAt'),
  };
}

function isD1UniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

function parseJsonField(value: unknown, fieldName: string): unknown {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected D1 package_versions.${fieldName} to be JSON text.`);
  }

  return JSON.parse(value);
}

function parseNullableJsonField(value: unknown, fieldName: string): unknown | null {
  if (value === null) {
    return null;
  }

  return parseJsonField(value, fieldName);
}

function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected D1 package_versions.${fieldName} to be text.`);
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
    throw new TypeError(`Expected D1 package_versions.${fieldName} to be numeric.`);
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
    throw new Error(`Unexpected D1 package_versions.${fieldName} value.`);
  }

  return value as T;
}
