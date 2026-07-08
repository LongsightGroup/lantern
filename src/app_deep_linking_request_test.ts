import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import { LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE } from './lti/types.ts';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import {
  buildDeploymentBinding,
  buildMoodleDeploymentBinding,
  createSyncedTestLtiStorage,
  getTestCanvasJwks,
  signCanvasIdToken,
  signLtiToolState,
} from './test_helpers/lti.ts';
import { withFetchStub, withRuntimeOriginEnv } from './app_test_support.ts';

Deno.test('POST /lti/deep-linking accepts lti-tool verified Canvas Deep Linking launches', async () => {
  const binding = buildDeploymentBinding();
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        installScope: 'assignment',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-24T16:15:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding,
      }),
    ],
  });
  const ltiStorage = await createSyncedTestLtiStorage({ binding });
  const formData = new FormData();

  formData.set(
    'state',
    await signLtiToolState({
      nonce: 'nonce-canvas-deep-linking',
      issuer: binding.issuer,
      clientId: binding.clientId,
      targetLinkUri: 'http://localhost/lti/deep-linking?placement=assignment_selection',
    }),
  );
  formData.set(
    'id_token',
    await signCanvasIdToken({
      nonce: 'nonce-canvas-deep-linking',
      subject: 'canvas-author-123',
      messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
      targetLinkUri: 'http://localhost/lti/deep-linking?placement=assignment_selection',
      deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
      deepLinkData: 'dl-state-123',
      deepLinkAcceptLineItem: true,
    }),
  );

  await withRuntimeOriginEnv(async () => {
    await withFetchStub(
      () =>
        Promise.resolve(
          new Response(JSON.stringify(getTestCanvasJwks()), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      async () => {
        const response = await createApp({
          getRepository: () => repository,
          getLtiToolStorage: () => ltiStorage,
        }).request('http://localhost/lti/deep-linking', {
          method: 'POST',
          body: formData,
        });
        const location = response.headers.get('location') ?? '';
        const sessionLocation = new URL(`http://localhost${location}`);
        const sessionId = sessionLocation.pathname.split('/').at(-1) ?? '';
        const savedSession = await repository.getDeepLinkingSessionById(sessionId);
        const runtimeSession = await repository.getLatestRuntimeSessionByDeploymentId(7);

        assertEquals(response.status, 303, await response.clone().text());
        assertStringIncludes(location, '/lti/deep-linking/sessions/');
        assertEquals(savedSession?.deepLinkReturnUrl.includes('deep_link_return'), true);
        assertEquals(savedSession?.sessionToken, sessionLocation.searchParams.get('token'));
        assertEquals(savedSession?.ltiToolSessionId !== null, true);
        assertEquals(savedSession?.placement, 'assignment_selection');
        assertEquals(savedSession?.acceptLineItem, true);
        assertEquals(runtimeSession, null);
      },
    );
  });
});

Deno.test('POST /lti/deep-linking accepts lti-tool verified Moodle Deep Linking launches', async () => {
  const binding = buildMoodleDeploymentBinding();
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        installScope: 'course',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-24T16:15:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 12,
        enabledPackageVersionId: 5,
        enabledPackageVersion: '0.1.0',
        binding,
      }),
    ],
  });
  const ltiStorage = await createSyncedTestLtiStorage({ binding });
  const formData = new FormData();

  formData.set(
    'state',
    await signLtiToolState({
      nonce: 'nonce-moodle-deep-linking',
      issuer: binding.issuer,
      clientId: binding.clientId,
      targetLinkUri: 'http://localhost/lti/deep-linking?placement=resource_selection',
    }),
  );
  formData.set(
    'id_token',
    await signCanvasIdToken({
      deploymentBinding: {
        issuer: binding.issuer,
        clientId: binding.clientId,
        deploymentId: binding.deploymentId,
      },
      audience: binding.clientId,
      nonce: 'nonce-moodle-deep-linking',
      subject: 'moodle-user-9',
      messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
      targetLinkUri: 'http://localhost/lti/deep-linking?placement=resource_selection',
      deepLinkReturnUrl: 'https://moodle.example/mod/lti/deep_link_return',
      deepLinkData: 'moodle-state',
    }),
  );

  await withRuntimeOriginEnv(async () => {
    await withFetchStub(
      () =>
        Promise.resolve(
          new Response(JSON.stringify(getTestCanvasJwks()), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      async () => {
        const response = await createApp({
          getRepository: () => repository,
          getLtiToolStorage: () => ltiStorage,
        }).request('http://localhost/lti/deep-linking', {
          method: 'POST',
          body: formData,
        });
        const location = response.headers.get('location') ?? '';
        const sessionId = new URL(`http://localhost${location}`).pathname.split('/').at(-1) ?? '';
        const savedSession = await repository.getDeepLinkingSessionById(sessionId);

        assertEquals(response.status, 303);
        assertEquals(savedSession?.deploymentRecordId, 12);
        assertEquals(savedSession?.placement, 'resource_selection');
        assertEquals(savedSession?.userId, 'moodle-user-9');
      },
    );
  });
});
