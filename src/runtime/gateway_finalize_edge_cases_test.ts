import { assertEquals, assertRejects } from '@std/assert';
import { finalizeRuntimeAttempt } from './gateway.ts';
import {
  buildDeploymentBinding,
  buildRuntimeSessionRecord,
  getTestToolPrivateJwkEnvValue,
} from '../test_helpers/lti.ts';
import {
  buildAttemptEventRecord,
  buildAttemptRecord,
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';
import { EXAMPLE_SNAPSHOT_ROOT, restoreEnv, withFetchStub } from './gateway_test_helpers.ts';

Deno.test('runtime gateway surfaces Canvas token failures clearly after the durable attempt is finalized', async () => {
  const previousToolKey = Deno.env.get('LTI_TOOL_PRIVATE_JWK');
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        artifact: {
          snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
          manifestPath: `${EXAMPLE_SNAPSHOT_ROOT}/manifest.json`,
          entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
          digest: 'sha256:example-snapshot',
        },
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding(),
      }),
    ],
    attempts: [buildAttemptRecord()],
    attemptEvents: [
      buildAttemptEventRecord({
        id: 1,
        sequence: 1,
        event: {
          type: 'answer',
          questionId: 'q1',
          answer: 'resistance to a change in motion',
          timestamp: '2026-03-24T02:30:00Z',
        },
      }),
    ],
  });
  const session = buildRuntimeSessionRecord({
    expiresAt: '2026-03-26T02:45:00Z',
  });

  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());

  try {
    const result = await withFetchStub(
      () =>
        new Response(
          JSON.stringify({
            error: 'invalid_client',
          }),
          {
            status: 401,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      async () =>
        await finalizeRuntimeAttempt({
          repository,
          session,
          payload: {
            completionState: 'completed',
          },
          now: () => new Date('2026-03-24T02:35:00Z'),
        }),
    );

    assertEquals(result.finalizedNow, true);
    assertEquals(result.gradePublishedNow, false);
    assertEquals(result.publishError?.code, 'token_request_failed');
    assertEquals(result.gradePublication, null);

    const attempt = await repository.getAttemptById('attempt-123');

    assertEquals(attempt?.status, 'completed');
    assertEquals(attempt?.finalizedAt, '2026-03-24T02:35:00.000Z');
  } finally {
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousToolKey);
  }
});

Deno.test('runtime gateway fails clearly for manual grading finalize requests and leaves the attempt open', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        grading: {
          mode: 'manual',
          rubricFile: null,
          maxScore: null,
        },
      }),
    ],
    attempts: [buildAttemptRecord()],
  });
  const session = buildRuntimeSessionRecord({
    expiresAt: '2026-03-26T02:45:00Z',
  });

  await assertRejects(
    () =>
      finalizeRuntimeAttempt({
        repository,
        session,
        payload: {
          completionState: 'completed',
        },
        now: () => new Date('2026-03-24T02:35:00Z'),
      }),
    Error,
    'Finalize blocked: Manual grading cannot be finalized automatically in Phase 3.',
  );

  const attempt = await repository.getAttemptById('attempt-123');

  assertEquals(attempt?.status, 'in_progress');
  assertEquals(attempt?.finalizedAt, null);
});
