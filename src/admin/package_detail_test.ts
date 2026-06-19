import { assertEquals, assertStringIncludes } from '@std/assert';
import { renderPackageDetailPage } from './package_detail.ts';
import {
  buildAccessibilityReview,
  buildPackageVersionRecord,
  buildPreviewEvidenceRecord,
  buildPreviewSessionRecord,
} from '../test_helpers/package_review.ts';

Deno.test('renderPackageDetailPage shows status, exact version, owner, and access details above the fold', () => {
  const pendingVersion = buildPackageVersionRecord();
  const body = renderPackageDetailPage({
    packageVersion: pendingVersion,
    history: [pendingVersion],
  });

  assertStringIncludes(body, 'Pending review');
  assertStringIncludes(body, 'Version 0.1.0');
  assertStringIncludes(body, 'instructor_123');
  assertStringIncludes(body, 'What it can do');
  assertStringIncludes(body, 'Standard learning activity');
  assertStringIncludes(
    body,
    'Expected LMS-style features for participation, resume, and completion tracking.',
  );
  assertStringIncludes(body, 'Attempt completion');
  assertStringIncludes(body, 'Save resumable progress');
  assertStringIncludes(body, 'Normal learning telemetry');
  assertStringIncludes(body, 'Blocked by Lantern');
  assertStringIncludes(body, 'direct grade-write authority');
  assertStringIncludes(body, 'Automatic scoring');
  assertStringIncludes(body, 'Reviewed scoring rules');
  assertStringIncludes(body, 'Affects grades');
  assertStringIncludes(body, 'Show access notes, saved files, and manifest JSON');
  assertEquals(body.includes('Extra review'), false);
  assertEquals(body.includes('Sensitive learner evidence'), false);
});

Deno.test('renderPackageDetailPage gives pending reviewers changes, launch, runtime, and safety context', () => {
  const previousVersion = buildPackageVersionRecord({
    id: 1,
    version: '0.1.0',
    approvalStatus: 'approved',
    reviewedAt: '2026-05-15T12:00:00.000Z',
  });
  const pendingVersion = buildPackageVersionRecord({
    id: 2,
    version: '0.2.0',
    approvalStatus: 'pending',
  });
  const previewSession = buildPreviewSessionRecord({
    sessionId: 'preview-session-review',
    packageVersionId: pendingVersion.id,
    appId: pendingVersion.appId,
    packageVersion: pendingVersion.version,
    packageTitle: pendingVersion.title,
    launch: {
      userId: 'preview-user',
      userRole: 'learner',
      courseId: 'review-course',
      assignmentId: 'review-assignment',
      activityId: 'review-activity',
    },
  });
  const body = renderPackageDetailPage({
    packageVersion: pendingVersion,
    history: [pendingVersion, previousVersion],
    latestPreviewSession: previewSession,
    previewEvidence: [
      buildPreviewEvidenceRecord({
        previewSessionId: previewSession.sessionId,
        eventType: 'preview.launch',
        summary: "Started a test launch in Lantern's runtime.",
      }),
      buildPreviewEvidenceRecord({
        id: 2,
        sequence: 2,
        previewSessionId: previewSession.sessionId,
        eventType: 'preview.attempt_event',
        capability: 'submit_attempt_event',
        summary: 'Recorded a review progress event.',
      }),
    ],
  });

  assertStringIncludes(body, 'Review before approval');
  assertStringIncludes(body, 'What changed');
  assertStringIncludes(body, 'Version 0.2.0 is pending review against previous version 0.1.0.');
  assertStringIncludes(
    body,
    'Capability changes since approved version 0.1.0: no capability changes.',
  );
  assertStringIncludes(body, 'Unchanged');
  assertStringIncludes(body, '/admin/packages/chapter-4-asteroids/versions/0.2.0/diff');
  assertStringIncludes(body, 'Open review test launch');
  assertStringIncludes(body, 'Latest review test launch preview-session-review');
  assertStringIncludes(body, 'Runtime log');
  assertStringIncludes(body, 'Received app progress update');
  assertStringIncludes(body, 'submit_attempt_event');
  assertStringIncludes(body, 'Why this is safe');
  assertStringIncludes(body, 'raw LMS tokens');
  assertStringIncludes(body, 'direct storage');
  assertStringIncludes(body, 'direct grade writes');
});

