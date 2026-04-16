import type { Pool } from '@db/postgres';
import type { PackageReviewRepository } from './repository.ts';
import type { PackageVersionRecord } from './types.ts';
import { withClient, withTransaction } from './repository_core.ts';
import { mapOptionalPackageVersion } from './repository_mappers_package.ts';
import { PACKAGE_VERSION_SELECT } from './repository_query_fragments.ts';
import type {
  AuthoringDraftFileRow,
  AuthoringDraftRow,
  PackageVersionRow,
} from './repository_row_types.ts';
import {
  isUniqueViolation,
  normalizeOptionalTimestamp,
  normalizeTimestamp,
} from './repository_value_support.ts';

type BrowserAutograderContract = {
  kind: 'browser_autograder';
  paths: string[];
};

export function createAuthoringRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  | 'createAuthoringDraftFromPackageVersion'
  | 'getAuthoringDraftById'
  | 'saveAuthoringDraftFiles'
  | 'markAuthoringDraftPreviewed'
> {
  return {
    async createAuthoringDraftFromPackageVersion(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          'create_authoring_draft_from_package_version',
          async (transaction) => {
            const packageVersionRow = await lockPackageVersionRow(
              transaction,
              input.packageVersionId,
            );
            const packageVersion = mapOptionalPackageVersion(packageVersionRow);

            if (!packageVersion) {
              throw new Error(`Package version id ${input.packageVersionId} was not found.`);
            }

            const contract = requireBrowserAutograderContract(packageVersion);
            const existing = await queryAuthoringDraftRowByPackageVersionId(
              transaction,
              input.packageVersionId,
            );

            if (existing) {
              return await hydrateAuthoringDraft(transaction, existing);
            }

            try {
              const inserted = await transaction.queryObject<AuthoringDraftRow>({
                text: `
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
                  ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7::jsonb, $8, NULL, '[]'::jsonb, 'manual', NULL, $9, $9
                  )
                  RETURNING
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
                `,
                args: [
                  input.draftId,
                  packageVersion.id,
                  packageVersion.appId,
                  packageVersion.version,
                  packageVersion.title,
                  contract.kind,
                  JSON.stringify(contract.paths),
                  packageVersion.artifact.snapshotRoot,
                  input.createdAt,
                ],
                camelCase: true,
              });

              return await hydrateAuthoringDraft(transaction, inserted.rows[0]);
            } catch (error) {
              if (isUniqueViolation(error)) {
                const existingAfterConflict = await queryAuthoringDraftRowByPackageVersionId(
                  transaction,
                  input.packageVersionId,
                );

                if (existingAfterConflict) {
                  return await hydrateAuthoringDraft(transaction, existingAfterConflict);
                }
              }

              throw error;
            }
          },
        );
      });
    },

    async getAuthoringDraftById(draftId) {
      return await withClient(pool, async (client) => {
        const row = await queryAuthoringDraftRowById(client, draftId);

        return row ? await hydrateAuthoringDraft(client, row) : null;
      });
    },

    async saveAuthoringDraftFiles(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(client, 'save_authoring_draft_files', async (transaction) => {
          const row = await queryAuthoringDraftRowById(transaction, input.draftId, true);

          if (!row) {
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
            await transaction.queryArray(
              `
                  INSERT INTO authoring_draft_files (
                    draft_id,
                    relative_path,
                    contents,
                    sequence
                  ) VALUES ($1, $2, $3, $4)
                  ON CONFLICT (draft_id, relative_path)
                  DO UPDATE SET
                    contents = EXCLUDED.contents,
                    sequence = EXCLUDED.sequence
                `,
              [input.draftId, file.relativePath, file.contents, file.sequence],
            );
          }

          const updated = await transaction.queryObject<AuthoringDraftRow>({
            text: `
                UPDATE authoring_drafts
                SET
                  latest_prompt_text = $1,
                  latest_generation_notes = $2::jsonb,
                  saved_source = $3,
                  updated_at = $4
                WHERE draft_id = $5
                RETURNING
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
              `,
            args: [
              input.latestPromptText,
              JSON.stringify(input.latestGenerationNotes),
              input.savedSource,
              input.updatedAt,
              input.draftId,
            ],
            camelCase: true,
          });

          return await hydrateAuthoringDraft(transaction, updated.rows[0]);
        });
      });
    },

    async markAuthoringDraftPreviewed(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          'mark_authoring_draft_previewed',
          async (transaction) => {
            const updated = await transaction.queryObject<AuthoringDraftRow>({
              text: `
                UPDATE authoring_drafts
                SET
                  last_previewed_at = $1,
                  updated_at = $1
                WHERE draft_id = $2
                RETURNING
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
              `,
              args: [input.previewedAt, input.draftId],
              camelCase: true,
            });
            const row = updated.rows[0];

            if (!row) {
              throw new Error(`Authoring draft ${input.draftId} was not found.`);
            }

            return await hydrateAuthoringDraft(transaction, row);
          },
        );
      });
    },
  };
}

