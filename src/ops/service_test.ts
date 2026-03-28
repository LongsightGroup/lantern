import { assertEquals, assertRejects } from '@std/assert';
import {
  buildAttemptRecord,
  buildDeploymentRecord,
  buildGradePublicationRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';
import {
  buildDeploymentBinding,
  buildLaunchServiceClaims,
  buildRuntimeSessionRecord,
} from '../test_helpers/lti.ts';

Deno.test('ops service retries failed grade publication against the attempt-scoped runtime session and updates the existing ledger row', async () => {
  const modulePath = `./${'service.ts'}`;
  const opsServiceModule = await import(modulePath);
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        id: 1,
        binding: buildDeploymentBinding(),
      }),
    ],
    attempts: [
      buildAttemptRecord({
        id: 1,
        attemptId: 'attempt-123',
        status: 'completed',
        completionState: 'completed',
        finalizedAt: '2026-03-24T12:31:00Z',
      }),
      buildAttemptRecord({
        id: 2,
        attemptId: 'attempt-999',
        userId: 'canvas-user-999',
        startedAt: '2026-03-24T12:40:00Z',
      }),
    ],
    gradePublications: [
      buildGradePublicationRecord({
        attemptId: 'attempt-123',
        status: 'failed',
        gradingProgress: 'Failed',
        publishedAt: null,
        updatedAt: '2026-03-24T12:35:00Z',
        errorCode: 'canvas_score_rejected',
        errorDetail: {
          httpStatus: 422,
        },
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        sessionId: 'runtime-session-123',
        attemptId: 'attempt-123',
        createdAt: '2026-03-24T12:30:00Z',
        expiresAt: '2026-03-25T12:30:00Z',
      }),
      buildRuntimeSessionRecord({
        sessionId: 'runtime-session-999',
        sessionToken: 'runtime-token-999',
        attemptId: 'attempt-999',
        createdAt: '2026-03-24T12:40:00Z',
        expiresAt: '2026-03-25T12:40:00Z',
        services: buildLaunchServiceClaims({
          ags: {
            scope: [
              'https://purl.imsglobal.org/spec/lti-ags/scope/score',
              'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
            ],
            lineitemsUrl: 'https://canvas.example/api/lti/courses/42/line_items',
            lineitemUrl: 'https://canvas.example/api/lti/courses/42/line_items/99',
          },
        }),
      }),
    ],
  });
  const publishCalls: Array<{
    accessToken: string;
    lineItemUrl: string;
    platformUserId: string;
  }> = [];

  const result = await opsServiceModule.retryFailedGradePublication({
    repository,
    attemptId: 'attempt-123',
    now: () => new Date('2026-03-24T12:45:00Z'),
    requestAccessToken: () =>
      Promise.resolve({
        accessToken: 'canvas-access-token',
      }),
    publishScore: (input: { accessToken: string; lineItemUrl: string; platformUserId: string }) => {
      publishCalls.push(input);
      return Promise.resolve({ accepted: true, status: 200 });
    },
  });
  const savedPublication = await repository.getGradePublicationByAttemptId('attempt-123');

  assertEquals(publishCalls.length, 1);
  assertEquals(publishCalls[0]?.accessToken, 'canvas-access-token');
  assertEquals(
    publishCalls[0]?.lineItemUrl,
    'https://canvas.example/api/lti/courses/42/line_items/9',
  );
  assertEquals(publishCalls[0]?.platformUserId, 'canvas-user-123');
  assertEquals(result.attemptId, 'attempt-123');
  assertEquals(result.publication.status, 'published');
  assertEquals(savedPublication?.id, 1);
  assertEquals(savedPublication?.status, 'published');
  assertEquals(savedPublication?.publishedAt, '2026-03-24T12:45:00.000Z');
});

Deno.test('ops service blocks retry when no failed publication or AGS context remains for the attempt', async () => {
  const modulePath = `./${'service.ts'}`;
  const opsServiceModule = await import(modulePath);
  const missingPublicationRepository = createInMemoryPackageReviewRepository({
    gradePublications: [
      buildGradePublicationRecord({
        attemptId: 'attempt-123',
        status: 'published',
        publishedAt: '2026-03-24T12:35:00Z',
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        attemptId: 'attempt-123',
        expiresAt: '2026-03-25T12:30:00Z',
      }),
    ],
  });
  const missingAgsRepository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        id: 1,
        binding: buildDeploymentBinding(),
      }),
    ],
    attempts: [
      buildAttemptRecord({
        id: 2,
        attemptId: 'attempt-456',
      }),
    ],
    gradePublications: [
      buildGradePublicationRecord({
        attemptId: 'attempt-456',
        status: 'failed',
        publishedAt: null,
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        attemptId: 'attempt-456',
        services: buildLaunchServiceClaims({
          ags: null,
        }),
      }),
    ],
  });

  await assertRejects(
    () =>
      opsServiceModule.retryFailedGradePublication({
        repository: missingPublicationRepository,
        attemptId: 'attempt-123',
        requestAccessToken: () =>
          Promise.resolve({
            accessToken: 'unused',
          }),
        publishScore: () => Promise.resolve({ accepted: true, status: 200 }),
      }),
    Error,
    'could not find a failed grade publication',
  );

  await assertRejects(
    () =>
      opsServiceModule.retryFailedGradePublication({
        repository: missingAgsRepository,
        attemptId: 'attempt-456',
        requestAccessToken: () =>
          Promise.resolve({
            accessToken: 'unused',
          }),
        publishScore: () => Promise.resolve({ accepted: true, status: 200 }),
      }),
    Error,
    'does not include AGS service context',
  );
});

Deno.test('runtime gateway exposes the shared governed grade-publication helper used by finalize and retry', async () => {
  const modulePath = `../runtime/${'gateway.ts'}`;
  const gatewayModule = await import(modulePath);
  const repository = createInMemoryPackageReviewRepository({
    gradePublications: [
      buildGradePublicationRecord({
        id: 1,
        attemptId: 'attempt-123',
        status: 'failed',
        publishedAt: null,
        updatedAt: '2026-03-24T12:35:00Z',
      }),
    ],
  });
  const result = await gatewayModule.publishGovernedGradePublication({
    repository,
    attemptId: 'attempt-123',
    publication: buildGradePublicationRecord({
      id: 1,
      attemptId: 'attempt-123',
      status: 'failed',
      publishedAt: null,
      updatedAt: '2026-03-24T12:35:00Z',
    }),
    accessToken: 'canvas-access-token',
    now: () => new Date('2026-03-24T12:45:00Z'),
    publishScore: () => Promise.resolve({ accepted: true, status: 200 }),
  });
  const savedPublication = await repository.getGradePublicationByAttemptId('attempt-123');

  assertEquals(result.gradePublishedNow, true);
  assertEquals(savedPublication?.id, 1);
  assertEquals(savedPublication?.status, 'published');
  assertEquals(savedPublication?.publishedAt, '2026-03-24T12:45:00.000Z');
});