Deno.test('renderPackageDetailPage treats first pending version as a full capability baseline review', () => {
  const pendingVersion = buildPackageVersionRecord({
    id: 10,
    version: '0.1.0',
    approvalStatus: 'pending',
    capabilities: ['read_launch_context', 'read_activity_content', 'finalize_attempt'],
  });
  const body = renderPackageDetailPage({
    packageVersion: pendingVersion,
    history: [pendingVersion],
  });

  assertStringIncludes(body, 'Capability baseline: no previously approved version exists.');
  assertStringIncludes(body, 'Declared for first approval');
  assertStringIncludes(body, 'Launch context');
  assertStringIncludes(body, 'Reviewed app content');
  assertStringIncludes(body, 'Attempt completion');
});

Deno.test('renderPackageDetailPage highlights added sensitive capabilities against the previous approved version', () => {
  const previousVersion = buildPackageVersionRecord({
    id: 20,
    version: '0.1.0',
    approvalStatus: 'approved',
    reviewedAt: '2026-05-15T12:00:00.000Z',
    capabilities: ['read_launch_context', 'read_activity_content', 'finalize_attempt'],
  });
  const pendingVersion = buildPackageVersionRecord({
    id: 21,
    version: '0.2.0',
    approvalStatus: 'pending',
    capabilities: [
      'read_launch_context',
      'read_activity_content',
      'submit_evidence_artifact',
      'finalize_attempt',
    ],
  });
  const body = renderPackageDetailPage({
    packageVersion: pendingVersion,
    history: [pendingVersion, previousVersion],
  });

  assertStringIncludes(body, 'Capability changes since approved version 0.1.0.');
  assertStringIncludes(body, 'Added');
  assertStringIncludes(body, 'Submitted evidence artifacts');
  assertStringIncludes(body, 'Sensitive learner evidence');
  assertStringIncludes(
    body,
    'Review impact: this version newly requests Submitted evidence artifacts.',
  );
  assertStringIncludes(body, 'Confirm the assignment purpose, evidence or grading flow');
});

Deno.test('renderPackageDetailPage shows removed capabilities against the previous approved version', () => {
  const previousVersion = buildPackageVersionRecord({
    id: 30,
    version: '0.1.0',
    approvalStatus: 'approved',
    reviewedAt: '2026-05-15T12:00:00.000Z',
    capabilities: [
      'read_launch_context',
      'read_activity_content',
      'read_local_state',
      'write_local_state',
      'finalize_attempt',
    ],
  });
  const pendingVersion = buildPackageVersionRecord({
    id: 31,
    version: '0.2.0',
    approvalStatus: 'pending',
    capabilities: ['read_launch_context', 'read_activity_content', 'finalize_attempt'],
  });
  const body = renderPackageDetailPage({
    packageVersion: pendingVersion,
    history: [pendingVersion, previousVersion],
  });

  assertStringIncludes(body, 'Removed');
  assertStringIncludes(body, 'Resume saved progress');
  assertStringIncludes(body, 'Save resumable progress');
  assertStringIncludes(body, 'Added: none.');
});

