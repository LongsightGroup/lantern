import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects, runD1 } from '../db/d1.ts';
import {
  expectD1JsonRecord,
  expectD1NullableString,
  expectD1Number,
  expectD1String,
  expectD1StringLiteral,
  parseD1JsonField,
} from '../db/d1_row.ts';
import {
  normalizeAuthoringDraftPath,
  readBrowserAutograderContract,
} from './repository_authoring_contract.ts';
import type { AuthoringDraftFileRow, AuthoringDraftRow } from './repository_row_types.ts';
import type { PackageReviewRepository } from './repository.ts';
import { normalizeOptionalTimestamp, normalizeTimestamp } from './repository_value_support.ts';
import type { AuthoringDraftRecord } from './types.ts';

export function createD1AuthoringRepositoryMethods(
  db: D1Database,
): Pick<
  PackageReviewRepository,
  | 'createAuthoringDraftFromPackageVersion'
  | 'getAuthoringDraftById'
  | 'saveAuthoringDraftFiles'
  | 'markAuthoringDraftPreviewed'
> {
  return {
    async createAuthoringDraftFromPackageVersion(input) {
      const packageVersion = await requireAuthoringPackageVersion(db, input.packageVersionId);
      const existing = await queryAuthoringDraftRowByPackageVersionId(db, input.packageVersionId);

      if (existing !== null) {
        return await hydrateAuthoringDraft(db, existing);
      }

      const contract = readBrowserAutograderContract(packageVersion.manifestJson);

      try {
        await runD1(
          db,
          `
            INSERT INTO authoring_drafts (
              draft_id,
              package_version_id,
              app_id,
              package_version,
              package_title,
              authoring_kind,
              authoring_paths,
              base_snapshot_root,
              latest_prompt_text,
              latest_generation_notes,
              saved_source,
              last_previewed_at,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'manual', NULL, ?, ?)
          `,
          [
            input.draftId,
            packageVersion.id,
            packageVersion.appId,
            packageVersion.version,
            packageVersion.title,
            contract.kind,
            contract.paths,
            packageVersion.artifactRoot,
            [],
            input.createdAt,
            input.createdAt,
          ],
        );
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          const existingAfterConflict = await queryAuthoringDraftRowByPackageVersionId(
            db,
            input.packageVersionId,
          );

          if (existingAfterConflict !== null) {
            return await hydrateAuthoringDraft(db, existingAfterConflict);
          }
        }

        throw error;
      }

      return await requireAuthoringDraft(db, input.draftId);
    },

    async getAuthoringDraftById(draftId) {
      const row = await queryAuthoringDraftRowById(db, draftId);

      return row === null ? null : await hydrateAuthoringDraft(db, row);
    },

    async saveAuthoringDraftFiles(input) {
      const row = await queryAuthoringDraftRowById(db, input.draftId);

      if (row === null) {
        throw new Error(`Authoring draft ${input.draftId} was not found.`);
      }

      const allowedPaths = new Set(readStringArray(row.authoringPaths, 'authoring_paths'));
      const normalizedFiles = input.files.map((file, index) => ({
        relativePath: normalizeAuthoringDraftPath(file.relativePath),
        contents: file.contents,
        sequence: index + 1,
      }));

      for (const file of normalizedFiles) {
        if (!allowedPaths.has(file.relativePath)) {
          throw new Error(
            `Authoring draft file ${file.relativePath} is outside the approved authoring file set.`,
          );
        }
      }

      for (const file of normalizedFiles) {
        await runD1(
          db,
          `
            INSERT INTO authoring_draft_files (
              draft_id,
              relative_path,
              contents,
              sequence
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT (draft_id, relative_path)
            DO UPDATE SET
              contents = excluded.contents,
              sequence = excluded.sequence
          `,
          [input.draftId, file.relativePath, file.contents, file.sequence],
        );
      }

      await runD1(
        db,
        `
          UPDATE authoring_drafts
          SET
            latest_prompt_text = ?,
            latest_generation_notes = ?,
            saved_source = ?,
            updated_at = ?
          WHERE draft_id = ?
        `,
        [
          input.latestPromptText,
          input.latestGenerationNotes,
          input.savedSource,
          input.updatedAt,
          input.draftId,
        ],
      );

      return await requireAuthoringDraft(db, input.draftId);
    },

    async markAuthoringDraftPreviewed(input) {
      await runD1(
        db,
        `
          UPDATE authoring_drafts
          SET
            last_previewed_at = ?,
            updated_at = ?
          WHERE draft_id = ?
        `,
        [input.previewedAt, input.previewedAt, input.draftId],
      );

      return await requireAuthoringDraft(db, input.draftId);
    },
  };
}

