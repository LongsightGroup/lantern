import type { Pool } from '@db/postgres';
import { PACKAGE_REVIEW_CORE_SCHEMA_STATEMENTS } from './package_review_schema_core.ts';
import {
  PACKAGE_REVIEW_OPS_SCHEMA_STATEMENTS,
  PACKAGE_REVIEW_RESET_SQL,
} from './package_review_schema_ops.ts';

const PACKAGE_REVIEW_SCHEMA_STATEMENTS = [
  ...PACKAGE_REVIEW_CORE_SCHEMA_STATEMENTS,
  ...PACKAGE_REVIEW_OPS_SCHEMA_STATEMENTS,
];

export async function bootstrapPackageReviewSchema(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    for (const statement of PACKAGE_REVIEW_SCHEMA_STATEMENTS) {
      await client.queryArray(statement);
    }
  } finally {
    client.release();
  }
}

export async function resetPackageReviewTables(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.queryArray('BEGIN');
    await client.queryArray(PACKAGE_REVIEW_RESET_SQL);
    await client.queryArray('COMMIT');
  } catch (error) {
    await client.queryArray('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
