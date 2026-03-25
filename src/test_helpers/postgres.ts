import { Pool } from '@db/postgres';
import { bootstrapPackageReviewSchema, resetPackageReviewTables } from './package_review_schema.ts';

const TEST_POOL_SIZE = 1;

export { bootstrapPackageReviewSchema, resetPackageReviewTables };

export function requireTestDatabaseUrl(): string {
  const databaseUrl = Deno.env.get('DATABASE_URL');

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for Postgres-backed package review tests.');
  }

  return databaseUrl;
}

export function createTestDatabasePool(): Pool {
  return new Pool(requireTestDatabaseUrl(), TEST_POOL_SIZE, true);
}

export async function withPackageReviewTestDatabase<T>(
  run: (pool: Pool) => Promise<T>,
): Promise<T> {
  const pool = createTestDatabasePool();

  try {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    return await run(pool);
  } finally {
    await pool.end();
  }
}
