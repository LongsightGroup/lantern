import { assertEquals, assertRejects } from '@std/assert';
import { validateLaunchRequest } from './launch.ts';
import { expectLaunchRejection } from './launch_test_support.ts';
import {
  buildDeploymentBinding,
  buildLoginStateRecord,
  getTestCanvasJwks,
  signCanvasIdToken,
} from '../test_helpers/lti.ts';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';

Deno.test('validateLaunchRequest accepts a signed launch with matching state, nonce, and deployment binding', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    loginStates: [buildLoginStateRecord()],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-123',
    audience: '10000000000001',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    preferredUsername: 'adal',
  });
  const launch = await validateLaunchRequest({
    repository,
    state: 'state-123',
    idToken,
    now: () => new Date('2026-03-23T22:45:00Z'),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });
  const loginState = await repository.getLoginStateByState('state-123');

  assertEquals(launch.deploymentId, 'deployment-123');
  assertEquals(launch.clientId, '10000000000001');
  assertEquals(launch.appId, 'chapter-4-asteroids');
  assertEquals(launch.packageVersionId, 1);
  assertEquals(launch.userDisplayName, 'Ada Lovelace');
  assertEquals(launch.userEmail, 'ada@example.com');
  assertEquals(launch.userLogin, 'adal');
  assertEquals(loginState?.usedAt !== null, true);
});

Deno.test('validateLaunchRequest rejects invalid signatures and mismatched target_link_uri', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    loginStates: [
      buildLoginStateRecord(),
      buildLoginStateRecord({
        state: 'state-target',
        nonce: 'nonce-target',
      }),
    ],
  });
  const targetMismatchToken = await signCanvasIdToken({
    nonce: 'nonce-target',
    targetLinkUri: 'http://localhost:8417/lti/runtime/chapter-4-asteroids',
  });
  const invalidSignatureToken = await signCanvasIdToken({
    nonce: 'nonce-123',
  });

  await assertRejects(
    () =>
      validateLaunchRequest({
        repository,
        state: 'state-123',
        idToken: invalidSignatureToken,
        now: () => new Date('2026-03-23T22:45:00Z'),
        loadJwks: () => Promise.resolve({ keys: [] }),
      }),
    Error,
    'Launch id_token signature or issuer validation failed.',
  );
  await assertRejects(
    () =>
      validateLaunchRequest({
        repository,
        state: 'state-target',
        idToken: targetMismatchToken,
        now: () => new Date('2026-03-23T22:45:00Z'),
        loadJwks: () => Promise.resolve(getTestCanvasJwks()),
      }),
    Error,
    'Launch target_link_uri did not match the saved login state.',
  );
});

Deno.test('validateLaunchRequest retries JWKS once before rejecting a valid launch during key rollover', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
        ltiProfileOverride: 'governedCompatibility',
      }),
    ],
    loginStates: [buildLoginStateRecord()],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-23T18:05:00Z',
    },
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-123',
    audience: '10000000000001',
  });
  let jwksRequests = 0;

  const launch = await validateLaunchRequest({
    repository,
    state: 'state-123',
    idToken,
    now: () => new Date('2026-03-23T22:45:00Z'),
    loadJwks: () => {
      jwksRequests += 1;

      return Promise.resolve(jwksRequests === 1 ? { keys: [] } : getTestCanvasJwks());
    },
  });
  const interopEvents = await repository.listAuditEventsByEventType('interop.path_used');

  assertEquals(jwksRequests, 2);
  assertEquals(launch.clientId, '10000000000001');
  assertEquals(
    interopEvents.some(
      (event) =>
        event.detail.path === 'jwks_refetch' &&
        event.detail.ltiProfileId === 'governedCompatibility' &&
        event.detail.ltiProfileSource === 'deploymentOverride',
    ),
    true,
  );
});

