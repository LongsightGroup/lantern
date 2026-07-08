import { assertEquals, assertStringIncludes } from '@std/assert';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { restoreEnv, withFetchStub } from './app_test_support.ts';
import { getTestToolPrivateJwkEnvValue, TEST_LTI_STATE_SECRET } from './test_helpers/lti.ts';
import { createAuthenticatedTestApp } from './test_helpers/admin_auth.ts';

const TOOL_CONFIGURATION_CLAIM = 'https://purl.imsglobal.org/spec/lti-tool-configuration';

Deno.test('GET /admin/packages/:appId/deployment/register/sakai completes automatic setup and saves the Sakai binding', async () => {
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
      state: 'sakai-registration-state-123',
      appId: 'chapter-4-asteroids',
      lms: 'sakai',
      createdAt: '2030-03-24T00:00:00Z',
      expiresAt: '2030-03-24T00:30:00Z',
      usedAt: null,
    });
    const app = createAuthenticatedTestApp({
      getRepository: () => repository,
    });
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
            JSON.stringify(buildSakaiOpenIdConfiguration()),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        if (url === 'https://sakai.example/imsblis/lti13/registration_endpoint/91') {
          const payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          return new Response(
            JSON.stringify(
              buildRegistrationResponse(payload, '7dbe6a13-f948-498c-87d7-768947ac5c56', '1'),
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
          openid_configuration: 'https://sakai.example/imsblis/lti13/well_known',
          registration_token: 'registration-123',
        });
        const response = await app.request(
          `http://localhost/admin/packages/chapter-4-asteroids/deployment/register/sakai?${params.toString()}`,
        );

        assertEquals(response.status, 200);
        const body = await response.text();
        assertStringIncludes(body, 'Sakai connection saved');
        assertStringIncludes(body, 'Continue in Sakai to review and save the tool.');
        assertStringIncludes(body, 'Continue in Sakai');
        assertStringIncludes(body, 'org.imsglobal.lti.close');
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
    assertEquals(registrationRequest[TOOL_CONFIGURATION_CLAIM].messages.length > 0, true);

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
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousJwk);
    restoreEnv('LTI_STATE_SECRET', previousStateSecret);
  }
});

Deno.test('GET /admin/packages/:appId/deployment/register/sakai explains direct browser access clearly', async () => {
  const previousOrigin = Deno.env.get('APP_ORIGIN');
  Deno.env.set('APP_ORIGIN', 'http://localhost:8417');

  try {
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [
        buildPackageVersionRecord({
          id: 5,
          approvalStatus: 'approved',
          reviewedAt: '2026-03-23T18:05:00Z',
        }),
      ],
    });
    const response = await createAuthenticatedTestApp({
      getRepository: () => repository,
    }).request('http://localhost/admin/packages/chapter-4-asteroids/deployment/register/sakai');

    assertEquals(response.status, 400);
    const body = await response.text();
    assertEquals(body.includes('Open this from Sakai'), true);
    assertEquals(body.includes('Dynamic Registration URL'), true);
  } finally {
    restoreEnv('APP_ORIGIN', previousOrigin);
  }
});

function buildSakaiOpenIdConfiguration(): Record<string, unknown> {
  return {
    issuer: 'https://sakai.example',
    authorization_endpoint: 'https://sakai.example/imsoidc/lti13/oidc_auth',
    token_endpoint: 'https://sakai.example/imsblis/lti13/token/91',
    jwks_uri: 'https://sakai.example/imsblis/lti13/keyset',
    registration_endpoint: 'https://sakai.example/imsblis/lti13/registration_endpoint/91',
    token_endpoint_auth_methods_supported: ['private_key_jwt'],
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    scopes_supported: [
      'https://purl.imsglobal.org/spec/lti-ags/scope/score',
      'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
      'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
    ],
    response_types_supported: ['id_token'],
    id_token_signing_alg_values_supported: ['RS256'],
    claims_supported: ['iss', 'sub', 'name', 'email'],
    subject_types_supported: ['public'],
    'https://purl.imsglobal.org/spec/lti-platform-configuration': {
      product_family_code: 'sakailms.org',
      version: '23',
      messages_supported: [
        { type: 'LtiResourceLinkRequest' },
        { type: 'LtiDeepLinkingRequest' },
      ],
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
