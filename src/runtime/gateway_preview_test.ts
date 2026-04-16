import { assertEquals, assertRejects } from '@std/assert';
import { acceptAttemptEvent, finalizeRuntimeAttempt } from './gateway.ts';
import { RuntimeBrokerDenialError } from './gateway_errors.ts';
import { buildRuntimeSessionRecord } from '../test_helpers/lti.ts';
import {
  buildAttemptEventRecord,
  buildAttemptEvidenceArtifactRecord,
  buildAttemptRecord,
  buildPackageVersionRecord,
  buildPreviewSessionRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';
import {
  FILE_SYSTEM_RUNTIME_ARTIFACT_STORE,
  getReferenceAppSnapshotRoot,
  TEST_RUNTIME_ENV,
  withFetchStub,
} from './gateway_test_helpers.ts';

const WEB_CHECKUP_SNAPSHOT_ROOT = 'examples/apps/web-checkup';

Deno.test('preview gateway finalize returns fake scoring and never calls Canvas side-effect services', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        grading: {
          mode: 'declarative',
          rubricFile: '/scoring/rubric.json',
          maxScore: 100,
        },
      }),
    ],
    previewSessions: [
      buildPreviewSessionRecord({
        sessionId: 'preview-session-finalize-fake',
        fakeAttemptId: 'preview-attempt-123',
        fakeScoreMaximum: 42,
      }),
    ],
    attempts: [
      buildAttemptRecord({
        attemptId: 'preview-attempt-123',
        deploymentRecordId: 0,
      }),
    ],
    attemptEvents: [
      buildAttemptEventRecord({
        attemptId: 'preview-attempt-123',
        event: {
          type: 'complete',
          timestamp: '2026-03-24T02:31:00Z',
        },
      }),
    ],
  });
  const session = buildRuntimeSessionRecord({
    attemptId: 'preview-attempt-123',
    deploymentRecordId: 0,
    deploymentSlug: 'chapter-4-asteroids-preview',
    services: {
      ags: null,
      nrps: null,
    },
    preview: {
      previewSessionId: 'preview-session-finalize-fake',
    },
  });

  await withFetchStub(
    () => {
      throw new Error('Canvas fetch should not be called for preview finalize.');
    },
    async () => {
      const result = await finalizeRuntimeAttempt({
        repository,
        session,
        payload: {
          completionState: 'completed',
        },
        env: TEST_RUNTIME_ENV,
        artifactStore: FILE_SYSTEM_RUNTIME_ARTIFACT_STORE,
        now: () => new Date('2026-03-24T02:35:00Z'),
      });

      assertEquals(result.finalizedNow, true);
      assertEquals(result.score, {
        scoreGiven: 0,
        scoreMaximum: 42,
      });
      assertEquals(result.lineItemBinding, null);
      assertEquals(result.gradePublication, null);
      assertEquals(result.gradePublishedNow, false);
      assertEquals(result.publishError, null);
    },
  );
});

Deno.test('preview gateway enforces declared capabilities and records bounded blocked-capability evidence', async () => {
  const repository = createInMemoryPackageReviewRepository({
    previewSessions: [
      buildPreviewSessionRecord({
        sessionId: 'preview-session-capability-block',
        capabilities: ['read_launch_context'],
      }),
    ],
    attempts: [
      buildAttemptRecord({
        attemptId: 'preview-attempt-123',
        deploymentRecordId: 0,
      }),
    ],
  });
  const session = buildRuntimeSessionRecord({
    attemptId: 'preview-attempt-123',
    deploymentRecordId: 0,
    deploymentSlug: 'chapter-4-asteroids-preview',
    capabilities: ['read_launch_context'],
    services: {
      ags: null,
      nrps: null,
    },
    preview: {
      previewSessionId: 'preview-session-capability-block',
    },
  });

  const error = (await assertRejects(
    () =>
      acceptAttemptEvent({
        repository,
        session,
        payload: {
          type: 'answer',
          questionId: 'q1',
          answer: 'asteroid',
          timestamp: '2026-03-24T02:30:00Z',
        },
        now: () => new Date('2026-03-24T02:31:00Z'),
      }),
    RuntimeBrokerDenialError,
  )) as RuntimeBrokerDenialError;

  assertEquals(error.category, 'policyDenied');
  assertEquals(error.code, 'capability_not_granted');

  assertEquals(await repository.listAttemptEvents('preview-attempt-123'), []);
  const evidence = await repository.listPreviewEvidence('preview-session-capability-block');
  assertEquals(evidence.length, 1);
  assertEquals(evidence[0]?.eventType, 'preview.attempt_event.blocked');
  assertEquals(evidence[0]?.capability, 'submit_attempt_event');
});

