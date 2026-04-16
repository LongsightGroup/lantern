import { assertEquals, assertStringIncludes } from '@std/assert';
import { renderPreviewPage } from './preview_page.ts';
import {
  buildPackageVersionRecord,
  buildPreviewEvidenceRecord,
  buildPreviewSessionRecord,
} from '../test_helpers/package_review.ts';

Deno.test('renderPreviewPage shows saved defaults, editable launch fields, and empty test activity', () => {
  const packageVersion = buildPackageVersionRecord({
    id: 11,
    appId: 'chapter-4-asteroids',
    version: '0.3.0',
    title: 'Chapter 4 Asteroids',
    approvalStatus: 'approved',
    reviewedAt: '2026-03-25T00:00:00Z',
  });
  const previewSession = buildPreviewSessionRecord({
    packageVersionId: packageVersion.id,
    appId: packageVersion.appId,
    packageVersion: packageVersion.version,
    packageTitle: packageVersion.title,
    launch: {
      userId: 'preview-user-123',
      userRole: 'instructor',
      courseId: 'preview-course-42',
      assignmentId: 'preview-assignment-7',
      activityId: 'preview-activity-9',
    },
  });

  const body = renderPreviewPage({
    packageVersion,
    savedDefaults: previewSession,
    latestSession: null,
    formValues: {
      userRole: 'learner',
      courseId: 'course-run-7',
      assignmentId: '',
      activityId: 'activity-run-9',
    },
    previewEvidence: [],
  });

  assertStringIncludes(body, 'Test Launch');
  assertStringIncludes(body, 'Chapter 4 Asteroids');
  assertStringIncludes(body, 'Version 0.3.0');
  assertStringIncludes(body, 'Defaults as Instructor in course');
  assertStringIncludes(body, 'preview-course-42');
  assertStringIncludes(body, 'preview-activity-9');
  assertStringIncludes(body, 'name="userRole"');
  assertStringIncludes(body, 'value="course-run-7"');
  assertStringIncludes(body, 'Student');
  assertStringIncludes(body, 'action="/admin/packages/chapter-4-asteroids/versions/0.3.0/preview"');
  assertStringIncludes(body, 'preview-launch-stack');
  assertStringIncludes(body, 'preview-launch-form');
  assertEquals(body.includes('<div class="two-column">'), false);
  assertEquals(body.includes('Edit before launch'), false);
  assertEquals(body.includes('Reviewed package'), false);
  assertEquals(
    body.includes('Use the saved defaults below, or change them before starting.'),
    false,
  );
  assertEquals(body.includes('Choose the LMS role to simulate.'), false);
  assertEquals(
    body.includes(
      "Starting a test launch records test activity here and opens the app in Lantern's runtime.",
    ),
    false,
  );
  assertStringIncludes(body, 'Start test launch');
  assertStringIncludes(body, 'Show reviewed runtime capabilities');
  assertStringIncludes(body, 'Recent test activity');
  assertStringIncludes(
    body,
    'No test activity has been recorded yet. Start a test launch to open the app.',
  );
});