export function normalizeAuthoringDraftPath(path: string): string {
  const trimmed = path.trim();

  if (trimmed === '') {
    throw new Error('Authoring draft file paths cannot be blank.');
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function readBrowserAutograderContract(
  manifestJson: Record<string, unknown>,
): BrowserAutograderContract {
  const authoring = requireRecord(
    manifestJson.authoring,
    'Lantern authoring requires manifest.authoring for browser autograder packages.',
  );
  const kind = requireString(authoring.kind, 'Lantern authoring requires manifest.authoring.kind.');

  if (kind !== 'browser_autograder') {
    throw new Error(
      `Lantern authoring requires manifest.authoring.kind = "browser_autograder". Found ${kind}.`,
    );
  }

  const graderSpecFiles = requireStringArray(
    authoring.grader_spec_files,
    'Lantern authoring requires manifest.authoring.grader_spec_files.',
  ).map(normalizeAuthoringDraftPath);
  const evidenceExampleFile = normalizeAuthoringDraftPath(
    requireString(
      authoring.evidence_example_file,
      'Lantern authoring requires manifest.authoring.evidence_example_file.',
    ),
  );

  return {
    kind,
    paths: [...new Set([...graderSpecFiles, evidenceExampleFile])],
  };
}

function requireBrowserAutograderContract(
  packageVersion: PackageVersionRecord,
): BrowserAutograderContract {
  if (packageVersion.approvalStatus !== 'approved') {
    throw new Error(
      `Authoring draft requires an approved package version. Found ${packageVersion.appId}@${packageVersion.version} in ${packageVersion.approvalStatus} state.`,
    );
  }

  return readBrowserAutograderContract(packageVersion.manifestJson);
}

async function lockPackageVersionRow(
  transaction: {
    queryObject<T>(input: {
      text: string;
      args?: unknown[];
      camelCase?: boolean;
    }): Promise<{ rows: T[] }>;
  },
  packageVersionId: number,
): Promise<PackageVersionRow | undefined> {
  const result = await transaction.queryObject<PackageVersionRow>({
    text: `
      ${PACKAGE_VERSION_SELECT}
      WHERE id = $1
      FOR UPDATE
    `,
    args: [packageVersionId],
    camelCase: true,
  });

  return result.rows[0];
}

async function queryAuthoringDraftRowByPackageVersionId(
  client: {
    queryObject<T>(input: {
      text: string;
      args?: unknown[];
      camelCase?: boolean;
    }): Promise<{ rows: T[] }>;
  },
  packageVersionId: number,
): Promise<AuthoringDraftRow | undefined> {
  const result = await client.queryObject<AuthoringDraftRow>({
    text: `
      SELECT
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
      FROM authoring_drafts
      WHERE package_version_id = $1
    `,
    args: [packageVersionId],
    camelCase: true,
  });

  return result.rows[0];
}

async function queryAuthoringDraftRowById(
  client: {
    queryObject<T>(input: {
      text: string;
      args?: unknown[];
      camelCase?: boolean;
    }): Promise<{ rows: T[] }>;
  },
  draftId: string,
  forUpdate = false,
): Promise<AuthoringDraftRow | undefined> {
  const result = await client.queryObject<AuthoringDraftRow>({
    text: `
      SELECT
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
      FROM authoring_drafts
      WHERE draft_id = $1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    args: [draftId],
    camelCase: true,
  });

  return result.rows[0];
}

async function queryAuthoringDraftFiles(
  client: {
    queryObject<T>(input: {
      text: string;
      args?: unknown[];
      camelCase?: boolean;
    }): Promise<{ rows: T[] }>;
  },
  draftId: string,
): Promise<AuthoringDraftFileRow[]> {
  const result = await client.queryObject<AuthoringDraftFileRow>({
    text: `
      SELECT
        draft_id,
        relative_path,
        contents,
        sequence
      FROM authoring_draft_files
      WHERE draft_id = $1
      ORDER BY sequence ASC, relative_path ASC
    `,
    args: [draftId],
    camelCase: true,
  });

  return result.rows;
}

async function hydrateAuthoringDraft(
  client: {
    queryObject<T>(input: {
      text: string;
      args?: unknown[];
      camelCase?: boolean;
    }): Promise<{ rows: T[] }>;
  },
  row: AuthoringDraftRow | undefined,
) {
  if (!row) {
    throw new Error('Expected an authoring draft row.');
  }

  const files = await queryAuthoringDraftFiles(client, row.draftId);

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

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be a string array.`);
  }

  return value.map((item) => requireString(item, `${field} entries must be strings.`));
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(message);
  }

  return value.trim();
}

function requireStringArray(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(message);
  }

  return value.map((item) => requireString(item, message));
}
