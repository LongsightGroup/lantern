import { assertEquals, assertObjectMatch, assertRejects } from '@std/assert';
import { createApp } from '../app.ts';
import { withRuntimeOriginEnv } from '../app_test_support.ts';
import { acceptAttemptEvent, parseAttemptEvent, requireRuntimeCapability } from './gateway.ts';
import { RuntimeBrokerDenialError } from './gateway_errors.ts';
import { buildRuntimeSessionRecord } from '../test_helpers/lti.ts';
import {
  buildAttemptRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';

Deno.test('runtime gateway accepts authenticated attempt-event writes and persists append-only attempt events', async () => {
  await withRuntimeOriginEnv(async () => {
    const repository = createInMemoryPackageReviewRepository({
      attempts: [buildAttemptRecord()],
      runtimeSessions: [
        buildRuntimeSessionRecord({
          expiresAt: '2099-03-26T02:45:00Z',
        }),
      ],
    });
    const response = await createApp({
      getRepository: () => repository,
    }).request(
      'https://runtime.lantern.example/runtime/sessions/runtime-session-123/attempt-events',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer runtime-token-123',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'progress',
          checkpoint: 'wave-1',
          value: 0.5,
          timestamp: '2026-03-24T02:30:00Z',
        }),
      },
    );

    assertEquals(response.status, 202);

    const events = await repository.listAttemptEvents('attempt-123');

    assertEquals(events.length, 1);
    assertEquals(events[0]?.sequence, 1);
    assertEquals(events[0]?.eventType, 'progress');
    assertEquals(events[0]?.learningVerb, 'progressed');
    assertEquals(events[0]?.objectId, 'wave-1');
    assertEquals(events[0]?.objectType, 'checkpoint');
    assertEquals(events[0]?.result, { value: 0.5 });
    const runtimeAuditEvents = await repository.listAuditEventsByEventType(
      'runtime.capability.allowed',
    );

    assertEquals(runtimeAuditEvents.length, 1);
    assertEquals(runtimeAuditEvents[0]?.attemptId, 'attempt-123');
    assertEquals(runtimeAuditEvents[0]?.detail.capability, 'submit_attempt_event');
  });
});

Deno.test('runtime gateway blocks missing capability, bad payloads, and bad tokens before any write', async () => {
  await withRuntimeOriginEnv(async () => {
    const repository = createInMemoryPackageReviewRepository({
      attempts: [buildAttemptRecord()],
      runtimeSessions: [
        buildRuntimeSessionRecord({
          capabilities: ['read_launch_context'],
          expiresAt: '2099-03-26T02:45:00Z',
        }),
      ],
    });
    const app = createApp({
      getRepository: () => repository,
    });
    const capabilityResponse = await app.request(
      'https://runtime.lantern.example/runtime/sessions/runtime-session-123/attempt-events',
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
    const tokenResponse = await app.request(
      'https://runtime.lantern.example/runtime/sessions/runtime-session-123/attempt-events',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer wrong-token',
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

    assertEquals(capabilityResponse.status, 409);
    assertEquals(tokenResponse.status, 409);
    assertObjectMatch(await capabilityResponse.json(), {
      accepted: false,
      denial: {
        category: 'policyDenied',
        code: 'capability_not_granted',
        capability: 'submit_attempt_event',
      },
    });
    assertEquals(await repository.listAttemptEvents('attempt-123'), []);
    const deniedEvents = await repository.listAuditEventsByEventType('runtime.capability.denied');
    const sessionDenials = await repository.listAuditEventsByEventType('runtime.session.denied');

    assertEquals(deniedEvents.length, 1);
    assertEquals(sessionDenials.length, 1);
  });
});

Deno.test('runtime gateway validates attempt event payloads and capabilities', async () => {
  assertEquals(
    parseAttemptEvent({
      type: 'complete',
      timestamp: '2026-03-24T02:30:00Z',
    }).type,
    'complete',
  );
  assertObjectMatch(
    parseAttemptEvent({
      type: 'answer',
      questionId: 'q1',
      answer: 'asteroid',
      correct: true,
      scoreGiven: 1,
      scoreMaximum: 1,
      timestamp: '2026-03-24T02:30:00Z',
    }),
    {
      type: 'answer',
      correct: true,
      scoreGiven: 1,
      scoreMaximum: 1,
    },
  );
  await assertRejects(
    () =>
      Promise.resolve().then(() =>
        parseAttemptEvent({
          type: 'answer',
          answer: 'asteroid',
          timestamp: '2026-03-24T02:30:00Z',
        })
      ),
    RuntimeBrokerDenialError,
  );
  const capabilityError = (await assertRejects(
    () =>
      Promise.resolve().then(() =>
        requireRuntimeCapability(
          buildRuntimeSessionRecord({
            capabilities: ['read_launch_context'],
          }),
          'submit_attempt_event',
        )
      ),
    RuntimeBrokerDenialError,
  )) as RuntimeBrokerDenialError;
  assertEquals(capabilityError.category, 'policyDenied');
  assertEquals(capabilityError.code, 'capability_not_granted');
  assertEquals(capabilityError.capability, 'submit_attempt_event');
});

Deno.test('runtime gateway helper appends attempt events directly against the durable ledger', async () => {
  const repository = createInMemoryPackageReviewRepository({
    attempts: [buildAttemptRecord()],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        expiresAt: '2099-03-26T02:45:00Z',
      }),
    ],
  });
  const appended = await acceptAttemptEvent({
    repository,
    session: buildRuntimeSessionRecord({
      expiresAt: '2099-03-26T02:45:00Z',
    }),
    payload: {
      type: 'answer',
      questionId: 'q1',
      answer: 'asteroid',
      timestamp: '2026-03-24T02:30:00Z',
    },
    now: () => new Date('2026-03-24T02:31:00Z'),
  });

  assertEquals(appended.sequence, 1);
  assertEquals(appended.learningVerb, 'answered');
  assertEquals(appended.objectId, 'q1');
  assertEquals(appended.objectType, 'question');
  assertEquals(appended.result, {
    response: 'asteroid',
    success: null,
    scoreGiven: null,
    scoreMaximum: null,
  });
  assertEquals(appended.receivedAt, '2026-03-24T02:31:00.000Z');
});
