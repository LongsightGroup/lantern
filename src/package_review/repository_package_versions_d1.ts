import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects, runD1, runD1Batch } from '../db/d1.ts';
import {
  expectD1JsonRecord,
  expectD1NullableNumber,
  expectD1NullableString,
  expectD1Number,
  expectD1String,
  expectD1StringArray,
  expectD1StringLiteral,
  parseD1JsonField,
  parseD1NullableJsonField,
} from '../db/d1_row.ts';
import type { Capability, UserRole } from '../../sdk/app-sdk.ts';
import type { ImportedPackageVersion } from './intake.ts';
import { mapOptionalPackageVersion, mapPackageVersionRow } from './repository_mappers_package.ts';
import type { PackageVersionRow } from './repository_row_types.ts';
import { sortPackageVersions } from './repository_resource_options.ts';
import type { PackageReviewRepository } from './repository.ts';
import type {
  AccessibilityReview,
  AccessibilityReviewStatus,
  ReviewedRuntimeContract,
  ValidationIssue,
} from './types.ts';
import { createD1AuthoringRepositoryMethods } from './repository_authoring_d1.ts';
import { createD1ActivityRepositoryMethods } from './repository_activity_d1.ts';
import { createD1LaunchStateRepositoryMethods } from './repository_launch_state_d1.ts';
import { createD1PreviewRepositoryMethods } from './repository_preview_d1.ts';
import { createD1AppGenerationRepositoryMethods } from '../app_writer/repository_d1.ts';

export function createD1PackageReviewRepository(db: D1Database): PackageReviewRepository {
  const portedMethods: PackageReviewRepository = {
    ...createD1PackageVersionRepositoryMethods(db),
    ...createD1LaunchStateRepositoryMethods(db),
    ...createD1ActivityRepositoryMethods(db),
    ...createD1PreviewRepositoryMethods(db),
    ...createD1AuthoringRepositoryMethods(db),
    ...createD1AppGenerationRepositoryMethods(db),
  };

  return portedMethods;
}

export function createD1PackageVersionRepositoryMethods(
  db: D1Database,
): Pick<
  PackageReviewRepository,
  | 'registerPackageVersion'
  | 'registerPythonLabTrialPackageVersion'
  | 'listPackageVersions'
  | 'listPackageVersionsByApp'
  | 'deletePythonLabPackageVersion'
  | 'getPackageVersionById'
  | 'getPackageVersionByAppVersion'
  | 'approvePackageVersion'
  | 'rejectPackageVersion'
