import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { getTestToolPrivateJwkEnvValue, TEST_LTI_STATE_SECRET } from '../test_helpers/lti.ts';

const EXPECTED_CANVAS_STATIC_SCOPES = [
  'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
  'https://purl.imsglobal.org/spec/lti-ags/scope/score',
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
];

const TEST_CONFIG_ENV = {
  get(name: string): string | undefined {
    return name === 'APP_ORIGIN'
      ? 'http://localhost:8417'
      : name === 'LTI_TOOL_PRIVATE_JWK'
      ? getTestToolPrivateJwkEnvValue()
      : name === 'LTI_STATE_SECRET'
      ? TEST_LTI_STATE_SECRET
      : undefined;
  },
};

Deno.test('GET /lti/canvas/config.json publishes one supported Canvas config document', async () => {
  const previousOrigin = Deno.env.get('APP_ORIGIN');
  const previousJwk = Deno.env.get('LTI_TOOL_PRIVATE_JWK');
  const previousStateSecret = Deno.env.get('LTI_STATE_SECRET');

  Deno.env.set('APP_ORIGIN', 'http://localhost:8417');
  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());
  Deno.env.set('LTI_STATE_SECRET', TEST_LTI_STATE_SECRET);

  try {
    const { createApp } = await import('../app.ts');
    const response = await createApp().request('http://localhost/lti/canvas/config.json');

    assertEquals(response.status, 200);

    const body = (await response.json()) as {
      oidc_initiation_url: string;
      target_link_uri: string;
      public_jwk_url: string;
      scopes: string[];
      extensions: unknown[];
    };

    assertEquals(typeof body.oidc_initiation_url, 'string');
    assertEquals(typeof body.target_link_uri, 'string');
    assertEquals(typeof body.public_jwk_url, 'string');
    assertEquals(body.scopes, EXPECTED_CANVAS_STATIC_SCOPES);
    assertEquals(Array.isArray(body.extensions), true);
  } finally {
    restoreEnv('APP_ORIGIN', previousOrigin);
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousJwk);
    restoreEnv('LTI_STATE_SECRET', previousStateSecret);
  }
});

Deno.test('GET /lti/jwks.json exposes only the public Lantern tool JWK', async () => {
  const previousJwk = Deno.env.get('LTI_TOOL_PRIVATE_JWK');
  const previousStateSecret = Deno.env.get('LTI_STATE_SECRET');

  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());
  Deno.env.set('LTI_STATE_SECRET', TEST_LTI_STATE_SECRET);

  try {
    const { createApp } = await import('../app.ts');
    const response = await createApp().request('http://localhost/lti/jwks.json');

    assertEquals(response.status, 200);

    const body = await response.text();

    assertStringIncludes(body, '"keys"');
    assertEquals(body.includes('"d"'), false);
  } finally {
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousJwk);
    restoreEnv('LTI_STATE_SECRET', previousStateSecret);
  }
});

Deno.test('config document advertises exactly the Phase 3 AGS and NRPS scopes', async () => {
  const previousOrigin = Deno.env.get('APP_ORIGIN');
  const previousJwk = Deno.env.get('LTI_TOOL_PRIVATE_JWK');

  Deno.env.set('APP_ORIGIN', 'http://localhost:8417');
  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());

  try {
    const { buildCanvasConfigDocument } = await import('./config.ts');
    const document = await buildCanvasConfigDocument('http://localhost:8417', TEST_CONFIG_ENV);

    assertEquals(Array.isArray(document.extensions), true);
    assertEquals(document.scopes, EXPECTED_CANVAS_STATIC_SCOPES);
  } finally {
    restoreEnv('APP_ORIGIN', previousOrigin);
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousJwk);
  }
});

Deno.test('config document fails before publishing when the tool JWK is missing', async () => {
  const { buildCanvasConfigDocument } = await import('./config.ts');

  await assertRejects(
    () =>
      buildCanvasConfigDocument('http://localhost:8417', {
        get: () => undefined,
      }),
    Error,
    'Missing LTI_TOOL_PRIVATE_JWK',
  );
});

Deno.test('config document advertises assignment-selection Deep Linking on a dedicated route', async () => {
  const previousOrigin = Deno.env.get('APP_ORIGIN');
  const previousJwk = Deno.env.get('LTI_TOOL_PRIVATE_JWK');

  Deno.env.set('APP_ORIGIN', 'http://localhost:8417');
  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());

  try {
    const { buildCanvasConfigDocument } = await import('./config.ts');
    const document = await buildCanvasConfigDocument('http://localhost:8417', TEST_CONFIG_ENV);
    const placements = document.extensions.flatMap((extension) => extension.settings.placements);
    const assignmentSelection = placements.find(
      (placement) => placement.placement === 'assignment_selection',
    );

    assertEquals(assignmentSelection?.message_type, 'LtiDeepLinkingRequest');
    assertEquals(assignmentSelection?.target_link_uri, 'http://localhost:8417/lti/deep-linking');
    const resourceSelection = placements.find(
      (placement) => placement.placement === 'resource_selection',
    );

    assertEquals(resourceSelection?.message_type, 'LtiDeepLinkingRequest');
    assertEquals(
      resourceSelection?.target_link_uri,
      'http://localhost:8417/lti/deep-linking?placement=resource_selection',
    );
  } finally {
    restoreEnv('APP_ORIGIN', previousOrigin);
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousJwk);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Deno.env.delete(name);
    return;
  }

  Deno.env.set(name, value);
}
