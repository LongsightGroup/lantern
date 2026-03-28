import { assertEquals } from '@std/assert';
import { createApp } from './app.ts';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { restoreEnv, withFetchStub } from './app_test_support.ts';

Deno.test('GET /admin/packages/:appId/deployment/register/sakai completes dynamic registration and saves the Sakai binding', async () => {
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

        if (url === 'https://sakai.example/imsblis/lti13/well_known') {
          return new Response(
            JSON.stringify({
              issuer: 'https://sakai.example',
              authorization_endpoint: 'https://sakai.example/imsoidc/lti13/oidc_auth',
              token_endpoint: 'https://sakai.example/imsblis/lti13/token/91',
              jwks_uri: 'https://sakai.example/imsblis/lti13/keyset',
              registration_endpoint: 'https://sakai.example/imsblis/lti13/registration_endpoint/91',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        if (url === 'https://sakai.example/imsblis/lti13/registration_endpoint/91') {
          return new Response(
            JSON.stringify({
              client_id: '7dbe6a13-f948-498c-87d7-768947ac5c56',
              'https://purl.imsglobal.org/spec/lti-tool-configuration': {
                deployment_id: '1',
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
          openid_configuration: 'https://sakai.example/imsblis/lti13/well_known',
          registration_token: 'registration-123',
        });
        const response = await app.request(
          `http://localhost/admin/packages/chapter-4-asteroids/deployment/register/sakai?${params.toString()}`,
        );

        assertEquals(response.status, 303);
        assertEquals(
          response.headers.get('location'),
          '/admin/packages/chapter-4-asteroids/deployment?lms=sakai&registered=sakai#slot-panel',
        );
      },
    );

    assertEquals(requests.length, 2);
    assertEquals(requests[0]?.method, 'GET');
    assertEquals(requests[1]?.url, 'https://sakai.example/imsblis/lti13/registration_endpoint/91');
    assertEquals(requests[1]?.method, 'POST');
    assertEquals(requests[1]?.authorization, 'Bearer registration-123');

    const registrationRequest = JSON.parse(requests[1]?.body ?? 'null') as {
      initiate_login_uri: string;
      jwks_uri: string;
      redirect_uris: string[];
    };
    assertEquals(registrationRequest.initiate_login_uri, 'http://localhost:8417/lti/login');
    assertEquals(registrationRequest.jwks_uri, 'http://localhost:8417/lti/jwks.json');
    assertEquals(registrationRequest.redirect_uris, ['http://localhost:8417/lti/launch']);

    const deployment = await repository.getDeploymentBySlug('chapter-4-asteroids-sakai');
    const binding = deployment?.binding;
    assertEquals(binding?.lms, 'sakai');

    if (binding?.lms !== 'sakai') {
      throw new Error('Expected the Sakai binding to be saved.');
    }

    assertEquals(binding.issuer, 'https://sakai.example');
    assertEquals(binding.clientId, '7dbe6a13-f948-498c-87d7-768947ac5c56');
    assertEquals(binding.deploymentId, '1');
    assertEquals(binding.authorizationEndpoint, 'https://sakai.example/imsoidc/lti13/oidc_auth');
    assertEquals(binding.accessTokenUrl, 'https://sakai.example/imsblis/lti13/token/91');
    assertEquals(binding.jwksUrl, 'https://sakai.example/imsblis/lti13/keyset');

    const auditEvents = await repository.listAuditEventsByEventType('deployment.binding_saved');
    assertEquals(auditEvents.length, 1);
    assertEquals(auditEvents[0]?.detail.lms, 'sakai');
    assertEquals(auditEvents[0]?.detail.registrationMode, 'dynamic');
  } finally {
    restoreEnv('APP_ORIGIN', previousOrigin);
  }
});
