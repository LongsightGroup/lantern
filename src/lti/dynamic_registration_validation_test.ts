import { assertEquals, assertRejects } from '@std/assert';
import { completeCanvasDynamicRegistration } from './canvas_dynamic_registration.ts';
import { completeMoodleDynamicRegistration } from './moodle_dynamic_registration.ts';
import { completeSakaiDynamicRegistration } from './sakai_dynamic_registration.ts';

Deno.test('Moodle dynamic registration falls back to deployment_id embedded in the openid_configuration URL', async () => {
  const previousOrigin = Deno.env.get('APP_ORIGIN');
  Deno.env.set('APP_ORIGIN', 'https://lantern.example');

  try {
    const registration = await completeMoodleDynamicRegistration({
      appTitle: 'Chapter 4 Asteroids',
      openidConfigurationUrl:
        'https://moodle.example/mod/lti/openid-configuration.php?deployment_id=moodle-deployment-777',
      registrationToken: null,
      appOrigin: 'https://lantern.example',
      fetch(input) {
        const url = typeof input === 'string' ? input : input.toString();

        if (
          url ===
          'https://moodle.example/mod/lti/openid-configuration.php?deployment_id=moodle-deployment-777'
        ) {
          return Promise.resolve(
            new Response(
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
            ),
          );
        }

        if (url === 'https://moodle.example/mod/lti/openid-registration.php') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                client_id: 'moodle-client-777',
                'https://purl.imsglobal.org/spec/lti-tool-configuration': {},
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            ),
          );
        }

        throw new Error(`Unexpected fetch ${url}`);
      },
    });

    assertEquals(registration.binding.deploymentId, 'moodle-deployment-777');
    assertEquals(registration.interoperability.usedDeploymentIdFallback, true);
    assertEquals(registration.interoperability.deploymentIdSource, 'openid_query');
  } finally {
    restoreEnv('APP_ORIGIN', previousOrigin);
  }
});

Deno.test('Moodle dynamic registration rejects metadata that drifts off the issuer host', async () => {
  const previousOrigin = Deno.env.get('APP_ORIGIN');
  Deno.env.set('APP_ORIGIN', 'https://lantern.example');

  try {
    await assertRejects(
      () =>
        completeMoodleDynamicRegistration({
          appTitle: 'Chapter 4 Asteroids',
          openidConfigurationUrl: 'https://moodle.example/mod/lti/openid-configuration.php',
          registrationToken: null,
          appOrigin: 'https://lantern.example',
          fetch(input) {
            const url = typeof input === 'string' ? input : input.toString();

            if (url === 'https://moodle.example/mod/lti/openid-configuration.php') {
              return Promise.resolve(
                new Response(
                  JSON.stringify({
                    issuer: 'https://moodle.example',
                    authorization_endpoint: 'https://auth.other.example/auth',
                    token_endpoint: 'https://moodle.example/mod/lti/token.php',
                    jwks_uri: 'https://moodle.example/mod/lti/certs.php',
                    registration_endpoint: 'https://moodle.example/mod/lti/openid-registration.php',
                  }),
                  {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                  },
                ),
              );
            }

            throw new Error(`Unexpected fetch ${url}`);
          },
        }),
      Error,
      'Moodle registration metadata must stay on one HTTPS host anchored at the issuer.',
    );
  } finally {
    restoreEnv('APP_ORIGIN', previousOrigin);
  }
});

Deno.test('Canvas dynamic registration rejects metadata that does not match the supported Canvas authorization endpoint', async () => {
  const previousOrigin = Deno.env.get('APP_ORIGIN');
  Deno.env.set('APP_ORIGIN', 'https://lantern.example');

  try {
    await assertRejects(
      () =>
        completeCanvasDynamicRegistration({
          appTitle: 'Chapter 4 Asteroids',
          openidConfigurationUrl:
            'https://canvas.instructure.com/api/lti/security/openid-configuration',
          registrationToken: 'registration-123',
          appOrigin: 'https://lantern.example',
          fetch(input) {
            const url = typeof input === 'string' ? input : input.toString();

            if (url === 'https://canvas.instructure.com/api/lti/security/openid-configuration') {
              return Promise.resolve(
                new Response(
                  JSON.stringify({
                    issuer: 'https://canvas.instructure.com',
                    authorization_endpoint: 'https://evil.example/authorize',
                    registration_endpoint: 'https://canvas.instructure.com/api/lti/registrations',
                  }),
                  {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                  },
                ),
              );
            }

            throw new Error(`Unexpected fetch ${url}`);
          },
        }),
      Error,
      'Canvas authorization endpoint did not match the supported Canvas platform metadata.',
    );
  } finally {
    restoreEnv('APP_ORIGIN', previousOrigin);
  }
});

Deno.test('Sakai dynamic registration keeps the Worker fetch call bound to globalThis', async () => {
  const previousOrigin = Deno.env.get('APP_ORIGIN');
  const previousFetch = globalThis.fetch;
  Deno.env.set('APP_ORIGIN', 'https://lantern.example');

  globalThis.fetch = function (
    this: typeof globalThis,
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    if (this !== globalThis) {
      throw new TypeError('Illegal invocation');
    }

    const url = typeof input === 'string' ? input : input.toString();

    if (url === 'https://sakai.example/imsblis/lti13/well_known') {
      return Promise.resolve(
        new Response(
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
        ),
      );
    }

    if (url === 'https://sakai.example/imsblis/lti13/registration_endpoint/91') {
      assertEquals(init?.method, 'POST');

      return Promise.resolve(
        new Response(
          JSON.stringify({
            client_id: 'sakai-client-123',
            'https://purl.imsglobal.org/spec/lti-tool-configuration': {
              deployment_id: 'sakai-deployment-123',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    }

    throw new Error(`Unexpected fetch ${url}`);
  } as typeof fetch;

  try {
    const binding = await completeSakaiDynamicRegistration({
      appId: 'chapter-4-asteroids',
      appTitle: 'Chapter 4 Asteroids',
      openidConfigurationUrl: 'https://sakai.example/imsblis/lti13/well_known',
      registrationToken: 'registration-123',
      appOrigin: 'https://lantern.example',
    });

    assertEquals(binding, {
      lms: 'sakai',
      issuer: 'https://sakai.example',
      clientId: 'sakai-client-123',
      deploymentId: 'sakai-deployment-123',
      authorizationEndpoint: 'https://sakai.example/imsoidc/lti13/oidc_auth',
      accessTokenUrl: 'https://sakai.example/imsblis/lti13/token/91',
      jwksUrl: 'https://sakai.example/imsblis/lti13/keyset',
    });
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv('APP_ORIGIN', previousOrigin);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Deno.env.delete(name);
    return;
  }

  Deno.env.set(name, value);
}