Deno.test('renderPackageDetailPage ignores newer approved versions when reviewing an older pending version', () => {
  const newerApprovedVersion = buildPackageVersionRecord({
    id: 40,
    version: '0.3.0',
    approvalStatus: 'approved',
    reviewedAt: '2026-06-15T12:00:00.000Z',
    importedAt: '2026-06-14T12:00:00.000Z',
    capabilities: [
      'read_launch_context',
      'read_activity_content',
      'submit_evidence_artifact',
      'finalize_attempt',
    ],
  });
  const pendingVersion = buildPackageVersionRecord({
    id: 41,
    version: '0.2.0',
    approvalStatus: 'pending',
    importedAt: '2026-06-01T12:00:00.000Z',
    capabilities: [
      'read_launch_context',
      'read_activity_content',
      'submit_evidence_artifact',
      'finalize_attempt',
    ],
  });
  const olderApprovedVersion = buildPackageVersionRecord({
    id: 42,
    version: '0.1.0',
    approvalStatus: 'approved',
    reviewedAt: '2026-05-15T12:00:00.000Z',
    importedAt: '2026-05-14T12:00:00.000Z',
    capabilities: ['read_launch_context', 'read_activity_content', 'finalize_attempt'],
  });
  const body = renderPackageDetailPage({
    packageVersion: pendingVersion,
    history: [newerApprovedVersion, pendingVersion, olderApprovedVersion],
  });

  assertStringIncludes(body, 'Capability changes since approved version 0.1.0.');
  assertStringIncludes(body, 'Submitted evidence artifacts');
  assertStringIncludes(body, 'Sensitive learner evidence');
});

Deno.test('renderPackageDetailPage distinguishes ordinary progress from sensitive evidence and saved file details', () => {
  const reviewedVersion = buildPackageVersionRecord({
    approvalStatus: 'approved',
    capabilities: [
      'read_launch_context',
      'read_activity_content',
      'submit_attempt_event',
      'submit_evidence_artifact',
      'finalize_attempt',
      'read_local_state',
      'write_local_state',
    ],
    reviewNotes: 'Ready for the pilot deployment.',
    accessibilityReview: buildAccessibilityReview({
      contrast: 'fail',
      reducedMotion: 'fail',
      failureNotes: 'Motion-heavy celebration still needs a reduced-motion path.',
      exceptionNote: 'Keyboard-only pilot approved for early classroom review.',
    }),
    reviewedAt: '2026-03-23T18:05:00Z',
  });
  const body = renderPackageDetailPage({
    packageVersion: reviewedVersion,
    history: [reviewedVersion],
  });

  assertStringIncludes(body, 'Standard learning activity');
  assertStringIncludes(body, 'Participation and progress');
  assertStringIncludes(body, 'Normal learning telemetry');
  assertStringIncludes(body, 'Resume saved progress');
  assertStringIncludes(body, 'Sensitive review items');
  assertStringIncludes(body, 'These can affect grading or store learner-submitted evidence.');
  assertStringIncludes(body, 'Submitted evidence artifacts');
  assertStringIncludes(body, 'Sensitive learner evidence');
  assertStringIncludes(body, 'Sensitive evidence');
  assertStringIncludes(body, 'Purpose');
  assertStringIncludes(body, 'Data scope');
  assertStringIncludes(body, 'Retention');
  assertStringIncludes(body, 'Sensitivity');
  assertStringIncludes(body, 'the generated app cannot write directly to the LMS gradebook');
  assertStringIncludes(body, 'capability-classification-sensitive');
  assertStringIncludes(body, 'Saved files');
  assertStringIncludes(body, 'Ready for the pilot deployment.');
  assertStringIncludes(body, 'Flagged review');
  assertStringIncludes(body, 'Failed checks: Contrast, Reduced motion.');
  assertStringIncludes(body, 'Keyboard-only pilot approved for early classroom review.');
  assertEquals(body.includes('/admin/packages/1/approve'), false);
});

Deno.test('renderPackageDetailPage keeps older reviewed versions explicit when structured accessibility evidence is missing', () => {
  const reviewedVersion = buildPackageVersionRecord({
    approvalStatus: 'approved',
    reviewNotes: 'Approved before the accessibility checklist existed.',
    reviewedAt: '2026-03-23T18:05:00Z',
  });
  const body = renderPackageDetailPage({
    packageVersion: reviewedVersion,
    history: [reviewedVersion],
  });

  assertStringIncludes(body, 'Accessibility review missing');
  assertStringIncludes(
    body,
    'This version was reviewed before Lantern required structured accessibility evidence.',
  );
  assertStringIncludes(body, 'Review missing');
});