Deno.test('preview gateway records allowed quick-study attempt events through the governed runtime seam', async () => {
  const snapshotRoot = getReferenceAppSnapshotRoot('quick-study');
  const repository = createInMemoryPackageReviewRepository({
    previewSessions: [
      buildPreviewSessionRecord({
        sessionId: 'preview-session-quick-study-allowed',
        appId: 'quick-study',
        packageTitle: 'Quick Study',
        capabilities: [
          'read_launch_context',
          'read_activity_content',
          'submit_attempt_event',
          'read_local_state',
          'write_local_state',
          'finalize_attempt',
        ],
        snapshotRoot,
        entrypointPath: `${snapshotRoot}/dist/index.html`,
        contentPath: '/content/activity.json',
        launch: {
          userId: 'preview-user-quick-study',
          userRole: 'learner',
          courseId: 'course_demo',
          assignmentId: 'assignment_demo',
          activityId: 'quick-study',
        },
        fixtureData: {
          launch: {
            user_role: 'learner',
            course_id: 'course_demo',
            assignment_id: 'assignment_demo',
            activity_id: 'quick-study',
          },
          attempt_id: 'attempt_demo_2',
          local_state: null,
        },
      }),
    ],
    attempts: [
      buildAttemptRecord({
        attemptId: 'preview-attempt-123',
        deploymentRecordId: 0,
        deploymentSlug: 'quick-study-preview',
        appId: 'quick-study',
        activityId: 'quick-study',
      }),
    ],
  });
  const session = buildRuntimeSessionRecord({
    attemptId: 'preview-attempt-123',
    deploymentRecordId: 0,
    deploymentSlug: 'quick-study-preview',
    appId: 'quick-study',
    snapshotRoot,
    entrypointPath: `${snapshotRoot}/dist/index.html`,
    contentPath: `${snapshotRoot}/content/activity.json`,
    capabilities: [
      'read_launch_context',
      'read_activity_content',
      'submit_attempt_event',
      'read_local_state',
      'write_local_state',
      'finalize_attempt',
    ],
    services: {
      ags: null,
      nrps: null,
    },
    launch: {
      userRole: 'learner',
      courseId: 'course_demo',
      assignmentId: 'assignment_demo',
      activityId: 'quick-study',
      submissionMode: 'standard',
    },
    preview: {
      previewSessionId: 'preview-session-quick-study-allowed',
    },
  });

  const appended = await acceptAttemptEvent({
    repository,
    session,
    payload: {
      type: 'progress',
      checkpoint: 'card-1',
      value: 1,
      timestamp: '2026-04-05T14:10:00Z',
    },
    now: () => new Date('2026-04-05T14:10:01Z'),
  });

  assertEquals(appended.eventType, 'progress');
  assertEquals((await repository.listAttemptEvents('preview-attempt-123')).length, 1);
  const evidence = await repository.listPreviewEvidence('preview-session-quick-study-allowed');
  assertEquals(evidence.length, 1);
  assertEquals(evidence[0]?.eventType, 'preview.attempt_event');
  assertEquals(evidence[0]?.capability, 'submit_attempt_event');
});

Deno.test('preview gateway blocks live-service finalize paths clearly and records failure evidence', async () => {
  const repository = createInMemoryPackageReviewRepository({
    previewSessions: [
      buildPreviewSessionRecord({
        sessionId: 'preview-session-live-service-block',
        fakeAttemptId: 'preview-attempt-123',
      }),
    ],
    packageVersions: [buildPackageVersionRecord()],
    attempts: [
      buildAttemptRecord({
        attemptId: 'preview-attempt-123',
        deploymentRecordId: 0,
      }),
    ],
  });
  const session = buildRuntimeSessionRecord({
    attemptId: 'preview-attempt-123',
    deploymentRecordId: 0,
    deploymentSlug: 'chapter-4-asteroids-preview',
    preview: {
      previewSessionId: 'preview-session-live-service-block',
    },
  });

  const error = (await assertRejects(
    () =>
      finalizeRuntimeAttempt({
        repository,
        session,
        payload: {
          completionState: 'completed',
        },
        env: TEST_RUNTIME_ENV,
        artifactStore: FILE_SYSTEM_RUNTIME_ARTIFACT_STORE,
        now: () => new Date('2026-03-24T02:35:00Z'),
      }),
    RuntimeBrokerDenialError,
  )) as RuntimeBrokerDenialError;

  assertEquals(error.category, 'policyDenied');
  assertEquals(error.code, 'preview_live_side_effects_blocked');

  const evidence = await repository.listPreviewEvidence('preview-session-live-service-block');
  assertEquals(evidence.length, 1);
  assertEquals(evidence[0]?.eventType, 'preview.finalize.blocked');
  assertEquals(evidence[0]?.capability, 'finalize_attempt');
});