Deno.test('renderPreviewPage shows durable test activity evidence in capability log timeline', () => {
  const packageVersion = buildPackageVersionRecord({
    id: 11,
    appId: 'chapter-4-asteroids',
    version: '0.3.0',
    title: 'Chapter 4 Asteroids',
    approvalStatus: 'approved',
    reviewedAt: '2026-03-25T00:00:00Z',
  });
  const previewSession = buildPreviewSessionRecord({
    sessionId: 'preview-session-123',
    packageVersionId: packageVersion.id,
    appId: packageVersion.appId,
    packageVersion: packageVersion.version,
    packageTitle: packageVersion.title,
  });
  const previewEvidence = [
    buildPreviewEvidenceRecord({
      previewSessionId: previewSession.sessionId,
      eventType: 'preview.launch',
      summary: "Started a test launch in Lantern's runtime.",
      detail: {
        runtimeSessionId: 'preview-runtime-123',
      },
    }),
    buildPreviewEvidenceRecord({
      id: 2,
      sequence: 2,
      previewSessionId: previewSession.sessionId,
      eventType: 'preview.evidence_artifact',
      capability: 'submit_evidence_artifact',
      summary: 'Stored an anonymous evidence artifact in the test session.',
      detail: {
        artifactId: 'artifact-001',
        kind: 'structured_json',
        fileName: 'submission.json',
      },
    }),
    buildPreviewEvidenceRecord({
      id: 3,
      sequence: 3,
      previewSessionId: previewSession.sessionId,
      eventType: 'preview.finalize',
      capability: 'finalize_attempt',
      summary: 'Finished the test attempt with simulated scoring and no LMS writes.',
      detail: {
        scoreGiven: 0,
        scoreMaximum: 100,
      },
    }),
  ];

  const body = renderPreviewPage({
    packageVersion,
    savedDefaults: previewSession,
    latestSession: previewSession,
    formValues: {
      userRole: previewSession.launch.userRole,
      courseId: previewSession.launch.courseId,
      assignmentId: previewSession.launch.assignmentId ?? '',
      activityId: previewSession.launch.activityId,
    },
    previewEvidence,
  });

  assertStringIncludes(body, 'Latest session');
  assertStringIncludes(body, 'preview-session-123');
  assertStringIncludes(body, 'ran as Instructor in course');
  assertStringIncludes(body, 'Started test launch');
  assertStringIncludes(body, 'Stored anonymous evidence');
  assertStringIncludes(body, 'Finished test attempt');
  assertStringIncludes(body, 'preview.launch');
  assertStringIncludes(body, 'preview.evidence_artifact');
  assertStringIncludes(body, 'preview.finalize');
  assertStringIncludes(
    body,
    '/admin/packages/chapter-4-asteroids/deployment/evidence/artifact-001',
  );
  assertStringIncludes(body, 'finalize_attempt');
  assertStringIncludes(body, 'Finished the test attempt with simulated scoring and no LMS writes.');
});

Deno.test('renderPreviewPage renders screenshot evidence as supplemental on the existing activity timeline', () => {
  const packageVersion = buildPackageVersionRecord({
    id: 11,
    appId: 'chapter-4-asteroids',
    version: '0.3.0',
    title: 'Chapter 4 Asteroids',
    approvalStatus: 'approved',
    reviewedAt: '2026-03-25T00:00:00Z',
  });
  const previewSession = buildPreviewSessionRecord({
    sessionId: 'preview-session-456',
    packageVersionId: packageVersion.id,
    appId: packageVersion.appId,
    packageVersion: packageVersion.version,
    packageTitle: packageVersion.title,
  });
  const body = renderPreviewPage({
    packageVersion,
    savedDefaults: previewSession,
    latestSession: previewSession,
    formValues: {
      userRole: previewSession.launch.userRole,
      courseId: previewSession.launch.courseId,
      assignmentId: previewSession.launch.assignmentId ?? '',
      activityId: previewSession.launch.activityId,
    },
    previewEvidence: [
      buildPreviewEvidenceRecord({
        previewSessionId: previewSession.sessionId,
        eventType: 'preview.evidence_artifact',
        capability: 'submit_evidence_artifact',
        summary: 'Stored an anonymous evidence artifact in the test session.',
        detail: {
          artifactId: 'artifact-002',
          kind: 'screenshot_png',
          contentType: 'image/png',
          fileName: 'submission.png',
          byteSize: 2048,
          sha256: 'sha256:artifact-002',
        },
      }),
    ],
  });

  assertStringIncludes(body, 'Supplemental screenshot evidence');
  assertStringIncludes(body, 'not exhaustive proof of learner behavior');
  assertStringIncludes(body, '<img');
  assertStringIncludes(
    body,
    '/admin/packages/chapter-4-asteroids/deployment/evidence/artifact-002',
  );
  assertStringIncludes(body, 'submission.png');
});
