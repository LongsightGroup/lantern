import { assertEquals, assertStringIncludes } from '@std/assert';
import { restoreEnv, withFetchStub } from './admin/deployment_detail_test_helpers.ts';
import { runGradeSmokeVerification } from './app_admin_grade_smoke_support.ts';
import type { EnsureLineItemInput } from './lti/services.ts';
import {
  buildFinalGradeLineItemSpec,
  buildSmokeVerificationLineItemSpec,
  ensureManagedLineItem,
  requestAccessToken,
} from './runtime/gateway_publication_support.ts';
import {
  buildAttemptRecord,
  buildPackageVersionRecord,
  buildRuntimeSessionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { getTestToolPrivateJwkEnvValue } from './test_helpers/lti.ts';
import { buildSmokeFixture, buildSmokeRouteFixture } from './app_admin_grade_smoke_test_support.ts';

const TEST_ENV = {
  get(name: string): string | undefined {
    return name === 'LTI_TOOL_PRIVATE_JWK' ? getTestToolPrivateJwkEnvValue() : undefined;
  },
};

Deno.test('grade smoke scaffolding seeds one blessed Moodle smoke path with a dedicated smoke line item identity', () => {
  const fixture = buildSmokeFixture('moodle');

  assertEquals(fixture.binding.lms, 'moodle');
  assertEquals(
    fixture.session.services.ags?.lineitemsUrl,
    'https://moodle.example/mod/lti/services.php/2/lineitems',
  );
  assertEquals(
    fixture.expectedSmokeLineItem.resourceId,
    'lantern:chapter-4-asteroids:moodle:smoke',
  );
  assertEquals(fixture.expectedSmokeLineItem.tag, 'smoke-verification');
  assertEquals(fixture.expectedSmokeLineItem.scoreMaximum, 1);
});

Deno.test('grade smoke scaffolding seeds one blessed Sakai smoke path with a dedicated smoke line item identity', () => {
  const fixture = buildSmokeFixture('sakai');

  assertEquals(fixture.binding.lms, 'sakai');
  assertEquals(
    fixture.session.services.ags?.lineitemsUrl,
    'https://sakai.example/direct/lti/lineitems/course-42/items',
  );
  assertEquals(fixture.expectedSmokeLineItem.resourceId, 'lantern:chapter-4-asteroids:sakai:smoke');
  assertEquals(fixture.expectedSmokeLineItem.tag, 'smoke-verification');
  assertEquals(fixture.expectedSmokeLineItem.scoreMaximum, 1);
});

Deno.test('grade smoke verification uses the shared AGS helper to create or reuse a dedicated smoke line item', async () => {
  const moodleFixture = buildSmokeFixture('moodle');
  const sakaiFixture = buildSmokeFixture('sakai');
  const requests: Array<{
    resourceId: string;
    tag: string;
    label: string;
    scoreMaximum: number;
    lineitemsUrl: string | null;
  }> = [];

  const moodleResult = await ensureManagedLineItem({
    accessToken: 'moodle-access-token',
    ags: moodleFixture.session.services.ags!,
    resourceLinkId: 'resource-link-123',
    spec: buildSmokeVerificationLineItemSpec({
      appId: 'chapter-4-asteroids',
      appTitle: moodleFixture.appTitle,
      lms: moodleFixture.binding.lms,
    }),
    ensureLineItemFn: (input: EnsureLineItemInput) => {
      requests.push({
        resourceId: input.resourceId,
        tag: input.tag,
        label: input.label,
        scoreMaximum: input.scoreMaximum,
        lineitemsUrl: input.lineitemsUrl,
      });

      return Promise.resolve({
        lineItemsUrl: input.lineitemsUrl!,
        lineItemUrl: 'https://moodle.example/mod/lti/services.php/2/lineitems/9',
        resourceId: input.resourceId,
        tag: input.tag,
        label: input.label,
        scoreMaximum: input.scoreMaximum,
        created: true,
      });
    },
  });

  const sakaiResult = await ensureManagedLineItem({
    accessToken: 'sakai-access-token',
    ags: sakaiFixture.session.services.ags!,
    resourceLinkId: 'resource-link-123',
    spec: buildSmokeVerificationLineItemSpec({
      appId: 'chapter-4-asteroids',
      appTitle: sakaiFixture.appTitle,
      lms: sakaiFixture.binding.lms,
    }),
    ensureLineItemFn: (input: EnsureLineItemInput) => {
      requests.push({
        resourceId: input.resourceId,
        tag: input.tag,
        label: input.label,
        scoreMaximum: input.scoreMaximum,
        lineitemsUrl: input.lineitemsUrl,
      });

      return Promise.resolve({
        lineItemsUrl: input.lineitemsUrl!,
        lineItemUrl: 'https://sakai.example/direct/lti/lineitems/course-42/items/9',
        resourceId: input.resourceId,
        tag: input.tag,
        label: input.label,
        scoreMaximum: input.scoreMaximum,
        created: false,
      });
    },
  });

  assertEquals(moodleResult.created, true);
  assertEquals(sakaiResult.created, false);
  assertEquals(requests[0], {
    resourceId: moodleFixture.expectedSmokeLineItem.resourceId,
    tag: 'smoke-verification',
    label: 'Chapter 4 Asteroids Smoke Verification',
    scoreMaximum: 1,
    lineitemsUrl: 'https://moodle.example/mod/lti/services.php/2/lineitems',
  });
  assertEquals(requests[1], {
    resourceId: sakaiFixture.expectedSmokeLineItem.resourceId,
    tag: 'smoke-verification',
    label: 'Chapter 4 Asteroids Smoke Verification',
    scoreMaximum: 1,
    lineitemsUrl: 'https://sakai.example/direct/lti/lineitems/course-42/items',
  });
});

Deno.test('grade smoke verification records a bounded token failure without reusing the learner final-grade line item', async () => {
  const fixture = buildSmokeFixture('moodle');
  const result = await requestAccessToken({
    scope: fixture.session.services.ags!.scope,
    binding: fixture.binding,
    lineItemBinding: null,
    env: TEST_ENV,
    requestToken: () => Promise.reject(new Error('simulated token failure')),
  });

  if (typeof result === 'string') {
    throw new TypeError('Expected smoke token failure details.');
  }

  assertEquals(result.publishError?.code, 'token_request_failed');
  assertEquals(result.publishError?.detail.issuer, fixture.binding.issuer);
  assertEquals(result.publishError?.detail.deploymentId, fixture.binding.deploymentId);
  assertEquals(JSON.stringify(result.publishError?.detail ?? {}).includes('final-grade'), false);
});

Deno.test('runtime final-grade publication stays on the same shared managed line-item helper path', async () => {
  const session = buildRuntimeSessionRecord();
  const packageVersion = buildPackageVersionRecord();
  const requests: Array<{
    resourceId: string;
    tag: string;
    label: string;
    scoreMaximum: number;
  }> = [];

  const result = await ensureManagedLineItem({
    accessToken: 'canvas-access-token',
    ags: session.services.ags!,
    resourceLinkId: 'resource-link-123',
    spec: buildFinalGradeLineItemSpec({
      session,
      packageVersion,
      scoreMaximum: 100,
    }),
    ensureLineItemFn: (input: EnsureLineItemInput) => {
      requests.push({
        resourceId: input.resourceId,
        tag: input.tag,
        label: input.label,
        scoreMaximum: input.scoreMaximum,
      });

      return Promise.resolve({
        lineItemsUrl: input.lineitemsUrl!,
        lineItemUrl: input.lineitemUrl ?? 'https://canvas.example/api/lti/courses/42/line_items/9',
        resourceId: input.resourceId,
        tag: input.tag,
        label: input.label,
        scoreMaximum: input.scoreMaximum,
        created: false,
      });
    },
  });

  assertEquals(result.created, false);
  assertEquals(requests, [
    {
      resourceId: 'lantern:chapter-4-asteroids:0.1.0:activity-123',
      tag: 'final-grade',
      label: 'Chapter 4 Asteroids Final Grade',
      scoreMaximum: 100,
    },
  ]);
});

Deno.test('grade smoke verification retries one AGS 401 only when governed compatibility allows the saved service retry path', async () => {
  const previousToolKey = Deno.env.get('LTI_TOOL_PRIVATE_JWK');
  const fixture = buildSmokeRouteFixture('moodle');
  const repository = createInMemoryPackageReviewRepository({});
  const attempt = buildAttemptRecord({
    attemptId: fixture.attemptId,
    deploymentRecordId: fixture.deploymentId,
    deploymentSlug: fixture.deploymentSlug,
    contextId: fixture.session.launch.courseId,
    activityId: fixture.session.launch.activityId,
  });
  const scoreAuthorizations: string[] = [];
  let tokenRequests = 0;

  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());

  try {
    const result = await withFetchStub(
      (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const headers = new Headers(init?.headers);

        if (url === fixture.binding.accessTokenUrl) {
          tokenRequests += 1;

          return new Response(
            JSON.stringify({
              access_token: `moodle-access-token-${tokenRequests}`,
              token_type: 'bearer',
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        }

        if (url === fixture.session.services.ags?.lineitemsUrl && method === 'GET') {
          return new Response(
            JSON.stringify([
              {
                id: fixture.smokeLineItemUrl,
                resourceLinkId: attempt.resourceLinkId,
                resourceId: fixture.expectedSmokeLineItem.resourceId,
                tag: fixture.expectedSmokeLineItem.tag,
                label: fixture.expectedSmokeLineItem.label,
                scoreMaximum: fixture.expectedSmokeLineItem.scoreMaximum,
              },
            ]),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        }

        if (url === `${fixture.smokeLineItemUrl}/scores` && method === 'POST') {
          scoreAuthorizations.push(headers.get('authorization') ?? '');

          if (headers.get('authorization') === 'Bearer moodle-access-token-1') {
            return new Response(null, { status: 401 });
          }

          return new Response('{}', {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          });
        }

        throw new Error(`Unexpected smoke request ${method} ${url}`);
      },
      async () =>
        await runGradeSmokeVerification({
          repository,
          appTitle: fixture.appTitle,
          binding: fixture.binding,
          session: fixture.session,
          attempt,
          env: TEST_ENV,
          ltiProfile: {
            id: 'governedCompatibility',
            source: 'lanternDefault',
            deploymentRecordId: fixture.deploymentId,
          },
        }),
    );
    const interopEvents = await repository.listAuditEventsByEventType('interop.path_used');

    assertEquals(result.status, 'succeeded');
    assertEquals(tokenRequests, 2);
    assertEquals(scoreAuthorizations, [
      'Bearer moodle-access-token-1',
      'Bearer moodle-access-token-2',
    ]);
    assertEquals(interopEvents.length, 1);
    assertEquals(interopEvents[0]?.detail.path, 'service_401_retry');
    assertEquals(interopEvents[0]?.detail.ltiProfileId, 'governedCompatibility');
  } finally {
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousToolKey);
  }
});

Deno.test('grade smoke verification does not record service retry evidence when no AGS retry path runs', async () => {
  const previousToolKey = Deno.env.get('LTI_TOOL_PRIVATE_JWK');
  const fixture = buildSmokeRouteFixture('moodle');
  const repository = createInMemoryPackageReviewRepository({});
  const attempt = buildAttemptRecord({
    attemptId: fixture.attemptId,
    deploymentRecordId: fixture.deploymentId,
    deploymentSlug: fixture.deploymentSlug,
    contextId: fixture.session.launch.courseId,
    activityId: fixture.session.launch.activityId,
  });
  let tokenRequests = 0;

  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());

  try {
    const result = await withFetchStub(
      (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === fixture.binding.accessTokenUrl) {
          tokenRequests += 1;

          return new Response(
            JSON.stringify({
              access_token: 'moodle-access-token-1',
              token_type: 'bearer',
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        }

        if (url === fixture.session.services.ags?.lineitemsUrl && method === 'GET') {
          return new Response(
            JSON.stringify([
              {
                id: fixture.smokeLineItemUrl,
                resourceLinkId: attempt.resourceLinkId,
                resourceId: fixture.expectedSmokeLineItem.resourceId,
                tag: fixture.expectedSmokeLineItem.tag,
                label: fixture.expectedSmokeLineItem.label,
                scoreMaximum: fixture.expectedSmokeLineItem.scoreMaximum,
              },
            ]),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        }

        if (url === `${fixture.smokeLineItemUrl}/scores` && method === 'POST') {
          return new Response('{}', {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          });
        }

        throw new Error(`Unexpected smoke request ${method} ${url}`);
      },
      async () =>
        await runGradeSmokeVerification({
          repository,
          appTitle: fixture.appTitle,
          binding: fixture.binding,
          session: fixture.session,
          attempt,
          env: TEST_ENV,
          ltiProfile: {
            id: 'governedCompatibility',
            source: 'lanternDefault',
            deploymentRecordId: fixture.deploymentId,
          },
        }),
    );
    const interopEvents = await repository.listAuditEventsByEventType('interop.path_used');

    assertEquals(result.status, 'succeeded');
    assertEquals(tokenRequests, 1);
    assertEquals(interopEvents.length, 0);
  } finally {
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousToolKey);
  }
});

Deno.test('grade smoke verification fails on AGS 401 without retry when certification disables the saved service retry path', async () => {
  const previousToolKey = Deno.env.get('LTI_TOOL_PRIVATE_JWK');
  const fixture = buildSmokeRouteFixture('moodle');
  const repository = createInMemoryPackageReviewRepository({});
  const attempt = buildAttemptRecord({
    attemptId: fixture.attemptId,
    deploymentRecordId: fixture.deploymentId,
    deploymentSlug: fixture.deploymentSlug,
    contextId: fixture.session.launch.courseId,
    activityId: fixture.session.launch.activityId,
  });
  const scoreAuthorizations: string[] = [];
  let tokenRequests = 0;

  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());

  try {
    const result = await withFetchStub(
      (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const headers = new Headers(init?.headers);

        if (url === fixture.binding.accessTokenUrl) {
          tokenRequests += 1;

          return new Response(
            JSON.stringify({
              access_token: 'moodle-access-token-1',
              token_type: 'bearer',
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        }

        if (url === fixture.session.services.ags?.lineitemsUrl && method === 'GET') {
          return new Response(
            JSON.stringify([
              {
                id: fixture.smokeLineItemUrl,
                resourceLinkId: attempt.resourceLinkId,
                resourceId: fixture.expectedSmokeLineItem.resourceId,
                tag: fixture.expectedSmokeLineItem.tag,
                label: fixture.expectedSmokeLineItem.label,
                scoreMaximum: fixture.expectedSmokeLineItem.scoreMaximum,
              },
            ]),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        }

        if (url === `${fixture.smokeLineItemUrl}/scores` && method === 'POST') {
          scoreAuthorizations.push(headers.get('authorization') ?? '');
          return new Response(null, { status: 401 });
        }

        throw new Error(`Unexpected smoke request ${method} ${url}`);
      },
      async () =>
        await runGradeSmokeVerification({
          repository,
          appTitle: fixture.appTitle,
          binding: fixture.binding,
          session: fixture.session,
          attempt,
          env: TEST_ENV,
          ltiProfile: {
            id: 'certification',
            source: 'lanternDefault',
            deploymentRecordId: fixture.deploymentId,
          },
        }),
    );
    const interopEvents = await repository.listAuditEventsByEventType('interop.path_used');

    assertEquals(result.status, 'failed');
    assertEquals(result.detail.publicationStatus, 'failed');
    assertEquals(result.detail.error?.code, 'score_publish_failed');
    assertStringIncludes(result.detail.error?.message ?? '', 'status 401');
    assertEquals(tokenRequests, 1);
    assertEquals(scoreAuthorizations, ['Bearer moodle-access-token-1']);
    assertEquals(interopEvents.length, 0);
  } finally {
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousToolKey);
  }
});
