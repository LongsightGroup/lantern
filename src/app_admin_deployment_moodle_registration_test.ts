import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { restoreEnv, withFetchStub } from './app_test_support.ts';
import { getTestToolPrivateJwkEnvValue, TEST_LTI_STATE_SECRET } from './test_helpers/lti.ts';

const TOOL_CONFIGURATION_CLAIM = 'https://purl.imsglobal.org/spec/lti-tool-configuration';

Deno.test('GET /admin/packages/:appId/deployment/register/moodle completes automatic setup and returns a Moodle close page', async () => {
  const previousOrigin = Deno.env.get('APP_ORIGIN');
  const previousJwk = Deno.env.get('LTI_TOOL_PRIVATE_JWK');
  const previousStateSecret = Deno.env.get('LTI_STATE_SECRET');
  Deno.env.set('APP_ORIGIN', 'http://localhost:8417');
  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());
  Deno.env.set('LTI_STATE_SECRET', TEST_LTI_STATE_SECRET);

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
    const registrationState = await repository.createDynamicRegistrationState({
      state: 'moodle-registration-state-123',
      appId: 'chapter-4-asteroids',
      lms: 'moodle',
      createdAt: '2030-03-24T00:00:00Z',
      expiresAt: '2030-03-24T00:30:00Z',
      usedAt: null,
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
            JSON.stringify(buildMoodleOpenIdConfiguration()),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        if (url === 'https://moodle.example/mod/lti/openid-registration.php') {
          const payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          return new Response(
            JSON.stringify(
              buildRegistrationResponse(payload, 'moodle-client-777', 'moodle-deployment-777'),
            ),
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
          state: registrationState.state,
          openid_configuration: 'https://moodle.example/mod/lti/openid-configuration.php',
          registration_token: 'registration-123',
        });
        const response = await app.request(
          `http://localhost/admin/packages/chapter-4-asteroids/deployment/register/moodle?${params.toString()}`,
        );

        assertEquals(response.status, 200);
        const body = await response.text();
        assertStringIncludes(body, 'Moodle connection saved');
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
        messages: Array<Record<string, unknown>>;
      };
    };
    assertEquals(registrationRequest.initiate_login_uri, 'http://localhost:8417/lti/login');
    assertEquals(registrationRequest.jwks_uri, 'http://localhost:8417/lti/jwks.json');
    assertEquals(
      registrationRequest.redirect_uris.includes('http://localhost:8417/lti/launch'),
      true,
    );
    assertEquals(registrationRequest.scope.includes('lti-ags/scope/score'), true);
    assertEquals(registrationRequest[TOOL_CONFIGURATION_CLAIM].messages.length > 0, true);

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
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousJwk);
    restoreEnv('LTI_STATE_SECRET', previousStateSecret);
  }
});

function buildMoodleOpenIdConfiguration(): Record<string, unknown> {
  return {
    issuer: 'https://moodle.example',
    authorization_endpoint: 'https://moodle.example/mod/lti/auth.php',
    token_endpoint: 'https://moodle.example/mod/lti/token.php',
    jwks_uri: 'https://moodle.example/mod/lti/certs.php',
    registration_endpoint: 'https://moodle.example/mod/lti/openid-registration.php',
    token_endpoint_auth_methods_supported: ['private_key_jwt'],
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    scopes_supported: [
      'https://purl.imsglobal.org/spec/lti-ags/scope/score',
      'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
      'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
      'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
      'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
    ],
    response_types_supported: ['id_token'],
    id_token_signing_alg_values_supported: ['RS256'],
    claims_supported: ['iss', 'sub', 'name', 'email'],
    subject_types_supported: ['public'],
    'https://purl.imsglobal.org/spec/lti-platform-configuration': {
      product_family_code: 'moodle',
      version: '4',
      messages_supported: [{ type: 'LtiDeepLinkingRequest' }],
    },
  };
}

function buildRegistrationResponse(
  payload: Record<string, unknown>,
  clientId: string,
  deploymentId: string,
): Record<string, unknown> {
  return {
    ...payload,
    client_id: clientId,
    [TOOL_CONFIGURATION_CLAIM]: {
      ...(payload[TOOL_CONFIGURATION_CLAIM] as Record<string, unknown>),
      deployment_id: deploymentId,
    },
  };
}
