import { assertEquals, assertRejects } from '@std/assert';
import { completeCanvasDynamicRegistration } from './canvas_dynamic_registration.ts';
import { completeMoodleDynamicRegistration } from './moodle_dynamic_registration.ts';

Deno.test('Moodle dynamic registration falls back to deployment_id embedded in the openid_configuration URL', async () => {
  const previousOrigin = Deno.env.get('APP_ORIGIN');
  Deno.env.set('APP_ORIGIN', 'https://lantern.example');

  try {
    const registration = await completeMoodleDynamicRegistration({
      appTitle: 'Chapter 4 Asteroids',
      openidConfigurationUrl:
        'https://moodle.example/mod/lti/openid-configuration.php?deployment_id=moodle-deployment-777',
      registrationToken: null,
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

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Deno.env.delete(name);
    return;
  }

  Deno.env.set(name, value);
}
