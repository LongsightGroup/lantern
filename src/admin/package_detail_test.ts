import { assertEquals, assertStringIncludes } from '@std/assert';
import { renderPackageDetailPage } from './package_detail.ts';
import {
  buildAccessibilityReview,
  buildPackageVersionRecord,
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
  assertStringIncludes(body, 'What this app can access');
  assertStringIncludes(body, 'Finish attempt');
  assertStringIncludes(body, 'Save progress');
  assertStringIncludes(body, 'Automatic scoring');
  assertStringIncludes(body, 'Show access notes, saved files, and manifest JSON');
  assertStringIncludes(body, 'capability-chip-basic');
  assertEquals(body.includes('Extra review'), false);
  assertEquals(body.includes('Stores submitted evidence'), false);
});

Deno.test('renderPackageDetailPage explains the approval decision for higher-access actions and saved file details', () => {
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

  assertStringIncludes(body, 'Extra review');
  assertStringIncludes(
    body,
    'This version asks for capabilities beyond ordinary progress, resume, and completion tracking.',
  );
  assertStringIncludes(
    body,
    'Lantern keeps this version from going live until review is complete.',
  );
  assertStringIncludes(body, 'Anonymous evidence return');
  assertStringIncludes(body, 'Finish attempt');
  assertStringIncludes(body, 'Stores submitted evidence');
  assertStringIncludes(body, 'callout-review');
  assertStringIncludes(body, 'capability-risk-chip');
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
