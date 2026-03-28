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
