import type { Pool, PoolClient } from '@db/postgres';
import type { ApprovalStatus, PackageVersionRecord } from './types.ts';
import { mapPackageVersionRow } from './repository_mappers_package.ts';
import type { PackageVersionRow } from './repository_row_types.ts';
import { PACKAGE_VERSION_SELECT } from './repository_query_fragments.ts';

export async function reviewPackageVersion(
  pool: Pool,
  id: number,
  approvalStatus: Exclude<ApprovalStatus, 'pending'>,
  reviewNotes: string | null,
): Promise<PackageVersionRecord> {
  return await withClient(pool, async (client) => {
    return await withTransaction(client, 'review_package_version', async (transaction) => {
      const existingResult = await transaction.queryObject<PackageVersionRow>({
        text: `
          ${PACKAGE_VERSION_SELECT}
          WHERE id = $1
          FOR UPDATE
        `,
        args: [id],
        camelCase: true,
      });
      const existingRow = existingResult.rows[0];

      if (!existingRow) {
        throw new Error(`Package version id ${id} was not found.`);
      }

      if (existingRow.approvalStatus !== 'pending') {
        throw new Error(
          `Package version ${existingRow.appId}@${existingRow.version} has already been reviewed and cannot change state.`,
        );
      }

      const updatedResult = await transaction.queryObject<PackageVersionRow>({
        text: `
          UPDATE package_versions
          SET
            approval_status = $1,
            review_notes = $2,
            reviewed_at = now()
          WHERE id = $3
          RETURNING
            id,
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
            reviewed_at,
            validation_issues,
            manifest_json,
            artifact_root,
            artifact_digest,
            imported_at
        `,
        args: [approvalStatus, reviewNotes, id],
        camelCase: true,
      });

      return mapPackageVersionRow(updatedResult.rows[0]);
    });
  });
}

export async function withClient<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    return await run(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  client: PoolClient,
  name: string,
  run: (transaction: ReturnType<PoolClient['createTransaction']>) => Promise<T>,
): Promise<T> {
  const transaction = client.createTransaction(name, {
    isolation_level: 'serializable',
  });

  await transaction.begin();

  try {
    const result = await run(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // If the driver already closed the transaction, keep the original error.
    }

    throw error;
  }
}
