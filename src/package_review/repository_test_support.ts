import type { Pool } from '@db/postgres';
import { runMigrations } from '../db/migrate.ts';
import { createDatabasePool } from '../db/pool.ts';
import { resetPackageReviewTables } from '../test_helpers/postgres.ts';
import type { ImportedPackageVersion } from './intake.ts';
import { validateManifest } from './manifest.ts';
import { createPackageReviewRepository } from './repository.ts';

const DEMO_SOURCE_ROOT = 'examples/apps/chapter-4-asteroids';

export async function withRepositoryTestDatabase(
  run: (context: {
    pool: Pool;
    repository: ReturnType<typeof createPackageReviewRepository>;
  }) => Promise<void>,
): Promise<void> {
  const pool = createDatabasePool(1);

  try {
    await runMigrations(pool);
    await resetPackageReviewTables(pool);
    await run({ pool, repository: createPackageReviewRepository(pool) });
  } finally {
    await pool.end();
  }
}

export async function buildImportedPackageVersion(
  overrides: {
    appId?: string;
    version?: string;
    title?: string;
    snapshotRoot?: string;
  } = {},
): Promise<ImportedPackageVersion> {
  const validation = await validateManifest({ sourceRoot: DEMO_SOURCE_ROOT });

  if (!validation.ok) {
    throw new Error(
      `Expected demo manifest to validate in repository tests: ${JSON.stringify(
        validation.issues,
      )}`,
    );
  }

  const appId = overrides.appId ?? validation.reviewData.appId;
  const version = overrides.version ?? validation.reviewData.version;
  const title = overrides.title ?? validation.reviewData.title;
  const snapshotRoot = overrides.snapshotRoot ?? `var/packages/${appId}/${version}`;

  return {
    reviewData: {
      ...validation.reviewData,
      appId,
      version,
      title,
      manifestJson: {
        ...validation.reviewData.manifestJson,
        app_id: appId,
        version,
        title,
      },
    },
    artifact: {
      snapshotRoot,
      manifestPath: `${snapshotRoot}/manifest.json`,
      entrypointPath: `${snapshotRoot}${validation.reviewData.entrypoint}`,
      digest: `sha256:${appId}-${version.replaceAll('.', '-')}`,
    },
  };
}
