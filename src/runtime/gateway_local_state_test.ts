import { assertEquals, assertRejects } from '@std/assert';
import { readAttemptLocalState, writeAttemptLocalState } from './gateway.ts';
import { buildRuntimeSessionRecord } from '../test_helpers/lti.ts';
import {
  buildAttemptRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';

Deno.test('runtime gateway reads null local state by default and round-trips JSON objects on the durable attempt', async () => {
  const repository = createInMemoryPackageReviewRepository({
    attempts: [buildAttemptRecord()],
  });
  const session = buildRuntimeSessionRecord({
    expiresAt: '2099-03-26T02:45:00Z',
  });
  const localState = {
    currentCheckpoint: 'wave-2',
    answers: {
      q1: 'asteroid',
    },
  };

  assertEquals(
    await readAttemptLocalState({
      repository,
      session,
    }),
    null,
  );

  const updatedAttempt = await writeAttemptLocalState({
    repository,
    session,
    payload: localState,
  });

  assertEquals(updatedAttempt.localState, localState);
  assertEquals(
    await readAttemptLocalState({
      repository,
      session,
    }),
    localState,
  );
});

Deno.test('runtime gateway keeps attempt-local state isolated to the matching attempt context', async () => {
  const repository = createInMemoryPackageReviewRepository({
    attempts: [
      buildAttemptRecord(),
      buildAttemptRecord({
        id: 2,
        attemptId: 'attempt-456',
        resourceLinkId: 'resource-link-456',
        activityId: 'activity-456',
      }),
    ],
  });

  await writeAttemptLocalState({
    repository,
    session: buildRuntimeSessionRecord({
      expiresAt: '2099-03-26T02:45:00Z',
    }),
    payload: {
      currentCheckpoint: 'wave-2',
    },
  });

  assertEquals((await repository.getAttemptById('attempt-123'))?.localState, {
    currentCheckpoint: 'wave-2',
  });
  assertEquals((await repository.getAttemptById('attempt-456'))?.localState, null);

  await assertRejects(
    () =>
      readAttemptLocalState({
        repository,
        session: buildRuntimeSessionRecord({
          attemptId: 'attempt-456',
          packageVersionId: 99,
          packageVersion: '9.9.9',
          expiresAt: '2099-03-26T02:45:00Z',
        }),
      }),
    Error,
    'Attempt attempt-456 did not match the runtime session context.',
  );
});
