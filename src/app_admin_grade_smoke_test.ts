import { assertEquals } from '@std/assert';
import { runGradeSmokeVerification } from './app_admin_grade_smoke_support.ts';
import {
  buildFinalGradeLineItemSpec,
  buildSmokeVerificationLineItemSpec,
} from './runtime/gateway_publication_support.ts';
import {
  buildAttemptRecord,
  buildPackageVersionRecord,
  buildRuntimeSessionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { buildSmokeFixture } from './app_admin_grade_smoke_test_support.ts';

Deno.test('grade smoke scaffolding seeds one blessed Moodle smoke line item identity', () => {
  const fixture = buildSmokeFixture('moodle');

  assertEquals(fixture.binding.lms, 'moodle');
  assertEquals(
    buildSmokeVerificationLineItemSpec({
      appId: 'chapter-4-asteroids',
      appTitle: fixture.appTitle,
      lms: fixture.binding.lms,
    }),
    fixture.expectedSmokeLineItem,
  );
});

Deno.test('grade smoke scaffolding seeds one blessed Sakai smoke line item identity', () => {
  const fixture = buildSmokeFixture('sakai');

  assertEquals(fixture.binding.lms, 'sakai');
  assertEquals(
    buildSmokeVerificationLineItemSpec({
      appId: 'chapter-4-asteroids',
      appTitle: fixture.appTitle,
      lms: fixture.binding.lms,
    }),
    fixture.expectedSmokeLineItem,
  );
});

Deno.test('runtime final-grade publication keeps a managed final-grade line item identity', () => {
  const session = buildRuntimeSessionRecord();
  const packageVersion = buildPackageVersionRecord();

  assertEquals(
    buildFinalGradeLineItemSpec({
      session,
      packageVersion,
      scoreMaximum: 100,
    }),
    {
      resourceId: 'lantern:chapter-4-asteroids:0.1.0:activity-123',
      tag: 'final-grade',
      label: 'Chapter 4 Asteroids Final Grade',
      scoreMaximum: 100,
    },
  );
});

Deno.test('grade smoke verification requires a verified lti-tool session', async () => {
  const fixture = buildSmokeFixture('moodle');
  const repository = createInMemoryPackageReviewRepository({});
  const attempt = buildAttemptRecord({
    attemptId: fixture.session.attemptId,
    deploymentRecordId: fixture.session.deploymentRecordId,
    deploymentSlug: fixture.session.deploymentSlug,
    contextId: fixture.session.launch.courseId,
    activityId: fixture.session.launch.activityId,
  });

  const result = await runGradeSmokeVerification({
    repository,
    appTitle: fixture.appTitle,
    binding: fixture.binding,
    session: {
      ...fixture.session,
      ltiToolSessionId: null,
    },
    attempt,
    getLtiToolContext: () => {
      throw new Error('Should not load lti-tool context without a session id.');
    },
  });

  assertEquals(result.status, 'failed');
  assertEquals(result.detail.publicationStatus, 'not_attempted');
  assertEquals(result.detail.error?.code, 'lti_session_missing');
});