> {
  return {
    registerPackageVersion(input) {
      return registerD1PackageVersion(db, input, 'catalog');
    },

    registerPythonLabTrialPackageVersion(input) {
      return registerD1PackageVersion(db, input, 'python_lab_trial');
    },

    async listPackageVersions() {
      const rows = await queryD1Objects<D1PackageVersionRow>(
        db,
        `${D1_PACKAGE_VERSION_SELECT} WHERE catalog_visibility = 'catalog' ORDER BY app_id ASC, imported_at DESC`,
      );

      return sortPackageVersions(rows.map(mapD1PackageVersionRow));
    },

    async listPackageVersionsByApp(appId) {
      const rows = await queryD1Objects<D1PackageVersionRow>(
        db,
        `${D1_PACKAGE_VERSION_SELECT} WHERE app_id = ? AND catalog_visibility = 'catalog'`,
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

    async deletePythonLabPackageVersion(id) {
      const packageVersion = await queryD1First<D1PackageVersionRow>(
        db,
        `${D1_PACKAGE_VERSION_SELECT} WHERE id = ?`,
        [id],
      );

      if (packageVersion === null) {
        return;
      }

      if (packageVersion.catalogVisibility !== 'python_lab_trial') {
        throw new Error(`Package version ${id} is not a Python Lab trial package.`);
      }

      const installation = await queryD1First<Record<string, unknown>>(
        db,
        `SELECT id FROM app_installations
         WHERE package_version_id = ? LIMIT 1`,
        [id],
      );

      if (installation !== null) {
        throw new Error(`Python Lab package version ${id} is unexpectedly installed.`);
      }

      await runD1Batch(db, [{
        sql: `DELETE FROM package_versions
            WHERE id = ? AND catalog_visibility = 'python_lab_trial'`,
        parameters: [id],
      }]);
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

async function registerD1PackageVersion(
  db: D1Database,
  input: ImportedPackageVersion,
  catalogVisibility: 'catalog' | 'python_lab_trial',
) {
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
          sandbox_grading_enabled,
          catalog_visibility,
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
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `,
      [
        input.reviewData.appId,
        input.reviewData.version,
        input.reviewData.title,
        input.reviewData.description,
        input.reviewData.owner.type,
        input.reviewData.owner.id,
        input.reviewData.runtime.entrypoint,
        input.reviewData.roles,
        input.reviewData.installScope,
        input.reviewData.capabilities,
        storedGradingMode(input.reviewData.grading.mode),
        input.reviewData.grading.rubricFile,
        input.reviewData.grading.maxScore,
        input.reviewData.grading.mode === 'sandbox' ? 1 : 0,
        catalogVisibility,
        'pending',
        null,
        null,
        null,
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
    sandbox_grading_enabled AS sandboxGradingEnabled,
    catalog_visibility AS catalogVisibility,
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
  sandboxGradingEnabled: unknown;
  catalogVisibility: unknown;
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
    id: expectD1Number(row.id, 'package_versions.id'),
    appId: expectD1String(row.appId, 'package_versions.appId'),
    version: expectD1String(row.version, 'package_versions.version'),
    title: expectD1String(row.title, 'package_versions.title'),
    description: expectD1NullableString(row.description, 'package_versions.description'),
    ownerType: expectD1StringLiteral(row.ownerType, 'package_versions.ownerType', ['user']),
    ownerId: expectD1String(row.ownerId, 'package_versions.ownerId'),
    entrypoint: expectD1String(row.entrypoint, 'package_versions.entrypoint'),
    roles: parseD1JsonField(row.roles, 'package_versions.roles', parseUserRoleArray),
    installScope: expectD1StringLiteral(row.installScope, 'package_versions.installScope', [
      'course',
      'assignment',
    ]),
    capabilities: parseD1JsonField(
      row.capabilities,
      'package_versions.capabilities',
      parseCapabilityArray,
    ),
    gradingMode: parseEffectiveGradingMode({
      gradingMode: expectD1StringLiteral(row.gradingMode, 'package_versions.gradingMode', [
        'declarative',
        'manual',
        'completion',
        'browser',
        'sandbox',
      ]),
      sandboxGradingEnabled: expectD1Number(
        row.sandboxGradingEnabled,
        'package_versions.sandboxGradingEnabled',
      ),
    }),
    sandboxGradingEnabled: expectD1Number(
      row.sandboxGradingEnabled,
      'package_versions.sandboxGradingEnabled',
    ),
    gradingRubricFile: expectD1NullableString(
      row.gradingRubricFile,
      'package_versions.gradingRubricFile',
    ),
    gradingMaxScore: expectD1NullableNumber(
      row.gradingMaxScore,
      'package_versions.gradingMaxScore',
    ),
    catalogVisibility: expectD1StringLiteral(
      row.catalogVisibility,
      'package_versions.catalogVisibility',
      ['catalog', 'python_lab_trial'],
    ),
    approvalStatus: expectD1StringLiteral(row.approvalStatus, 'package_versions.approvalStatus', [
      'pending',
      'approved',
      'rejected',
    ]),
    reviewNotes: expectD1NullableString(row.reviewNotes, 'package_versions.reviewNotes'),
    accessibilityReview: parseD1NullableJsonField(
      row.accessibilityReview,
      'package_versions.accessibilityReview',
      parseAccessibilityReview,
    ),
    reviewedAt: expectD1NullableString(row.reviewedAt, 'package_versions.reviewedAt'),
    validationIssues: parseD1JsonField(
      row.validationIssues,
      'package_versions.validationIssues',
      parseValidationIssues,
    ),
    manifestJson: parseD1JsonField(
      row.manifestJson,
      'package_versions.manifestJson',
      expectD1JsonRecord,
    ),
    artifactRoot: expectD1String(row.artifactRoot, 'package_versions.artifactRoot'),
    artifactDigest: expectD1String(row.artifactDigest, 'package_versions.artifactDigest'),
    runtimeContract: parseD1NullableJsonField(
      row.runtimeContract,
      'package_versions.runtimeContract',
      parseReviewedRuntimeContract,
    ),
    runtimeContractSignature: expectD1NullableString(
      row.runtimeContractSignature,
      'package_versions.runtimeContractSignature',
    ),
    importedAt: expectD1String(row.importedAt, 'package_versions.importedAt'),
  };
}

function storedGradingMode(
  mode: PackageVersionRow['gradingMode'],
): Exclude<PackageVersionRow['gradingMode'], 'sandbox'> {
  return mode === 'sandbox' ? 'browser' : mode;
}

function parseEffectiveGradingMode(input: {
  readonly gradingMode: PackageVersionRow['gradingMode'];
  readonly sandboxGradingEnabled: number;
}): PackageVersionRow['gradingMode'] {
  if (input.sandboxGradingEnabled === 0) {
    return input.gradingMode;
  }

  if (input.sandboxGradingEnabled === 1 && input.gradingMode === 'browser') {
    return 'sandbox';
  }

  throw new TypeError('package_versions.sandboxGradingEnabled was invalid.');
}

function isD1UniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

function parseUserRoleArray(value: unknown, fieldName: string): UserRole[] {
  return expectD1StringArray(value, fieldName).map((role, index) =>
    expectD1StringLiteral(role, `${fieldName}[${index}]`, ['learner', 'instructor'])
  );
}

function parseCapabilityArray(value: unknown, fieldName: string): Capability[] {
  return expectD1StringArray(value, fieldName).map((capability, index) =>
    expectD1StringLiteral(capability, `${fieldName}[${index}]`, [
      'read_launch_context',
      'read_activity_content',
      'submit_attempt_event',
      'submit_evidence_artifact',
      'finalize_attempt',
      'read_local_state',
      'write_local_state',
      'run_code_submission',
    ])
  );
}

function parseAccessibilityReview(value: unknown, fieldName: string): AccessibilityReview {
  const record = expectD1JsonRecord(value, fieldName);

  return {
    keyboard: parseAccessibilityReviewStatus(record.keyboard, `${fieldName}.keyboard`),
    focusVisible: parseAccessibilityReviewStatus(record.focusVisible, `${fieldName}.focusVisible`),
    focusNotObscured: parseAccessibilityReviewStatus(
      record.focusNotObscured,
      `${fieldName}.focusNotObscured`,
    ),
    structure: parseAccessibilityReviewStatus(record.structure, `${fieldName}.structure`),
    contrast: parseAccessibilityReviewStatus(record.contrast, `${fieldName}.contrast`),
    reducedMotion: parseAccessibilityReviewStatus(
      record.reducedMotion,
      `${fieldName}.reducedMotion`,
    ),
    equivalentAlternatives: parseAccessibilityReviewStatus(
      record.equivalentAlternatives,
      `${fieldName}.equivalentAlternatives`,
    ),
    failureNotes: expectD1NullableString(record.failureNotes, `${fieldName}.failureNotes`),
    exceptionNote: expectD1NullableString(record.exceptionNote, `${fieldName}.exceptionNote`),
  };
}

function parseAccessibilityReviewStatus(
  value: unknown,
  fieldName: string,
): AccessibilityReviewStatus {
  return expectD1StringLiteral(value, fieldName, ['pass', 'fail', 'not_applicable']);
}

function parseValidationIssues(value: unknown, fieldName: string): ValidationIssue[] {
  return expectJsonRecordArray(value, fieldName).map((issue, index) => ({
    field: expectD1String(issue.field, `${fieldName}[${index}].field`),
    message: expectD1String(issue.message, `${fieldName}[${index}].message`),
    keyword: expectD1String(issue.keyword, `${fieldName}[${index}].keyword`),
    severity: expectD1StringLiteral(issue.severity, `${fieldName}[${index}].severity`, ['error']),
  }));
}

function parseReviewedRuntimeContract(
  value: unknown,
  fieldName: string,
): ReviewedRuntimeContract {
  const record = expectD1JsonRecord(value, fieldName);

  return {
    runtimeContractVersion: expectD1StringLiteral(
      record.runtimeContractVersion,
      `${fieldName}.runtimeContractVersion`,
      ['2'],
    ),
    appId: expectD1String(record.appId, `${fieldName}.appId`),
    packageVersion: expectD1String(record.packageVersion, `${fieldName}.packageVersion`),
    artifactDigest: expectD1String(record.artifactDigest, `${fieldName}.artifactDigest`),
    runtime: parseAppRuntime(record.runtime, `${fieldName}.runtime`),
    capabilities: parseCapabilityArray(record.capabilities, `${fieldName}.capabilities`),
  };
}

function parseAppRuntime(
  value: unknown,
  fieldName: string,
): ReviewedRuntimeContract['runtime'] {
  const record = expectD1JsonRecord(value, fieldName);
  const kind = expectD1StringLiteral(record.kind, `${fieldName}.kind`, ['browser', 'worker']);
  return {
    kind,
    entrypoint: expectD1String(record.entrypoint, `${fieldName}.entrypoint`),
  };
}

function expectJsonRecordArray(
  value: unknown,
  fieldName: string,
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected D1 ${fieldName} JSON to be an object array.`);
  }

  return value.map((item, index) => expectD1JsonRecord(item, `${fieldName}[${index}]`));
}