const D1_AUTHORING_DRAFT_SELECT = `
  SELECT
    draft_id AS draftId,
    package_version_id AS packageVersionId,
    app_id AS appId,
    package_version AS packageVersion,
    package_title AS packageTitle,
    authoring_kind AS authoringKind,
    authoring_paths AS authoringPaths,
    base_snapshot_root AS baseSnapshotRoot,
    latest_prompt_text AS latestPromptText,
    latest_generation_notes AS latestGenerationNotes,
    saved_source AS savedSource,
    last_previewed_at AS lastPreviewedAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM authoring_drafts
`;

const D1_AUTHORING_DRAFT_FILE_SELECT = `
  SELECT
    draft_id AS draftId,
    relative_path AS relativePath,
    contents,
    sequence
  FROM authoring_draft_files
`;

interface D1AuthoringPackageVersionRow extends Record<string, unknown> {
  id: unknown;
  appId: unknown;
  version: unknown;
  title: unknown;
  approvalStatus: unknown;
  manifestJson: unknown;
  artifactRoot: unknown;
}

interface D1AuthoringPackageVersion {
  id: number;
  appId: string;
  version: string;
  title: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  manifestJson: Record<string, unknown>;
  artifactRoot: string;
}

interface D1AuthoringDraftRow extends Record<string, unknown> {
  draftId: unknown;
  packageVersionId: unknown;
  appId: unknown;
  packageVersion: unknown;
  packageTitle: unknown;
  authoringKind: unknown;
  authoringPaths: unknown;
  baseSnapshotRoot: unknown;
  latestPromptText: unknown;
  latestGenerationNotes: unknown;
  savedSource: unknown;
  lastPreviewedAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

interface D1AuthoringDraftFileRow extends Record<string, unknown> {
  draftId: unknown;
  relativePath: unknown;
  contents: unknown;
  sequence: unknown;
}

async function requireAuthoringPackageVersion(
  db: D1Database,
  packageVersionId: number,
): Promise<D1AuthoringPackageVersion> {
  const row = await queryD1First<D1AuthoringPackageVersionRow>(
    db,
    `
      SELECT
        id,
        app_id AS appId,
        version,
        title,
        approval_status AS approvalStatus,
        manifest_json AS manifestJson,
        artifact_root AS artifactRoot
      FROM package_versions
      WHERE id = ?
    `,
    [packageVersionId],
  );

  if (row === null) {
    throw new Error(`Package version id ${packageVersionId} was not found.`);
  }

  const packageVersion = {
    id: expectD1Number(row.id, 'id'),
    appId: expectD1String(row.appId, 'appId'),
    version: expectD1String(row.version, 'version'),
    title: expectD1String(row.title, 'title'),
    approvalStatus: expectD1StringLiteral(row.approvalStatus, 'approvalStatus', [
      'pending',
      'approved',
      'rejected',
    ]),
    manifestJson: parseD1JsonField(row.manifestJson, 'manifestJson', expectD1JsonRecord),
    artifactRoot: expectD1String(row.artifactRoot, 'artifactRoot'),
  };

  if (packageVersion.approvalStatus !== 'approved') {
    throw new Error(
      `Authoring draft requires an approved package version. Found ${packageVersion.appId}@${packageVersion.version} in ${packageVersion.approvalStatus} state.`,
    );
  }

  return packageVersion;
}

async function queryAuthoringDraftRowByPackageVersionId(
  db: D1Database,
  packageVersionId: number,
): Promise<AuthoringDraftRow | null> {
  const row = await queryD1First<D1AuthoringDraftRow>(
    db,
    `${D1_AUTHORING_DRAFT_SELECT} WHERE package_version_id = ?`,
    [packageVersionId],
  );

  return row === null ? null : mapD1AuthoringDraftFields(row);
}

async function queryAuthoringDraftRowById(
  db: D1Database,
  draftId: string,
): Promise<AuthoringDraftRow | null> {
  const row = await queryD1First<D1AuthoringDraftRow>(
    db,
    `${D1_AUTHORING_DRAFT_SELECT} WHERE draft_id = ?`,
    [draftId],
  );

  return row === null ? null : mapD1AuthoringDraftFields(row);
}

async function requireAuthoringDraft(db: D1Database, draftId: string) {
  const row = await queryAuthoringDraftRowById(db, draftId);

  if (row === null) {
    throw new Error(`Authoring draft ${draftId} was not found.`);
  }

  return await hydrateAuthoringDraft(db, row);
}

async function queryAuthoringDraftFiles(
  db: D1Database,
  draftId: string,
): Promise<AuthoringDraftFileRow[]> {
  const rows = await queryD1Objects<D1AuthoringDraftFileRow>(
    db,
    `
      ${D1_AUTHORING_DRAFT_FILE_SELECT}
      WHERE draft_id = ?
      ORDER BY sequence ASC, relative_path ASC
    `,
    [draftId],
  );

  return rows.map(mapD1AuthoringDraftFileFields);
}

async function hydrateAuthoringDraft(
  db: D1Database,
  row: AuthoringDraftRow,
): Promise<AuthoringDraftRecord> {
  const files = await queryAuthoringDraftFiles(db, row.draftId);

  return {
    draftId: row.draftId,
    packageVersionId: row.packageVersionId,
    appId: row.appId,
    packageVersion: row.packageVersion,
    packageTitle: row.packageTitle,
    authoringKind: row.authoringKind,
    authoringPaths: readStringArray(row.authoringPaths, 'authoring_paths'),
    baseSnapshotRoot: row.baseSnapshotRoot,
    latestPromptText: row.latestPromptText,
    latestGenerationNotes: readStringArray(row.latestGenerationNotes, 'latest_generation_notes'),
    savedSource: row.savedSource,
    lastPreviewedAt: normalizeOptionalTimestamp(row.lastPreviewedAt),
    createdAt: normalizeTimestamp(row.createdAt),
    updatedAt: normalizeTimestamp(row.updatedAt),
    files: files.map((file) => ({
      draftId: file.draftId,
      relativePath: file.relativePath,
      contents: file.contents,
      sequence: file.sequence,
    })),
  };
}

function mapD1AuthoringDraftFields(row: D1AuthoringDraftRow): AuthoringDraftRow {
  return {
    draftId: expectD1String(row.draftId, 'draftId'),
    packageVersionId: expectD1Number(row.packageVersionId, 'packageVersionId'),
    appId: expectD1String(row.appId, 'appId'),
    packageVersion: expectD1String(row.packageVersion, 'packageVersion'),
    packageTitle: expectD1String(row.packageTitle, 'packageTitle'),
    authoringKind: expectD1StringLiteral(row.authoringKind, 'authoringKind', [
      'browser_autograder',
    ]),
    authoringPaths: parseD1JsonField(row.authoringPaths, 'authoringPaths', readStringArray),
    baseSnapshotRoot: expectD1String(row.baseSnapshotRoot, 'baseSnapshotRoot'),
    latestPromptText: expectD1NullableString(row.latestPromptText, 'latestPromptText'),
    latestGenerationNotes: parseD1JsonField(
      row.latestGenerationNotes,
      'latestGenerationNotes',
      readStringArray,
    ),
    savedSource: expectD1StringLiteral(row.savedSource, 'savedSource', ['manual', 'ai']),
    lastPreviewedAt: expectD1NullableString(row.lastPreviewedAt, 'lastPreviewedAt'),
    createdAt: expectD1String(row.createdAt, 'createdAt'),
    updatedAt: expectD1String(row.updatedAt, 'updatedAt'),
  };
}

function mapD1AuthoringDraftFileFields(row: D1AuthoringDraftFileRow): AuthoringDraftFileRow {
  return {
    draftId: expectD1String(row.draftId, 'draftId'),
    relativePath: expectD1String(row.relativePath, 'relativePath'),
    contents: expectD1String(row.contents, 'contents'),
    sequence: expectD1Number(row.sequence, 'sequence'),
  };
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be a string array.`);
  }

  return value.map((item) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new TypeError(`${field} entries must be strings.`);
    }

    return item.trim();
  });
}

function isD1UniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}
