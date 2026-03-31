import { assert, assertEquals } from "@std/assert";
import type { Pool } from "@db/postgres";
import { runMigrations } from "../db/migrate.ts";
import { resolveCanvasIssuer } from "../lti/config.ts";
import { createTestDatabasePool } from "../test_helpers/postgres.ts";
import { createPackageReviewRepository } from "./repository.ts";

const PRE_010_MIGRATIONS = [
  "001_package_review.sql",
  "002_canvas_install.sql",
  "003_lti_login_state.sql",
  "004_gateway_activity_grading_audit.sql",
  "005_operator_control_plane_indexes.sql",
  "006_broker_verification_runs.sql",
  "007_deep_linking_sessions.sql",
  "008_reviewed_placements.sql",
  "009_preview_sessions.sql",
] as const;

const DROP_PACKAGE_REVIEW_TABLES_SQL = `
  DROP TABLE IF EXISTS schema_migrations CASCADE;
  DROP TABLE IF EXISTS
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

Deno.test("migration backfills existing Canvas deployments to lms_type canvas without losing version pins", async () => {
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
          "chapter-4-asteroids",
          "0.1.0",
          "Chapter 4 Asteroids",
          "Migration backfill fixture.",
          "user",
          "instructor_123",
          "/dist/index.html",
          ["learner", "instructor"],
          "course",
          ["read_launch_context"],
          "declarative",
          null,
          100,
          "approved",
          "Approved for migration backfill testing.",
          "2026-03-26T10:00:00Z",
          "[]",
          JSON.stringify({
            app_id: "chapter-4-asteroids",
            version: "0.1.0",
            title: "Chapter 4 Asteroids",
          }),
          "var/packages/chapter-4-asteroids/0.1.0",
          "sha256:chapter-4-asteroids-0-1-0",
          "2026-03-26T09:00:00Z",
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
          "chapter-4-asteroids-pilot",
          "Chapter 4 Asteroids Pilot Deployment",
          "chapter-4-asteroids",
          packageVersionId,
          "production",
          resolveCanvasIssuer("production"),
          "canvas-client-123",
          "canvas-deployment-123",
        ],
      );
    } finally {
      client.release();
    }

    const appliedCount = await runMigrations(pool);

    assertEquals(appliedCount > 0, true);
    assertEquals(await runMigrations(pool), 0);

    const repository = createPackageReviewRepository(pool);
    const migrated = await repository.getDeploymentByBinding({
      lms: "canvas",
      issuer: resolveCanvasIssuer("production"),
      clientId: "canvas-client-123",
      deploymentId: "canvas-deployment-123",
    });
    const listed = await repository.listDeploymentsByApp("chapter-4-asteroids");

    assert(migrated);
    assertEquals(migrated?.slug, "chapter-4-asteroids-pilot");
    assertEquals(migrated?.enabledPackageVersionId, packageVersionId);
    assertEquals(migrated?.binding?.lms, "canvas");
    assertEquals(listed.length, 1);
  } finally {
    await pool.end();
  }
});

async function resetToPre010Schema(pool: Pool): Promise<void> {
  await resetToSchema(pool, PRE_010_MIGRATIONS);
}

async function resetToSchema(
  pool: Pool,
  migrations: readonly string[],
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.queryArray(DROP_PACKAGE_REVIEW_TABLES_SQL);
    await client.queryArray(`
      CREATE TABLE schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const migrationName of migrations) {
      const sql = await Deno.readTextFile(
        new URL(`../db/migrations/${migrationName}`, import.meta.url),
      );

      await client.queryArray(sql);
      await client.queryArray(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [
          migrationName,
        ],
      );
    }
  } finally {
    client.release();
  }
}
