import { assert, assertEquals, assertRejects } from '@std/assert';
import type { Pool } from '@db/postgres';
import { runMigrations } from '../db/migrate.ts';
import { resolveCanvasIssuer } from '../lti/config.ts';
import { createTestDatabasePool } from '../test_helpers/postgres.ts';
import { createPackageReviewRepository } from './repository.ts';
import { withRepositoryTestDatabase } from './repository_test_support.ts';

const PRE_010_MIGRATIONS = [
  '001_package_review.sql',
  '002_canvas_install.sql',
  '003_lti_login_state.sql',
  '004_gateway_activity_grading_audit.sql',
  '005_operator_control_plane_indexes.sql',
  '006_broker_verification_runs.sql',
  '007_deep_linking_sessions.sql',
  '008_reviewed_placements.sql',
  '009_preview_sessions.sql',
] as const;

const DROP_PACKAGE_REVIEW_TABLES_SQL = `
  DROP TABLE IF EXISTS schema_migrations CASCADE;
  DROP TABLE IF EXISTS
    broker_verification_runs,
    audit_events,
    grade_publications,
    canvas_line_item_bindings,
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

Deno.test('repository persists exact Canvas, Moodle, and Sakai bindings and lists them per app', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const canvasIssuer = resolveCanvasIssuer('production');
    const canvas = await repository.saveDeploymentBinding({
      slug: 'chapter-4-asteroids-canvas',
      label: 'Chapter 4 Asteroids Canvas',
      appId: 'chapter-4-asteroids',
      binding: {
        lms: 'canvas',
        canvasEnvironment: 'production',
        issuer: canvasIssuer,
        clientId: 'shared-client-123',
        deploymentId: 'shared-deployment-123',
      },
    });
    const moodle = await repository.saveDeploymentBinding({
      slug: 'chapter-4-asteroids-moodle',
      label: 'Chapter 4 Asteroids Moodle',
      appId: 'chapter-4-asteroids',
      binding: {
        lms: 'moodle',
        issuer: canvasIssuer,
        clientId: 'shared-client-123',
        deploymentId: 'shared-deployment-123',
        authenticationRequestUrl: 'https://moodle.example/mod/lti/auth.php',
        accessTokenUrl: 'https://moodle.example/mod/lti/token.php',
        jwksUrl: 'https://moodle.example/mod/lti/certs.php',
      },
    });
    const sakai = await repository.saveDeploymentBinding({
      slug: 'chapter-4-asteroids-sakai',
      label: 'Chapter 4 Asteroids Sakai',
      appId: 'chapter-4-asteroids',
      binding: {
        lms: 'sakai',
        issuer: 'https://sakai.example',
        clientId: 'sakai-client-123',
        deploymentId: 'sakai-deployment-123',
        oidcAuthenticationUrl: 'https://sakai.example/imsti/sakai_oidc_login',
        accessTokenUrl: 'https://sakai.example/imsti/sakai_access_token',
        jwksUrl: 'https://sakai.example/imsti/sakai_jwks',
      },
    });

    assertEquals(canvas.binding?.lms, 'canvas');
    assertEquals(moodle.binding?.lms, 'moodle');
    assertEquals(
      moodle.binding?.lms === 'moodle' ? moodle.binding.authenticationRequestUrl : null,
      'https://moodle.example/mod/lti/auth.php',
    );
    assertEquals(sakai.binding?.lms, 'sakai');
    assertEquals(
      sakai.binding?.lms === 'sakai' ? sakai.binding.oidcAuthenticationUrl : null,
      'https://sakai.example/imsti/sakai_oidc_login',
    );

    const listed = await repository.listDeploymentsByApp('chapter-4-asteroids');

    assertEquals(
      listed.map((deployment) => deployment.slug).sort(),
      [
        'chapter-4-asteroids-canvas',
        'chapter-4-asteroids-moodle',
        'chapter-4-asteroids-sakai',
      ],
    );
  });
});

Deno.test('repository uses exact LMS binding identity for lookup and rejects same-LMS slot collisions', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const canvasIssuer = resolveCanvasIssuer('production');

    await repository.saveDeploymentBinding({
      slug: 'chapter-4-asteroids-canvas',
      label: 'Chapter 4 Asteroids Canvas',
      appId: 'chapter-4-asteroids',
      binding: {
        lms: 'canvas',
        canvasEnvironment: 'production',
        issuer: canvasIssuer,
        clientId: 'shared-client-123',
        deploymentId: 'shared-deployment-123',
      },
    });
    await repository.saveDeploymentBinding({
      slug: 'chapter-4-asteroids-moodle',
      label: 'Chapter 4 Asteroids Moodle',
      appId: 'chapter-4-asteroids',
      binding: {
        lms: 'moodle',
        issuer: canvasIssuer,
        clientId: 'shared-client-123',
        deploymentId: 'shared-deployment-123',
        authenticationRequestUrl: 'https://moodle.example/mod/lti/auth.php',
        accessTokenUrl: 'https://moodle.example/mod/lti/token.php',
        jwksUrl: 'https://moodle.example/mod/lti/certs.php',
      },
    });

    const canvas = await repository.getDeploymentByBinding({
      lms: 'canvas',
      issuer: canvasIssuer,
      clientId: 'shared-client-123',
      deploymentId: 'shared-deployment-123',
    });
    const moodle = await repository.getDeploymentByBinding({
      lms: 'moodle',
      issuer: canvasIssuer,
      clientId: 'shared-client-123',
      deploymentId: 'shared-deployment-123',
    });

    assertEquals(canvas?.slug, 'chapter-4-asteroids-canvas');
    assertEquals(moodle?.slug, 'chapter-4-asteroids-moodle');

    await assertRejects(
      () =>
        repository.saveDeploymentBinding({
          slug: 'chapter-4-asteroids-canvas-secondary',
          label: 'Chapter 4 Asteroids Canvas Secondary',
          appId: 'chapter-4-asteroids',
          binding: {
            lms: 'canvas',
            canvasEnvironment: 'beta',
            issuer: resolveCanvasIssuer('beta'),
            clientId: 'other-client-456',
            deploymentId: 'other-deployment-456',
          },
        }),
      Error,
      'App chapter-4-asteroids already has a canvas deployment.',
    );
  });
});

Deno.test('migration backfills existing Canvas deployments to lms_type canvas without losing version pins', async () => {
  const pool = createTestDatabasePool();

  try {
    await resetToPre010Schema(pool);
    const client = await pool.connect();
    let packageVersionId = 0;

    try {
      const insertedPackageVersion = await client.queryObject<{ id: number }>({
        text: `
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
            approval_status,
            review_notes,
            reviewed_at,
            validation_issues,
            manifest_json,
            artifact_root,
            artifact_digest,
            imported_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10::text[], $11, $12, $13, $14,
            $15, $16, $17::jsonb, $18::jsonb, $19, $20, $21
          )
          RETURNING id
        `,
        args: [
          'chapter-4-asteroids',
          '0.1.0',
          'Chapter 4 Asteroids',
          'Migration backfill fixture.',
          'user',
          'instructor_123',
          '/dist/index.html',
          ['learner', 'instructor'],
          'course',
          ['read_launch_context'],
          'declarative',
          null,
          100,
          'approved',
          'Approved for migration backfill testing.',
          '2026-03-26T10:00:00Z',
          '[]',
          JSON.stringify({
            app_id: 'chapter-4-asteroids',
            version: '0.1.0',
            title: 'Chapter 4 Asteroids',
          }),
          'var/packages/chapter-4-asteroids/0.1.0',
          'sha256:chapter-4-asteroids-0-1-0',
          '2026-03-26T09:00:00Z',
        ],
        camelCase: true,
      });

      packageVersionId = insertedPackageVersion.rows[0]?.id ?? 0;

      await client.queryArray(
        `
          INSERT INTO deployments (
            slug,
            label,
            app_id,
            enabled_package_version_id,
            canvas_environment,
            issuer,
            client_id,
            deployment_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          'chapter-4-asteroids-pilot',
          'Chapter 4 Asteroids Pilot Deployment',
          'chapter-4-asteroids',
          packageVersionId,
          'production',
          resolveCanvasIssuer('production'),
          'canvas-client-123',
          'canvas-deployment-123',
        ],
      );
    } finally {
      client.release();
    }

    assertEquals(await runMigrations(pool), 1);

    const repository = createPackageReviewRepository(pool);
    const migrated = await repository.getDeploymentByBinding({
      lms: 'canvas',
      issuer: resolveCanvasIssuer('production'),
      clientId: 'canvas-client-123',
      deploymentId: 'canvas-deployment-123',
    });
    const listed = await repository.listDeploymentsByApp('chapter-4-asteroids');

    assert(migrated);
    assertEquals(migrated?.slug, 'chapter-4-asteroids-pilot');
    assertEquals(migrated?.enabledPackageVersionId, packageVersionId);
    assertEquals(migrated?.binding?.lms, 'canvas');
    assertEquals(listed.length, 1);
  } finally {
    await pool.end();
  }
});

async function resetToPre010Schema(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.queryArray(DROP_PACKAGE_REVIEW_TABLES_SQL);
    await client.queryArray(`
      CREATE TABLE schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const migrationName of PRE_010_MIGRATIONS) {
      const sql = await Deno.readTextFile(new URL(`../db/migrations/${migrationName}`, import.meta.url));

      await client.queryArray(sql);
      await client.queryArray('INSERT INTO schema_migrations (filename) VALUES ($1)', [
        migrationName,
      ]);
    }
  } finally {
    client.release();
  }
}
