import { assertEquals, assertExists } from '@std/assert';
import {
  bootstrapPackageReviewSchema,
  resetPackageReviewTables,
  withPackageReviewTestDatabase,
} from '../test_helpers/postgres.ts';
import { createOpsRepositoryForTest } from './repository_test_core_support.ts';
import { seedOpsRepositoryFixtures } from './repository_test_seed.ts';

Deno.test('ops repository resolves retry lookups by attempt-scoped runtime session rather than the latest session for the deployment', async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedOpsRepositoryFixtures(pool);

    const repository = await createOpsRepositoryForTest(pool);
    const lookup = await repository.getRetryableGradePublicationLookup('attempt-123');

    assertExists(lookup);
    assertEquals(lookup.attemptId, 'attempt-123');
    assertEquals(lookup.runtimeSession?.sessionId, 'runtime-session-123');
    assertEquals(lookup.runtimeSession?.attemptId, 'attempt-123');
    assertEquals(lookup.publication.status, 'failed');
    assertEquals(lookup.runtimeSession?.sessionId === 'runtime-session-999', false);
  });
});

Deno.test('ops repository only returns retry lookups for failed grade publications', async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedOpsRepositoryFixtures(pool);
    const client = await pool.connect();

    try {
      await client.queryArray({
        text: `
          UPDATE grade_publications
          SET status = 'published',
              published_at = $2,
              updated_at = $2,
              error_code = NULL,
              error_detail = NULL
          WHERE attempt_id = $1
        `,
        args: ['attempt-123', '2026-03-24T12:45:00Z'],
      });
    } finally {
      client.release();
    }

    const repository = await createOpsRepositoryForTest(pool);
    const lookup = await repository.getRetryableGradePublicationLookup('attempt-123');

    assertEquals(lookup, null);
  });
});