Deno.test('validateLaunchRequest tolerates target_link_uri scheme, query, and trailing-slash drift when the callback host and route still match', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
        ltiProfileOverride: 'governedCompatibility',
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        state: 'state-normalized-target',
        nonce: 'nonce-normalized-target',
        targetLinkUri: 'https://lantern.example/lti/launch/',
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-23T18:05:00Z',
    },
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-normalized-target',
    targetLinkUri: 'http://lantern.example/lti/launch?placement=course_navigation',
  });

  const launch = await validateLaunchRequest({
    repository,
    state: 'state-normalized-target',
    idToken,
    now: () => new Date('2026-03-23T22:45:00Z'),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });
  const interopEvents = await repository.listAuditEventsByEventType('interop.path_used');

  assertEquals(
    launch.targetLinkUri,
    'http://lantern.example/lti/launch?placement=course_navigation',
  );
  assertEquals(
    interopEvents.some(
      (event) =>
        event.detail.path === 'target_link_uri_drift' &&
        event.detail.ltiProfileId === 'governedCompatibility' &&
        event.detail.ltiProfileSource === 'deploymentOverride',
    ),
    true,
  );
});

Deno.test('validateLaunchRequest rejects JWKS retry when the resolved profile is certification', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    loginStates: [buildLoginStateRecord()],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-23T18:05:00Z',
    },
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-123',
    audience: '10000000000001',
  });
  let jwksRequests = 0;

  await assertRejects(
    () =>
      validateLaunchRequest({
        repository,
        state: 'state-123',
        idToken,
        now: () => new Date('2026-03-23T22:45:00Z'),
        loadJwks: () => {
          jwksRequests += 1;

          return Promise.resolve(jwksRequests === 1 ? { keys: [] } : getTestCanvasJwks());
        },
      }),
    Error,
    'Launch id_token signature or issuer validation failed.',
  );

  const interopEvents = await repository.listAuditEventsByEventType('interop.path_used');

  assertEquals(jwksRequests, 1);
  assertEquals(interopEvents.length, 0);
});

Deno.test('validateLaunchRequest rejects target_link_uri drift when the resolved profile is certification', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        state: 'state-cert-target',
        nonce: 'nonce-cert-target',
        targetLinkUri: 'https://lantern.example/lti/launch/',
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-23T18:05:00Z',
    },
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-cert-target',
    targetLinkUri: 'http://lantern.example/lti/launch?placement=course_navigation',
  });

  await assertRejects(
    () =>
      validateLaunchRequest({
        repository,
        state: 'state-cert-target',
        idToken,
        now: () => new Date('2026-03-23T22:45:00Z'),
        loadJwks: () => Promise.resolve(getTestCanvasJwks()),
      }),
    Error,
    'Launch target_link_uri did not match the saved login state.',
  );
});

Deno.test('validateLaunchRequest rejects unsupported message types with a stable support-matrix code', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        state: 'state-message',
        nonce: 'nonce-message',
      }),
    ],
  });
  const messageMismatchToken = await signCanvasIdToken({
    nonce: 'nonce-message',
    messageType: 'LtiDeepLinkingRequest',
  });
  const error = await assertRejects(() =>
    validateLaunchRequest({
      repository,
      state: 'state-message',
      idToken: messageMismatchToken,
      now: () => new Date('2026-03-23T22:45:00Z'),
      loadJwks: () => Promise.resolve(getTestCanvasJwks()),
    }),
  );
  const rejection = expectLaunchRejection(error);

  assertEquals(rejection.code, 'unsupported_message_type');
  assertEquals(rejection.detail.messageType, 'LtiDeepLinkingRequest');
  assertEquals(rejection.detail.supportedMessageType, 'LtiResourceLinkRequest');

  const preservedState = await repository.getLoginStateByState('state-message');

  assertEquals(preservedState?.usedAt, null);
});

Deno.test('validateLaunchRequest rejects missing context.id as an explicit governed baseline denial', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    loginStates: [buildLoginStateRecord()],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-123',
    audience: '10000000000001',
    contextId: '',
  });
  const error = await assertRejects(() =>
    validateLaunchRequest({
      repository,
      state: 'state-123',
      idToken,
      now: () => new Date('2026-03-23T22:45:00Z'),
      loadJwks: () => Promise.resolve(getTestCanvasJwks()),
    }),
  );
  const rejection = expectLaunchRejection(error);

  assertEquals(rejection.code, 'missing_baseline_claim');
  assertEquals(rejection.detail.claim, 'context.id');
  assertEquals(rejection.detail.rule, 'governed_runtime_baseline');
});