Deno.test('preview gateway records browser grader evidence instead of fake scoring for browser-graded packages', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        appId: 'web-checkup',
        title: 'Web Checkup',
        capabilities: [
          'read_launch_context',
          'read_activity_content',
          'submit_attempt_event',
          'submit_evidence_artifact',
          'finalize_attempt',
        ],
        grading: {
          mode: 'browser',
          rubricFile: null,
          maxScore: 100,
        },
        manifestJson: {
          app_id: 'web-checkup',
          version: '0.1.0',
          title: 'Web Checkup',
          grading: {
            mode: 'browser',
            max_score: 100,
          },
          authoring: {
            kind: 'browser_autograder',
            grader_spec_files: [
              '/grading/specs/structure.spec.js',
              '/grading/specs/behavior.spec.js',
            ],
            evidence_example_file: '/evidence/example-output.json',
          },
        },
        artifact: {
          snapshotRoot: WEB_CHECKUP_SNAPSHOT_ROOT,
          manifestPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/manifest.json`,
          entrypointPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/dist/index.html`,
          digest: 'sha256:web-checkup-snapshot',
        },
      }),
    ],
    previewSessions: [
      buildPreviewSessionRecord({
        sessionId: 'preview-session-browser-grading',
        appId: 'web-checkup',
        packageTitle: 'Web Checkup',
        fakeAttemptId: 'preview-attempt-123',
      }),
    ],
    attempts: [
      buildAttemptRecord({
        attemptId: 'preview-attempt-123',
        deploymentRecordId: 0,
        deploymentSlug: 'web-checkup-preview',
        appId: 'web-checkup',
      }),
    ],
    attemptEvidenceArtifacts: [
      buildAttemptEvidenceArtifactRecord({
        artifactId: 'artifact-001',
        attemptId: 'preview-attempt-123',
        kind: 'structured_json',
        fileName: 'submission.json',
      }),
    ],
  });
  const session = buildRuntimeSessionRecord({
    attemptId: 'preview-attempt-123',
    deploymentRecordId: 0,
    deploymentSlug: 'web-checkup-preview',
    appId: 'web-checkup',
    snapshotRoot: WEB_CHECKUP_SNAPSHOT_ROOT,
    entrypointPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/dist/index.html`,
    contentPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/content/activity.json`,
    capabilities: [
      'read_launch_context',
      'read_activity_content',
      'submit_attempt_event',
      'submit_evidence_artifact',
      'finalize_attempt',
    ],
    services: {
      ags: null,
      nrps: null,
    },
    preview: {
      previewSessionId: 'preview-session-browser-grading',
    },
  });

  await withFetchStub(
    () => {
      throw new Error('Canvas fetch should not be called for preview finalize.');
    },
    async () => {
      const result = await finalizeRuntimeAttempt({
        repository,
        session,
        payload: {
          completionState: 'completed',
          browserGraderResult: {
            scoreGiven: 100,
            scoreMaximum: 100,
            specResults: [
              {
                source: '/grading/specs/structure.spec.js',
                result: 'passed',
                failures: [],
              },
              {
                source: '/grading/specs/behavior.spec.js',
                result: 'passed',
                failures: [],
              },
            ],
          },
        },
        env: TEST_RUNTIME_ENV,
        artifactStore: FILE_SYSTEM_RUNTIME_ARTIFACT_STORE,
        now: () => new Date('2026-04-08T18:10:00Z'),
      });

      assertEquals(result.score, {
        scoreGiven: 100,
        scoreMaximum: 100,
      });
      assertEquals(result.evidenceArtifacts.length, 1);
      assertEquals(result.evidenceArtifacts[0]?.artifactId, 'artifact-001');
      const evidence = await repository.listPreviewEvidence('preview-session-browser-grading');

      assertEquals(evidence.length, 1);
      assertEquals(evidence[0]?.eventType, 'preview.finalize');
      assertEquals(evidence[0]?.detail.evidenceArtifactCount, 1);
      assertEquals(
        (
          evidence[0]?.detail.browserGraderResult as {
            specResults: Array<{ source: string }>;
          }
        ).specResults.map((entry) => entry.source),
        ['/grading/specs/structure.spec.js', '/grading/specs/behavior.spec.js'],
      );
      assertEquals(
        (evidence[0]?.detail.evidenceArtifacts as Array<{ artifactId: string }>)[0]?.artifactId,
        'artifact-001',
      );
    },
  );
});
