import { assertEquals } from '@std/assert';
import type { Pool } from '@db/postgres';
import { runMigrations } from '../db/migrate.ts';
import { createTestDatabasePool } from '../test_helpers/postgres.ts';
import { createPackageReviewRepository } from './repository.ts';

const PRE_015_MIGRATIONS = [
  '001_package_review.sql',
  '002_canvas_install.sql',
  '003_lti_login_state.sql',
  '004_gateway_activity_grading_audit.sql',
  '005_operator_control_plane_indexes.sql',
  '006_broker_verification_runs.sql',
  '007_deep_linking_sessions.sql',
  '008_reviewed_placements.sql',
  '009_preview_sessions.sql',
  '010_lms_bindings.sql',
  '011_lti_login_states_multilms.sql',
  '012_preview_deployments.sql',
  '013_broker_verification_scope_profiles.sql',
  '014_generic_line_item_bindings.sql',
] as const;

const DROP_PACKAGE_REVIEW_TABLES_SQL = `
  DROP TABLE IF EXISTS schema_migrations CASCADE;
  DROP TABLE IF EXISTS
    lantern_settings,
    broker_verification_runs,
    audit_events,
    grade_publications,
    line_item_bindings,
    attempt_events,
    attempts,
    preview_evidence,
    preview_sessions,
    reviewed_placements,
    deep_linking_sessions,
    runtime_sessions,
    lti_login_states,
    deployments,
    package_versions
  CASCADE;
`;

Deno.test('migration collapses Moodle and Sakai endpoint columns into the shared platform binding shape', async () => {
  const pool = createTestDatabasePool();

  try {
    await resetToPre015Schema(pool);
    const client = await pool.connect();

    try {
      await client.queryArray(
        `
          INSERT INTO deployments (
            slug,
            label,
            app_id,
            lms_type,
            issuer,
            client_id,
            deployment_id,
            moodle_authentication_request_url,
            moodle_access_token_url,
            moodle_jwks_url
          ) VALUES ($1, $2, $3, 'moodle', $4, $5, $6, $7, $8, $9)
        `,
        [
          'chapter-4-asteroids-moodle',
          'Chapter 4 Asteroids Moodle Deployment',
          'chapter-4-asteroids',
          'https://moodle.example',
          'moodle-client-123',
          'moodle-deployment-123',
          'https://moodle.example/mod/lti/auth.php',
          'https://moodle.example/mod/lti/token.php',
          'https://moodle.example/mod/lti/certs.php',
        ],
      );
      await client.queryArray(
        `
          INSERT INTO deployments (
            slug,
            label,
            app_id,
            lms_type,
            issuer,
            client_id,
            deployment_id,
            sakai_oidc_authentication_url,
            sakai_access_token_url,
            sakai_jwks_url
          ) VALUES ($1, $2, $3, 'sakai', $4, $5, $6, $7, $8, $9)
        `,
        [
          'chapter-4-asteroids-sakai',
          'Chapter 4 Asteroids Sakai Deployment',
          'chapter-4-asteroids',
          'https://sakai.example',
          'sakai-client-123',
          'sakai-deployment-123',
          'https://sakai.example/imsoidc/lti13/oidc_auth',
          'https://sakai.example/imsblis/lti13/token/3',
          'https://sakai.example/imsblis/lti13/keyset',
        ],
      );
    } finally {
      client.release();
    }

    const expectedPendingMigrationCount = await countPendingMigrationsAfter(
      PRE_015_MIGRATIONS.at(-1)!,
    );

    assertEquals(await runMigrations(pool), expectedPendingMigrationCount);
    assertEquals(await runMigrations(pool), 0);

    const repository = createPackageReviewRepository(pool);
    const moodle = await repository.getDeploymentByBinding({
      lms: 'moodle',
      issuer: 'https://moodle.example',
      clientId: 'moodle-client-123',
      deploymentId: 'moodle-deployment-123',
    });
    const sakai = await repository.getDeploymentByBinding({
      lms: 'sakai',
      issuer: 'https://sakai.example',
      clientId: 'sakai-client-123',
      deploymentId: 'sakai-deployment-123',
    });

    assertEquals(moodle?.binding?.lms, 'moodle');
    assertEquals(
      moodle?.binding?.lms === 'moodle' ? moodle.binding.authorizationEndpoint : null,
      'https://moodle.example/mod/lti/auth.php',
    );
    assertEquals(sakai?.binding?.lms, 'sakai');
    assertEquals(
      sakai?.binding?.lms === 'sakai' ? sakai.binding.authorizationEndpoint : null,
      'https://sakai.example/imsoidc/lti13/oidc_auth',
    );
  } finally {
    await pool.end();
  }
});

async function resetToPre015Schema(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.queryArray(DROP_PACKAGE_REVIEW_TABLES_SQL);
    await client.queryArray(`
      CREATE TABLE schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const migrationName of PRE_015_MIGRATIONS) {
      const sql = await Deno.readTextFile(
        new URL(`../db/migrations/${migrationName}`, import.meta.url),
      );

      await client.queryArray(sql);
      await client.queryArray('INSERT INTO schema_migrations (filename) VALUES ($1)', [
        migrationName,
      ]);
    }
  } finally {
    client.release();
  }
}

async function countPendingMigrationsAfter(lastAppliedMigrationName: string): Promise<number> {
  let pendingMigrationCount = 0;

  for await (const entry of Deno.readDir(new URL('../db/migrations/', import.meta.url))) {
    if (!entry.isFile || !entry.name.endsWith('.sql')) {
      continue;
    }

    if (entry.name.localeCompare(lastAppliedMigrationName) > 0) {
      pendingMigrationCount += 1;
    }
  }

  return pendingMigrationCount;
}
