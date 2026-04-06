import { assertEquals, assertRejects } from '@std/assert';
import { createLoginRedirect } from './login.ts';
import { buildCanvasLoginRequest, buildDeploymentBinding } from '../test_helpers/lti.ts';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';

Deno.test('createLoginRedirect persists one-time state and redirects to the Canvas authorization endpoint', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding(),
      }),
    ],
  });
  const tokens = ['state-login-123', 'nonce-login-123'];
  const result = await createLoginRedirect({
    repository,
    loginRequest: buildCanvasLoginRequest(),
    now: () => new Date('2026-03-23T22:45:00Z'),
    createOpaqueToken: () => {
      const next = tokens.shift();

      if (!next) {
        throw new Error('Expected another deterministic login token.');
      }

      return next;
    },
  });
  const location = new URL(result.location);
  const saved = await repository.getLoginStateByState('state-login-123');

  assertEquals(
    location.origin + location.pathname,
    'https://sso.canvaslms.com/api/lti/authorize_redirect',
  );
  assertEquals(location.searchParams.get('response_type'), 'id_token');
  assertEquals(location.searchParams.get('response_mode'), 'form_post');
  assertEquals(location.searchParams.get('scope'), 'openid');
  assertEquals(location.searchParams.get('state'), 'state-login-123');
  assertEquals(location.searchParams.get('nonce'), 'nonce-login-123');
  assertEquals(saved?.state, 'state-login-123');
  assertEquals(saved?.nonce, 'nonce-login-123');
});

Deno.test('unknown deployment binding blocks login initiation before redirect', async () => {
  const repository = createInMemoryPackageReviewRepository();

  await assertRejects(
    () =>
      createLoginRedirect({
        repository,
        loginRequest: buildCanvasLoginRequest({
          clientId: 'missing-client',
          deploymentId: 'missing-deployment',
        }),
      }),
    Error,
    'Deployment missing-client / missing-deployment was not found',
  );
});

Deno.test('createLoginRedirect resolves a unique saved binding when client_id is omitted by the platform', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding({
          clientId: 'canvas-client-unique',
          deploymentId: 'deployment-unique',
        }),
      }),
    ],
  });
  const result = await createLoginRedirect({
    repository,
    loginRequest: buildCanvasLoginRequest({
      clientId: null,
      deploymentId: 'deployment-unique',
    }),
    now: () => new Date('2026-03-23T22:45:00Z'),
    createOpaqueToken: () => crypto.randomUUID(),
  });
  const redirected = new URL(result.location);

  assertEquals(result.loginState.clientId, 'canvas-client-unique');
  assertEquals(redirected.searchParams.get('client_id'), 'canvas-client-unique');
});

Deno.test('createLoginRedirect waits for the resolved deployment profile before applying login compatibility behavior', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: {
          lms: 'moodle',
          issuer: 'https://moodle.example',
          clientId: 'moodle-client-123',
          deploymentId: 'moodle-deployment-123',
          authorizationEndpoint: 'https://moodle.example/mod/lti/auth.php',
          accessTokenUrl: 'https://moodle.example/mod/lti/token.php',
          jwksUrl: 'https://moodle.example/mod/lti/certs.php',
        },
        ltiProfileOverride: 'governedCompatibility',
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-23T22:45:00Z',
    },
  });
  const result = await createLoginRedirect({
    repository,
    loginRequest: {
      iss: 'https://moodle.example',
      loginHint: 'opaque%2Flogin%3Fhint',
      targetLinkUri: null,
      clientId: 'moodle-client-123',
      deploymentId: 'moodle-deployment-123',
      ltiMessageHint: 'context%23value',
    },
    loginCompatibility: {
      decodedLoginHint: 'opaque/login?hint',
      decodedLtiMessageHint: 'context#value',
    },
    appOrigin: 'http://localhost:8417',
    now: () => new Date('2026-03-23T22:45:00Z'),
    createOpaqueToken: () => crypto.randomUUID(),
  });

  assertEquals(result.loginState.loginHint, 'opaque/login?hint');
  assertEquals(result.loginState.ltiMessageHint, 'context#value');
  assertEquals(result.loginState.targetLinkUri, 'http://localhost:8417/lti/launch');
  assertEquals(result.compatibilityPathsUsed, [
    'opaque_login_hint_decode',
    'opaque_lti_message_hint_decode',
    'platform_default_launch_target',
  ]);
  assertEquals(result.ltiProfile.id, 'governedCompatibility');
  assertEquals(result.ltiProfile.source, 'deploymentOverride');
});

Deno.test('createLoginRedirect rejects opaque login compatibility paths when the resolved profile is certification', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: {
          lms: 'moodle',
          issuer: 'https://moodle.example',
          clientId: 'moodle-client-123',
          deploymentId: 'moodle-deployment-123',
          authorizationEndpoint: 'https://moodle.example/mod/lti/auth.php',
          accessTokenUrl: 'https://moodle.example/mod/lti/token.php',
          jwksUrl: 'https://moodle.example/mod/lti/certs.php',
        },
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-23T22:45:00Z',
    },
  });

  await assertRejects(
    () =>
      createLoginRedirect({
        repository,
        loginRequest: {
          iss: 'https://moodle.example',
          loginHint: 'opaque%2Flogin%3Fhint',
          targetLinkUri: 'http://localhost:8417/lti/launch',
          clientId: 'moodle-client-123',
          deploymentId: 'moodle-deployment-123',
          ltiMessageHint: null,
        },
        loginCompatibility: {
          decodedLoginHint: 'opaque/login?hint',
          decodedLtiMessageHint: null,
        },
      }),
    Error,
    'active LTI profile does not allow opaque',
  );
});

