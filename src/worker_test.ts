import { assertEquals } from '@std/assert';
import worker from './worker.ts';
import { getTestToolPrivateJwkEnvValue } from './test_helpers/lti.ts';

Deno.test('Cloudflare worker entrypoint serves health without Deno-only bindings', async () => {
  const response = await worker.fetch(new Request('https://lantern.example/health'), {}, {});

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true });
});

Deno.test('Cloudflare worker entrypoint serves Canvas config from worker env bindings', async () => {
  const response = await worker.fetch(
    new Request('https://worker.internal/lti/canvas/config.json'),
    {
      APP_ORIGIN: 'https://lantern.example',
      LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue(),
    },
    {},
  );
  const body = (await response.json()) as {
    oidc_initiation_url: string;
    target_link_uri: string;
    redirect_uris: string[];
  };

  assertEquals(response.status, 200);
  assertEquals(body.oidc_initiation_url, 'https://lantern.example/lti/login');
  assertEquals(body.target_link_uri, 'https://lantern.example/lti/launch');
  assertEquals(body.redirect_uris.includes('https://lantern.example/lti/launch'), true);
});
