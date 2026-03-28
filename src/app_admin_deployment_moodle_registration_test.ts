import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { restoreEnv, withFetchStub } from './app_test_support.ts';

Deno.test('GET /admin/packages/:appId/deployment/register/moodle completes dynamic registration and returns a Moodle close page', async () => {
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

        if (url === 'https://moodle.example/mod/lti/openid-configuration.php') {
          return new Response(
            JSON.stringify({
              issuer: 'https://moodle.example',
              authorization_endpoint: 'https://moodle.example/mod/lti/auth.php',
              token_endpoint: 'https://moodle.example/mod/lti/token.php',
              jwks_uri: 'https://moodle.example/mod/lti/certs.php',
              registration_endpoint: 'https://moodle.example/mod/lti/openid-registration.php',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        if (url === 'https://moodle.example/mod/lti/openid-registration.php') {
          return new Response(
            JSON.stringify({
              client_id: 'moodle-client-777',
              'https://purl.imsglobal.org/spec/lti-tool-configuration': {
                deployment_id: 'moodle-deployment-777',
              },
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
          openid_configuration: 'https://moodle.example/mod/lti/openid-configuration.php',
          registration_token: 'registration-123',
        });
        const response = await app.request(
          `http://localhost/admin/packages/chapter-4-asteroids/deployment/register/moodle?${params.toString()}`,
        );

        assertEquals(response.status, 200);
        const body = await response.text();
        assertStringIncludes(body, 'Moodle binding saved');
        assertStringIncludes(body, 'Close and return to Moodle');
        assertStringIncludes(body, 'org.imsglobal.lti.close');
        assertStringIncludes(
          body,
          '/admin/packages/chapter-4-asteroids/deployment?lms=moodle#slot-panel',
        );
      },
    );

    assertEquals(requests.length, 2);
    assertEquals(requests[1]?.url, 'https://moodle.example/mod/lti/openid-registration.php');
    assertEquals(requests[1]?.method, 'POST');
    assertEquals(requests[1]?.authorization, 'Bearer registration-123');

    const registrationRequest = JSON.parse(requests[1]?.body ?? 'null') as {
      initiate_login_uri: string;
      jwks_uri: string;
      redirect_uris: string[];
      scope: string;
      'https://purl.imsglobal.org/spec/lti-tool-configuration': {
        messages: unknown[];
      };
    };
    assertEquals(registrationRequest.initiate_login_uri, 'http://localhost:8417/lti/login');
    assertEquals(registrationRequest.jwks_uri, 'http://localhost:8417/lti/jwks.json');
    assertEquals(registrationRequest.redirect_uris, ['http://localhost:8417/lti/launch']);
    assertEquals(
      registrationRequest.scope,
      'https://purl.imsglobal.org/spec/lti-ags/scope/score https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly https://purl.imsglobal.org/spec/lti-ags/scope/lineitem https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
    );
    assertEquals(
      registrationRequest['https://purl.imsglobal.org/spec/lti-tool-configuration'].messages,
      [],
    );

    const deployment = await repository.getDeploymentBySlug('chapter-4-asteroids-moodle');
    const binding = deployment?.binding;
    assertEquals(binding?.lms, 'moodle');

    if (binding?.lms !== 'moodle') {
      throw new Error('Expected the Moodle binding to be saved.');
    }

    assertEquals(binding.issuer, 'https://moodle.example');
    assertEquals(binding.clientId, 'moodle-client-777');
    assertEquals(binding.deploymentId, 'moodle-deployment-777');
    assertEquals(binding.authorizationEndpoint, 'https://moodle.example/mod/lti/auth.php');
    assertEquals(binding.accessTokenUrl, 'https://moodle.example/mod/lti/token.php');
    assertEquals(binding.jwksUrl, 'https://moodle.example/mod/lti/certs.php');

    const auditEvents = await repository.listAuditEventsByEventType('deployment.binding_saved');
    assertEquals(auditEvents.length, 1);
    assertEquals(auditEvents[0]?.detail.lms, 'moodle');
    assertEquals(auditEvents[0]?.detail.registrationMode, 'dynamic');
  } finally {
    restoreEnv('APP_ORIGIN', previousOrigin);
  }
});
