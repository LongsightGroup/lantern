import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import { EXAMPLE_SNAPSHOT_ROOT } from './app_test_support.ts';
import {
  buildAttemptRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { buildRuntimeSessionRecord } from './test_helpers/lti.ts';

Deno.test('GET /runtime/sessions/:id serves the reviewed entrypoint with Lantern bootstrap injected', async () => {
  const response = await createApp({
    getRepository: () =>
      createInMemoryPackageReviewRepository({
        runtimeSessions: [
          buildRuntimeSessionRecord({
            snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
            entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
            contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
            expiresAt: '2030-03-26T02:45:00Z',
          }),
        ],
      }),
  }).request('http://localhost/runtime/sessions/runtime-session-123?token=runtime-token-123');

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, 'GatewayBootstrap');
  assertStringIncludes(body, 'attempt-123');
  assertStringIncludes(body, 'runtime-token-123');
  assertStringIncludes(
    body,
    '/runtime/sessions/runtime-session-123/files/__token__/runtime-token-123/dist/',
  );
});

Deno.test('POST /runtime/sessions/:id/attempt-events enforces session auth, capability checks, and append-only event writes', async () => {
  const repository = createInMemoryPackageReviewRepository({
    attempts: [buildAttemptRecord()],
    runtimeSessions: [buildRuntimeSessionRecord({ expiresAt: '2030-03-26T02:45:00Z' })],
  });
  const app = createApp({ getRepository: () => repository });

  const response = await app.request(
    'http://localhost/runtime/sessions/runtime-session-123/attempt-events',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer runtime-token-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'answer',
        questionId: 'q1',
        answer: 'asteroid',
        timestamp: '2026-03-24T02:30:00Z',
      }),
    },
  );

  assertEquals(response.status, 202);

  const events = await repository.listAttemptEvents('attempt-123');
  const auditEvents = await repository.listAuditEventsByEventType('attempt.submitted');

  assertEquals(events.length, 1);
  assertEquals(events[0]?.eventType, 'answer');
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.attemptId, 'attempt-123');
});

Deno.test('GET /runtime/sessions/:id/content serves reviewed activity content through the scoped runtime bridge', async () => {
  const response = await createApp({
    getRepository: () =>
      createInMemoryPackageReviewRepository({
        runtimeSessions: [
          buildRuntimeSessionRecord({
            snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
            entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
            contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
            expiresAt: '2030-03-26T02:45:00Z',
          }),
        ],
      }),
  }).request('http://localhost/runtime/sessions/runtime-session-123/content', {
    headers: { Authorization: 'Bearer runtime-token-123' },
  });

  assertEquals(response.status, 200);
  const body = (await response.json()) as {
    title: string;
    questions: Array<{ id: string }>;
  };

  assertEquals(body.title, 'Chapter 4 Asteroids');
  assertEquals(body.questions[0]?.id, 'q1');
});

Deno.test('GET /runtime/sessions/:id/files/* serves reviewed asset bytes and blocks bad tokens', async () => {
  const app = createApp({
    getRepository: () =>
      createInMemoryPackageReviewRepository({
        runtimeSessions: [
          buildRuntimeSessionRecord({
            snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
            entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
            contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
            expiresAt: '2030-03-26T02:45:00Z',
          }),
        ],
      }),
  });
  const goodResponse = await app.request(
    'http://localhost/runtime/sessions/runtime-session-123/files/dist/app.js?token=runtime-token-123',
  );
  const goodPathTokenResponse = await app.request(
    'http://localhost/runtime/sessions/runtime-session-123/files/__token__/runtime-token-123/dist/app.js',
  );
  const deniedResponse = await app.request(
    'http://localhost/runtime/sessions/runtime-session-123/files/dist/app.js?token=wrong-token',
  );
  const deniedPathTokenResponse = await app.request(
    'http://localhost/runtime/sessions/runtime-session-123/files/__token__/wrong-token/dist/app.js',
  );

  assertEquals(goodResponse.status, 200);
  assertEquals(goodPathTokenResponse.status, 200);
  assertStringIncludes(await goodResponse.text(), 'Attempt finalized');
  assertStringIncludes(await goodPathTokenResponse.text(), 'Attempt finalized');
  assertEquals(deniedResponse.status, 409);
  assertEquals(deniedPathTokenResponse.status, 409);
  assertStringIncludes(
    await deniedResponse.text(),
    'Runtime session token did not match the requested session.',
  );
  assertStringIncludes(
    await deniedPathTokenResponse.text(),
    'Runtime session token did not match the requested session.',
  );
});
