import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import { restoreEnv, withFetchStub } from './admin/deployment_detail_test_helpers.ts';
import { getTestToolPrivateJwkEnvValue } from './test_helpers/lti.ts';
import { createTestLtiToolContext } from './test_helpers/lti_tool_context.ts';
import {
  buildSmokeRouteFixture,
  buildSmokeVerificationFormData,
  createSmokeRouteRepository,
  createSuccessfulSmokeFetchHandler,
} from './app_admin_grade_smoke_test_support.ts';

Deno.test('POST /admin/packages/:appId/deployment/verify-grade-smoke runs the Moodle grade-return check and records deployment-scoped evidence', async () => {
  const previousToolKey = Deno.env.get('LTI_TOOL_PRIVATE_JWK');
  const fixture = buildSmokeRouteFixture('moodle');
  const repository = createSmokeRouteRepository(fixture);
  const requestedUrls: string[] = [];
  const ltiToolContext = createTestLtiToolContext({
    sessionId: fixture.session.ltiToolSessionId ?? 'missing-lti-tool-session',
    lineItemUrl: fixture.smokeLineItemUrl,
  });
  const formData = buildSmokeVerificationFormData(fixture);
  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());
  await repository.saveLanternDefaultLtiProfile({
    defaultLtiProfile: 'certification',
  });

  try {
    await withFetchStub(createSuccessfulSmokeFetchHandler(fixture, requestedUrls), async () => {
      const response = await createApp({
        getRepository: () => repository,
        getLtiToolContext: () => Promise.resolve(ltiToolContext.context),
      }).request(
        'http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-grade-smoke',
        {
          method: 'POST',
          headers: {
            Origin: 'http://localhost',
          },
          body: formData,
        },
      );

      assertEquals(response.status, 303);
      assertEquals(
        response.headers.get('location'),
        '/admin/packages/chapter-4-asteroids/deployment?lms=moodle#slot-panel',
      );

      const auditEvents = await repository.listAuditEventsByEventType(
        'deployment.ags_smoke_verified',
      );

      assertEquals(auditEvents.length, 1);
      assertEquals(auditEvents[0]?.status, 'succeeded');
      assertEquals(auditEvents[0]?.deploymentRecordId, fixture.deploymentId);
      assertEquals(auditEvents[0]?.detail.lms, 'moodle');
      assertEquals(auditEvents[0]?.detail.agsCapable, true);
      assertEquals(auditEvents[0]?.detail.publicationStatus, 'succeeded');
      assertEquals(auditEvents[0]?.detail.ltiProfileId, 'certification');
      assertEquals(auditEvents[0]?.detail.ltiProfileSource, 'lanternDefault');
      assertEquals(auditEvents[0]?.detail.lineItemUrl, fixture.smokeLineItemUrl);
      assertEquals(requestedUrls.includes(`POST ${fixture.finalGradeLineItemUrl}/scores`), false);
    });
  } finally {
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousToolKey);
  }
});

Deno.test('POST /admin/packages/:appId/deployment/verify-grade-smoke records bounded deployment-scoped failure evidence when lti-tool score publish fails', async () => {
  const previousToolKey = Deno.env.get('LTI_TOOL_PRIVATE_JWK');
  const fixture = buildSmokeRouteFixture('moodle');
  const repository = createSmokeRouteRepository(fixture);
  const ltiToolContext = createTestLtiToolContext({
    sessionId: fixture.session.ltiToolSessionId ?? 'missing-lti-tool-session',
    submitScoreSuccess: false,
    submitScoreMessage: 'simulated score failure',
  });
  const formData = buildSmokeVerificationFormData(fixture);
  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());

  try {
    await withFetchStub(
      (input) => {
        throw new Error(`Unexpected smoke request GET ${String(input)}`);
      },
      async () => {
        const response = await createApp({
          getRepository: () => repository,
          getLtiToolContext: () => Promise.resolve(ltiToolContext.context),
        }).request(
          'http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-grade-smoke',
          {
            method: 'POST',
            headers: {
              Origin: 'http://localhost',
            },
            body: formData,
          },
        );
        const body = await response.text();

        assertEquals(response.status, 500);
        assertStringIncludes(body, 'Grade return check failed');

        const auditEvents = await repository.listAuditEventsByEventType(
          'deployment.ags_smoke_verified',
        );
        const errorDetail = (auditEvents[0]?.detail.error ?? null) as {
          code?: string;
          message?: string;
        } | null;

        assertEquals(auditEvents.length, 1);
        assertEquals(auditEvents[0]?.status, 'failed');
        assertEquals(auditEvents[0]?.detail.lms, 'moodle');
        assertEquals(auditEvents[0]?.detail.agsCapable, true);
        assertEquals(auditEvents[0]?.detail.publicationStatus, 'failed');
        assertEquals(errorDetail?.code, 'score_publish_failed');
        assertEquals(errorDetail?.message, 'simulated score failure');
        assertEquals(JSON.stringify(auditEvents[0]?.detail ?? {}).includes('final-grade'), false);
      },
    );
  } finally {
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousToolKey);
  }
});

Deno.test('deployment smoke verification renders the latest Moodle result back on the existing deployment detail page', async () => {
  const previousToolKey = Deno.env.get('LTI_TOOL_PRIVATE_JWK');
  const fixture = buildSmokeRouteFixture('moodle');
  const repository = createSmokeRouteRepository(fixture, {
    includeControlPlaneDetail: true,
  });
  const ltiToolContext = createTestLtiToolContext({
    sessionId: fixture.session.ltiToolSessionId ?? 'missing-lti-tool-session',
    lineItemUrl: fixture.smokeLineItemUrl,
  });
  const formData = buildSmokeVerificationFormData(fixture);
  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());

  try {
    await withFetchStub(createSuccessfulSmokeFetchHandler(fixture), async () => {
      const postResponse = await createApp({
        getRepository: () => repository,
        getLtiToolContext: () => Promise.resolve(ltiToolContext.context),
      }).request(
        'http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-grade-smoke',
        {
          method: 'POST',
          headers: {
            Origin: 'http://localhost',
          },
          body: formData,
        },
      );

      assertEquals(postResponse.status, 303);

      const getResponse = await createApp({
        getRepository: () => repository,
      }).request('http://localhost/admin/packages/chapter-4-asteroids/deployment?lms=moodle');
      const body = await getResponse.text();

      assertEquals(getResponse.status, 200);
      assertStringIncludes(body, 'Latest grade return check');
      assertStringIncludes(body, 'Grade return access');
      assertStringIncludes(body, fixture.smokeLineItemUrl);
      assertStringIncludes(body, 'Run grade return check');
    });
  } finally {
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousToolKey);
  }
});
