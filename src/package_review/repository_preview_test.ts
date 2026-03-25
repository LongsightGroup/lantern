import { assertEquals, assertRejects } from '@std/assert';
import {
  buildImportedPackageVersion,
  withRepositoryTestDatabase,
} from './repository_test_support.ts';

Deno.test('repository creates and reads preview sessions without Canvas deployment state', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (
        await repository.registerPackageVersion(
          await buildImportedPackageVersion({ version: '0.3.0' }),
        )
      ).id,
      reviewNotes: 'Approved for governed preview sessions.',
    });

    const created = await repository.createPreviewSession({
      sessionId: 'preview-session-123',
      packageVersionId: approvedRecord.id,
      appId: approvedRecord.appId,
      packageVersion: approvedRecord.version,
      packageTitle: approvedRecord.title,
      capabilities: approvedRecord.capabilities,
      snapshotRoot: approvedRecord.artifact.snapshotRoot,
      entrypointPath: approvedRecord.artifact.entrypointPath,
      launch: {
        userId: 'preview-user-123',
        userRole: 'instructor',
        courseId: 'preview-course-42',
        assignmentId: 'preview-assignment-7',
        activityId: 'preview-activity-9',
      },
      fakeAttemptId: 'preview-attempt-123',
      fakeScoreMaximum: 100,
      fixtureData: {
        launch: {
          user_role: 'instructor',
          course_id: 'preview-course-42',
          assignment_id: 'preview-assignment-7',
          activity_id: 'preview-activity-9',
        },
        attempt_id: 'preview-attempt-123',
        local_state: null,
      },
      createdAt: '2026-03-25T01:00:00Z',
    });
    const fetched = await repository.getPreviewSessionById('preview-session-123');

    assertEquals(created.sessionId, 'preview-session-123');
    assertEquals(created.packageVersionId, approvedRecord.id);
    assertEquals(created.packageVersion, approvedRecord.version);
    assertEquals(created.launch.courseId, 'preview-course-42');
    assertEquals(fetched?.sessionId, 'preview-session-123');
    assertEquals(fetched?.launch.userRole, 'instructor');
    assertEquals(fetched?.fakeAttemptId, 'preview-attempt-123');
  });
});

Deno.test('repository appends preview evidence rows in chronological append order', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (
        await repository.registerPackageVersion(
          await buildImportedPackageVersion({ version: '0.4.0' }),
        )
      ).id,
      reviewNotes: 'Approved for preview evidence ordering.',
    });
    const session = await repository.createPreviewSession({
      sessionId: 'preview-session-evidence',
      packageVersionId: approvedRecord.id,
      appId: approvedRecord.appId,
      packageVersion: approvedRecord.version,
      packageTitle: approvedRecord.title,
      capabilities: approvedRecord.capabilities,
      snapshotRoot: approvedRecord.artifact.snapshotRoot,
      entrypointPath: approvedRecord.artifact.entrypointPath,
      launch: {
        userId: 'preview-user-123',
        userRole: 'learner',
        courseId: 'preview-course-42',
        assignmentId: null,
        activityId: 'preview-activity-9',
      },
      fakeAttemptId: 'preview-attempt-evidence',
      fakeScoreMaximum: 100,
      fixtureData: {
        launch: {
          user_role: 'learner',
          course_id: 'preview-course-42',
          assignment_id: null,
          activity_id: 'preview-activity-9',
        },
        attempt_id: 'preview-attempt-evidence',
        local_state: null,
      },
      createdAt: '2026-03-25T01:05:00Z',
    });

    await repository.appendPreviewEvidence({
      previewSessionId: session.sessionId,
      eventType: 'preview.launch',
      capability: null,
      summary: 'Preview session launched in governed sandbox.',
      detail: {
        route: '/admin/packages/chapter-4-asteroids/versions/0.4.0/preview',
      },
      occurredAt: '2026-03-25T01:05:10Z',
    });
    await repository.appendPreviewEvidence({
      previewSessionId: session.sessionId,
      eventType: 'preview.finalize',
      capability: 'finalize_attempt',
      summary: 'Preview finalize produced fake scoring output.',
      detail: { scoreGiven: 97, scoreMaximum: 100 },
      occurredAt: '2026-03-25T01:06:00Z',
    });

    const evidence = await repository.listPreviewEvidence(session.sessionId);

    assertEquals(
      evidence.map((row) => row.sequence),
      [1, 2],
    );
    assertEquals(
      evidence.map((row) => row.eventType),
      ['preview.launch', 'preview.finalize'],
    );
    assertEquals(evidence[1]?.capability, 'finalize_attempt');
  });
});

