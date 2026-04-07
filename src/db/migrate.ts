import type { Pool } from '@db/postgres';
import { createDatabasePool } from './pool.ts';
import { getDenoEnvReader } from '../platform/deno_env.ts';

const MIGRATIONS_DIRECTORY = new URL('./migrations/', import.meta.url);

interface MigrationFile {
  name: string;
  sql: string;
}

export async function runMigrations(pool: Pool): Promise<number> {
  const client = await pool.connect();

  try {
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedRows = await client.queryObject<{ filename: string }>({
      text: 'SELECT filename FROM schema_migrations',
      camelCase: true,
    });
    const applied = new Set(appliedRows.rows.map((row) => row.filename));
    const migrations = await loadMigrations();
    let appliedCount = 0;

    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        continue;
      }

      await client.queryArray('BEGIN');

      try {
        await client.queryArray(migration.sql);
        await client.queryArray('INSERT INTO schema_migrations (filename) VALUES ($1)', [
          migration.name,
        ]);
        await client.queryArray('COMMIT');
        appliedCount += 1;
      } catch (error) {
        try {
          await client.queryArray('ROLLBACK');
        } catch {
          // The original migration error is the useful failure.
        }

        throw error;
      }
    }

    return appliedCount;
  } finally {
    client.release();
  }
}

async function loadMigrations(): Promise<MigrationFile[]> {
  const migrations: MigrationFile[] = [];

  for await (const entry of Deno.readDir(MIGRATIONS_DIRECTORY)) {
    if (!entry.isFile || !entry.name.endsWith('.sql')) {
      continue;
    }

    const migrationUrl = new URL(entry.name, MIGRATIONS_DIRECTORY);

    migrations.push({
      name: entry.name,
      sql: await Deno.readTextFile(migrationUrl),
    });
  }

  migrations.sort((left, right) => left.name.localeCompare(right.name));

  return migrations;
}

if (import.meta.main) {
  const pool = createDatabasePool(getDenoEnvReader());

  try {
    const applied = await runMigrations(pool);
    console.log(`Applied ${applied} package review migration(s).`);
  } finally {
    await pool.end();
  }
}