Deno.test('login state records carry the expected target_link_uri and expiry window', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding(),
      }),
    ],
  });
  const result = await createLoginRedirect({
    repository,
    loginRequest: buildCanvasLoginRequest(),
    now: () => new Date('2026-03-23T22:45:00Z'),
    createOpaqueToken: () => crypto.randomUUID(),
  });

  assertEquals(result.loginState.targetLinkUri, 'http://localhost:8417/lti/launch');
  assertEquals(result.loginState.expiresAt > result.loginState.createdAt, true);
});

Deno.test('login state records preserve the dedicated deep-linking target_link_uri', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding(),
      }),
    ],
  });
  const result = await createLoginRedirect({
    repository,
    loginRequest: buildCanvasLoginRequest({
      targetLinkUri: 'http://localhost:8417/lti/deep-linking',
    }),
    now: () => new Date('2026-03-23T22:45:00Z'),
    createOpaqueToken: () => crypto.randomUUID(),
  });

  assertEquals(result.loginState.targetLinkUri, 'http://localhost:8417/lti/deep-linking');
  assertEquals(
    new URL(result.location).searchParams.get('redirect_uri'),
    'http://localhost:8417/lti/deep-linking',
  );
});

Deno.test('login state records preserve Deep Linking placement-specific target_link_uri values', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding(),
      }),
    ],
  });
  const result = await createLoginRedirect({
    repository,
    loginRequest: buildCanvasLoginRequest({
      targetLinkUri: 'http://localhost:8417/lti/deep-linking?placement=resource_selection',
    }),
    now: () => new Date('2026-03-23T22:45:00Z'),
    createOpaqueToken: () => crypto.randomUUID(),
  });

  assertEquals(
    result.loginState.targetLinkUri,
    'http://localhost:8417/lti/deep-linking?placement=resource_selection',
  );
  assertEquals(
    new URL(result.location).searchParams.get('redirect_uri'),
    'http://localhost:8417/lti/deep-linking?placement=resource_selection',
  );
});

Deno.test('createLoginRedirect seals a pending Canvas registration on the first real launch', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        appId: 'chapter-4-asteroids',
        version: '0.1.0',
        title: 'Chapter 4 Asteroids',
        description: null,
        owner: { type: 'user', id: 'user-1' },
        entrypoint: 'dist/index.html',
        roles: ['learner'],
        installScope: 'assignment',
        capabilities: [],
        grading: {
          mode: 'completion',
          rubricFile: null,
          maxScore: null,
        },
        approvalStatus: 'approved',
        reviewNotes: null,
        accessibilityReview: null,
        reviewedAt: '2026-03-23T22:45:00Z',
        validationIssues: [],
        manifestJson: {},
        artifact: {
          snapshotRoot: 'var/packages/chapter-4-asteroids/0.1.0',
          manifestPath: 'manifest.json',
          entrypointPath: 'dist/index.html',
          digest: 'digest',
        },
        runtimeContractSignature: 'test-reviewed-runtime-contract-signature',
        importedAt: '2026-03-23T22:45:00Z',
      }),
    ],
  });
  await repository.saveCanvasRegistration({
    slug: 'chapter-4-asteroids-pilot',
    label: 'Chapter 4 Asteroids Pilot Deployment',
    appId: 'chapter-4-asteroids',
    canvasEnvironment: 'production',
    issuer: 'https://canvas.instructure.com',
    clientId: 'canvas-client-777',
  });

  const result = await createLoginRedirect({
    repository,
    loginRequest: buildCanvasLoginRequest({
      clientId: 'canvas-client-777',
      deploymentId: 'deployment-777',
    }),
    now: () => new Date('2026-03-23T22:45:00Z'),
    createOpaqueToken: () => crypto.randomUUID(),
  });
  const deployment = await repository.getDeploymentBySlug('chapter-4-asteroids-pilot');

  assertEquals(result.loginState.clientId, 'canvas-client-777');
  assertEquals(result.loginState.deploymentId, 'deployment-777');
  assertEquals(deployment?.binding?.lms, 'canvas');
  assertEquals(deployment?.binding?.clientId, 'canvas-client-777');
  assertEquals(deployment?.binding?.deploymentId, 'deployment-777');
});

Deno.test('createLoginRedirect rejects an omitted client_id when issuer and deployment_id still match multiple bindings', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        id: 1,
        slug: 'shared-canvas-a',
        binding: buildDeploymentBinding({
          issuer: 'https://shared.example',
          clientId: 'shared-client-a',
          deploymentId: 'shared-deployment',
        }),
      }),
      buildDeploymentRecord({
        id: 2,
        slug: 'shared-canvas-b',
        binding: buildDeploymentBinding({
          issuer: 'https://shared.example',
          clientId: 'shared-client-b',
          deploymentId: 'shared-deployment',
        }),
      }),
    ],
  });

  await assertRejects(
    () =>
      createLoginRedirect({
        repository,
        loginRequest: buildCanvasLoginRequest({
          iss: 'https://shared.example',
          clientId: null,
          deploymentId: 'shared-deployment',
        }),
      }),
    Error,
    'Platform must send client_id',
  );
});
