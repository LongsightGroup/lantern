import { assertEquals, assertExists, assertObjectMatch, assertRejects } from '@std/assert';
import { requireRuntimeCapability, submitScoreProposal } from './gateway.ts';
import { RuntimeBrokerDenialError, toRuntimeBrokerResult } from './gateway_errors.ts';
import { buildRuntimeSessionRecord } from '../test_helpers/lti.ts';
import {
  buildAttemptRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';

Deno.test('runtime broker exposes stable typed denial results for missing capabilities', async () => {
  const error = (await assertRejects(
    () =>
      Promise.resolve().then(() =>
        requireRuntimeCapability(
          buildRuntimeSessionRecord({
            capabilities: ['read_launch_context'],
          }),
          'finalize_attempt',
        )
      ),
    RuntimeBrokerDenialError,
  )) as RuntimeBrokerDenialError;

  assertEquals(error.category, 'policyDenied');
  assertEquals(error.code, 'capability_not_granted');
  assertEquals(error.capability, 'finalize_attempt');
  const result = toRuntimeBrokerResult(error);

  assertExists(result);
  assertObjectMatch(result, {
    accepted: false,
    denial: {
      category: 'policyDenied',
      code: 'capability_not_granted',
      capability: 'finalize_attempt',
    },
  });
});

Deno.test('runtime broker accepts score proposals without creating a direct grade publication path', async () => {
  const repository = createInMemoryPackageReviewRepository({
    attempts: [buildAttemptRecord()],
  });

  const result = await submitScoreProposal({
    repository,
    session: buildRuntimeSessionRecord({
      expiresAt: '2099-03-26T02:45:00Z',
    }),
    payload: {
      scoreGiven: 7,
      scoreMaximum: 10,
    },
    now: () => new Date('2026-03-24T02:31:00Z'),
  });

  assertObjectMatch(result, {
    accepted: true,
    scoreProposal: {
      scoreGiven: 7,
      scoreMaximum: 10,
    },
  });
  assertEquals(await repository.getGradePublicationByAttemptId('attempt-123'), null);
  assertEquals((await repository.getAttemptById('attempt-123'))?.finalizedAt, null);
});

Deno.test('runtime broker rejects invalid score proposals with typed spec-invalid denials', async () => {
  const repository = createInMemoryPackageReviewRepository({
    attempts: [buildAttemptRecord()],
  });

  const error = (await assertRejects(
    () =>
      submitScoreProposal({
        repository,
        session: buildRuntimeSessionRecord({
          expiresAt: '2099-03-26T02:45:00Z',
        }),
        payload: {
          scoreGiven: 11,
          scoreMaximum: 10,
        },
        now: () => new Date('2026-03-24T02:31:00Z'),
      }),
    RuntimeBrokerDenialError,
  )) as RuntimeBrokerDenialError;

  assertEquals(error.category, 'specInvalid');
  assertEquals(error.code, 'invalid_score_proposal');
});
