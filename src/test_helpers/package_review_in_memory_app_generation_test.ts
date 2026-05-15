import { assertEquals, assertRejects } from '@std/assert';
import { createInMemoryPackageReviewRepository } from './package_review.ts';
import { buildAppGenerationRunRecord } from './package_review_in_memory_app_generation.ts';

Deno.test('in-memory repository creates, reads, and updates app generation runs', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const created = await repository.createAppGenerationRun(buildAppGenerationRunRecord());

  assertEquals(created.status, 'started');

  const planned = await repository.updateAppGenerationRun({
    ...created,
    status: 'planning',
    selectedStarterId: 'simple-activity',
    updatedAt: '2026-05-14T12:05:00.000Z',
  });

  assertEquals(planned.status, 'planning');
  assertEquals(planned.selectedStarterId, 'simple-activity');

  const fetched = await repository.getAppGenerationRunById('generation-1');

  assertEquals(fetched?.updatedAt, '2026-05-14T12:05:00.000Z');
});

Deno.test('in-memory repository rejects duplicate app generation runs', async () => {
  const repository = createInMemoryPackageReviewRepository({
    appGenerationRuns: [buildAppGenerationRunRecord()],
  });

  await assertRejects(
    () => repository.createAppGenerationRun(buildAppGenerationRunRecord()),
    Error,
    'App generation run generation-1 already exists and cannot be replaced.',
  );
});