Deno.test('repository returns the latest preview session by package version for capability log lookup', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (
        await repository.registerPackageVersion(
          await buildImportedPackageVersion({ version: '0.5.0' }),
        )
      ).id,
      reviewNotes: 'Approved for preview capability-log lookup.',
    });

    await repository.createPreviewSession({
      sessionId: 'preview-session-oldest',
      packageVersionId: approvedRecord.id,
      appId: approvedRecord.appId,
      packageVersion: approvedRecord.version,
      packageTitle: approvedRecord.title,
      capabilities: approvedRecord.capabilities,
      snapshotRoot: approvedRecord.artifact.snapshotRoot,
      entrypointPath: approvedRecord.artifact.entrypointPath,
      launch: {
        userId: 'preview-user-old',
        userRole: 'learner',
        courseId: 'preview-course-42',
        assignmentId: null,
        activityId: 'preview-activity-9',
      },
      fakeAttemptId: 'preview-attempt-old',
      fakeScoreMaximum: 100,
      fixtureData: {
        launch: {
          user_role: 'learner',
          course_id: 'preview-course-42',
          assignment_id: null,
          activity_id: 'preview-activity-9',
        },
        attempt_id: 'preview-attempt-old',
        local_state: null,
      },
      createdAt: '2026-03-25T01:00:00Z',
    });

    const latestCreated = await repository.createPreviewSession({
      sessionId: 'preview-session-latest',
      packageVersionId: approvedRecord.id,
      appId: approvedRecord.appId,
      packageVersion: approvedRecord.version,
      packageTitle: approvedRecord.title,
      capabilities: approvedRecord.capabilities,
      snapshotRoot: approvedRecord.artifact.snapshotRoot,
      entrypointPath: approvedRecord.artifact.entrypointPath,
      launch: {
        userId: 'preview-user-new',
        userRole: 'instructor',
        courseId: 'preview-course-42',
        assignmentId: null,
        activityId: 'preview-activity-9',
      },
      fakeAttemptId: 'preview-attempt-new',
      fakeScoreMaximum: 100,
      fixtureData: {
        launch: {
          user_role: 'instructor',
          course_id: 'preview-course-42',
          assignment_id: null,
          activity_id: 'preview-activity-9',
        },
        attempt_id: 'preview-attempt-new',
        local_state: null,
      },
      createdAt: '2026-03-25T01:01:00Z',
    });

    const latest = await repository.getLatestPreviewSessionByPackageVersion(approvedRecord.id);

    assertEquals(latest?.sessionId, latestCreated.sessionId);
    assertEquals(latest?.launch.userRole, 'instructor');
  });
});

Deno.test('repository rejects preview writes that reference missing sessions or package versions', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    await assertRejects(
      () =>
        repository.createPreviewSession({
          sessionId: 'preview-session-missing-package',
          packageVersionId: 999_999,
          appId: 'chapter-4-asteroids',
          packageVersion: '0.9.9',
          packageTitle: 'Missing package version',
          capabilities: [],
          snapshotRoot: 'var/packages/chapter-4-asteroids/0.9.9',
          entrypointPath: 'var/packages/chapter-4-asteroids/0.9.9/dist/index.html',
          launch: {
            userId: 'preview-user-123',
            userRole: 'learner',
            courseId: 'preview-course-42',
            assignmentId: null,
            activityId: 'preview-activity-9',
          },
          fakeAttemptId: 'preview-attempt-missing',
          fakeScoreMaximum: 100,
          fixtureData: {
            launch: {
              user_role: 'learner',
              course_id: 'preview-course-42',
              assignment_id: null,
              activity_id: 'preview-activity-9',
            },
            attempt_id: 'preview-attempt-missing',
            local_state: null,
          },
          createdAt: '2026-03-25T01:07:00Z',
        }),
      Error,
      'Package version id 999999 was not found.',
    );

    await assertRejects(
      () =>
        repository.appendPreviewEvidence({
          previewSessionId: 'preview-session-missing',
          eventType: 'preview.launch',
          capability: null,
          summary: 'Should fail because session does not exist.',
          detail: { code: 'missing_preview_session' },
          occurredAt: '2026-03-25T01:07:30Z',
        }),
      Error,
      'Preview session preview-session-missing was not found.',
    );
  });
});
