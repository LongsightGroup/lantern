import { createDatabasePool } from '../src/db/pool.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { installDenoEnvReader, getDenoEnvReader } from '../src/platform/deno_env.ts';
import { createPackageReviewRepository } from '../src/package_review/repository.ts';
import { seedReferencePackages } from './local_seed_support.ts';

installDenoEnvReader();

if (import.meta.main) {
  const env = getDenoEnvReader();
  const pool = createDatabasePool(env);
  const repository = createPackageReviewRepository(pool);

  try {
    const appliedMigrations = await runMigrations(pool);
    const summary = await seedReferencePackages({
      repository,
      env,
    });

    console.log(`Applied ${appliedMigrations} migration(s) before seeding.`);
    console.log(`Reference packages ready: ${summary.packageIds.join(', ')}`);
    console.log(
      `Imported ${summary.importedCount}, reused ${summary.reusedSnapshotCount} stored snapshots, found ${summary.existingCount} existing package rows, approved ${summary.approvedCount}.`,
    );
    console.log('');
    console.log('Next:');
    console.log('1. Run `deno task local:start`.');
    console.log('2. Open http://localhost:8417/admin/packages.');
    console.log('3. Start with Template App, Web Checkup, or Office Hours Web Lab.');
  } finally {
    await pool.end();
  }
}
