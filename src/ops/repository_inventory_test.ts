import { assertEquals, assertExists } from '@std/assert';
import { buildAuditEventRecord } from '../test_helpers/package_review.ts';
import {
  bootstrapPackageReviewSchema,
  resetPackageReviewTables,
  withPackageReviewTestDatabase,
} from '../test_helpers/postgres.ts';
import { createOpsRepositoryForTest, insertAuditEvent } from './repository_test_core_support.ts';
import { seedOpsRepositoryFixtures } from './repository_test_seed.ts';

Deno.test('ops repository lists deployment-centric inventory rows with owner, version, usage metrics, and current health inputs', async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedOpsRepositoryFixtures(pool);

    const repository = await createOpsRepositoryForTest(pool);
    const rows = await repository.listControlPlaneDeployments();

    assertEquals(rows.length, 1);
    assertEquals(rows[0]?.deploymentSlug, 'chapter-4-asteroids-pilot');
    assertEquals(rows[0]?.ownerId, 'instructor_123');
    assertEquals(rows[0]?.enabledPackageVersion, '0.1.0');
    assertEquals(rows[0]?.pilotUsage.attemptsCompleted, 1);
    assertEquals(rows[0]?.lastGradePublishStatus, 'failed');
  });
});

Deno.test('ops repository returns deployment detail snapshots with the latest launch, NRPS read, AGS publish, and diagnostics feed', async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedOpsRepositoryFixtures(pool);

    const repository = await createOpsRepositoryForTest(pool);
    const detail = await repository.getControlPlaneDeploymentDetail(1);

    assertExists(detail);
    assertEquals(detail.inventory.deploymentSlug, 'chapter-4-asteroids-pilot');
    assertEquals(detail.latestLaunch?.attemptId, 'attempt-123');
    assertEquals(detail.latestNrpsRead?.status, 'succeeded');
    assertEquals(detail.latestGradePublish?.errorCode, 'canvas_score_rejected');
    assertEquals(detail.diagnostics.length, 3);
  });
});

Deno.test('ops repository diagnostics include reviewer events while keeping launch, NRPS, and AGS diagnostics intact', async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedOpsRepositoryFixtures(pool);
    const client = await pool.connect();

    try {
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 4,
          eventType: 'reviewer.preview_viewed',
          actorType: 'user',
          actorId: 'reviewer-123',
          status: 'succeeded',
          summary: 'Reviewer opened placement evidence.',
          detail: { placementId: 'placement-ops-123' },
          occurredAt: '2026-03-24T12:36:00Z',
        }),
      );
    } finally {
      client.release();
    }

    const repository = await createOpsRepositoryForTest(pool);
    const detail = await repository.getControlPlaneDeploymentDetail(1);

    assertExists(detail);
    assertEquals(detail.diagnostics.length, 4);
    assertEquals(
      detail.diagnostics.some((item) => item.eventType === 'launch.accepted'),
      true,
    );
    assertEquals(
      detail.diagnostics.some((item) => item.eventType === 'deployment.nrps_verified'),
      true,
    );
    assertEquals(
      detail.diagnostics.some((item) => item.eventType === 'grade_publish.failed'),
      true,
    );
    assertEquals(
      detail.diagnostics.some((item) => item.eventType === 'reviewer.preview_viewed'),
      true,
    );
    assertEquals(
      detail.diagnostics.find((item) => item.eventType === 'reviewer.preview_viewed')?.kind,
      'reviewer',
    );
  });
});
