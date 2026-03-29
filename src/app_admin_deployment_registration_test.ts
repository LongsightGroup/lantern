import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { restoreEnv, withFetchStub } from './app_test_support.ts';

Deno.test('GET /admin/packages/:appId/deployment/register/canvas saves a pending Canvas registration and returns a Canvas close page', async () => {
  const previousOrigin = Deno.env.get('APP_ORIGIN');
  Deno.env.set('APP_ORIGIN', 'http://localhost:8417');

  try {
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [
        buildPackageVersionRecord({
          id: 5,
          approvalStatus: 'approved',
          reviewNotes: 'Ready for pilot.',
          reviewedAt: '2026-03-23T18:05:00Z',
        }),
      ],
    });
    const app = createApp({ getRepository: () => repository });
    const requests: Array<{
      url: string;
      method: string;
      authorization: string | null;
      body: string | null;
    }> = [];

    await withFetchStub(
      (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        requests.push({
          url,
          method: init?.method ?? 'GET',
          authorization: new Headers(init?.headers).get('authorization'),
          body: typeof init?.body === 'string' ? init.body : null,
        });

        if (url === 'https://canvas.instructure.com/api/lti/security/openid-configuration') {
          return new Response(
            JSON.stringify({
              issuer: 'https://canvas.instructure.com',
              authorization_endpoint: 'https://sso.canvaslms.com/api/lti/authorize_redirect',
              registration_endpoint: 'https://canvas.instructure.com/api/lti/registrations',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        if (url === 'https://canvas.instructure.com/api/lti/registrations') {
          return new Response(
            JSON.stringify({
              client_id: 'canvas-client-777',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        throw new Error(`Unexpected fetch ${url}`);
      },
      async () => {
        const params = new URLSearchParams({
          openid_configuration:
            'https://canvas.instructure.com/api/lti/security/openid-configuration',
          registration_token: 'registration-123',
        });
        const response = await app.request(
          `http://localhost/admin/packages/chapter-4-asteroids/deployment/register/canvas?${params.toString()}`,
        );

        assertEquals(response.status, 200);
        const body = await response.text();
        assertStringIncludes(body, 'Canvas setup saved');
        assertStringIncludes(body, 'Close and return to Canvas');
        assertStringIncludes(body, 'org.imsglobal.lti.close');
        assertStringIncludes(
          body,
          '/admin/packages/chapter-4-asteroids/deployment?lms=canvas&amp;registered=canvas#slot-panel',
        );
      },
    );

    assertEquals(requests.length, 2);
    assertEquals(requests[0]?.method, 'GET');
    assertEquals(requests[0]?.authorization, 'Bearer registration-123');
    assertEquals(requests[1]?.url, 'https://canvas.instructure.com/api/lti/registrations');
    assertEquals(requests[1]?.method, 'POST');
    assertEquals(requests[1]?.authorization, 'Bearer registration-123');

    const registrationRequest = JSON.parse(requests[1]?.body ?? 'null') as {
      initiate_login_uri: string;
      jwks_uri: string;
      redirect_uris: string[];
      scope: string;
      'https://purl.imsglobal.org/spec/lti-tool-configuration': {
        messages: Array<{ type: string; placements: string[] }>;
      };
    };
    assertEquals(registrationRequest.initiate_login_uri, 'http://localhost:8417/lti/login');
    assertEquals(registrationRequest.jwks_uri, 'http://localhost:8417/lti/jwks.json');
    assertEquals(registrationRequest.redirect_uris, [
      'http://localhost:8417/lti/launch',
      'http://localhost:8417/lti/deep-linking',
    ]);
    assertEquals(
      registrationRequest.scope,
      'https://purl.imsglobal.org/spec/lti-ags/scope/score https://purl.imsglobal.org/spec/lti-ags/scope/lineitem https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
    );
    assertEquals(
      registrationRequest['https://purl.imsglobal.org/spec/lti-tool-configuration'].messages[0]
        ?.placements,
      ['course_navigation'],
    );

    const deployment = await repository.getDeploymentBySlug('chapter-4-asteroids-pilot');
    assertEquals(deployment?.lmsType, 'canvas');
    assertEquals(deployment?.binding, null);

    const auditEvents = await repository.listAuditEventsByEventType('deployment.binding_saved');
    assertEquals(auditEvents.length, 1);
    assertEquals(auditEvents[0]?.detail.lms, 'canvas');
    assertEquals(auditEvents[0]?.detail.registrationMode, 'dynamic');
    assertEquals(auditEvents[0]?.detail.clientId, 'canvas-client-777');
    assertEquals(auditEvents[0]?.detail.deploymentId, null);
  } finally {
    restoreEnv('APP_ORIGIN', previousOrigin);
  }
});
