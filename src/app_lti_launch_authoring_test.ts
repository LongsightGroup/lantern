import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import { LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE } from './lti/types.ts';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import {
  buildSakaiDeploymentBinding,
  createSyncedTestLtiStorage,
  getTestCanvasJwks,
  signCanvasIdToken,
  signLtiToolState,
} from './test_helpers/lti.ts';
import { withFetchStub, withRuntimeOriginEnv } from './app_test_support.ts';

Deno.test('POST /lti/launch accepts Sakai Deep Linking launches and creates a picker session', async () => {
  const binding = buildSakaiDeploymentBinding({
    issuer: 'https://sakai.example',
    clientId: 'sakai-client-123',
    deploymentId: 'sakai-deployment-123',
  });
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: 'approved',
        reviewNotes: 'Ready for pilot.',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 17,
        slug: 'chapter-4-asteroids-sakai',
        label: 'Chapter 4 Asteroids Sakai Deployment',
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
      nonce: 'nonce-sakai-authoring',
      issuer: binding.issuer,
      clientId: binding.clientId,
    }),
  );
  formData.set(
    'id_token',
    await signCanvasIdToken({
      deploymentBinding: {
        issuer: 'https://sakai.example',
        clientId: 'sakai-client-123',
        deploymentId: 'sakai-deployment-123',
      },
      nonce: 'nonce-sakai-authoring',
      audience: 'sakai-client-123',
      issuedAt: '2026-03-24T00:45:00Z',
      expirationTime: '2h',
      messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
      deepLinkReturnUrl: 'https://sakai.example/portal/site/course',
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
        }).request('http://localhost/lti/launch', {
          method: 'POST',
          body: formData,
        });
        const location = response.headers.get('location');
        const runtimeSession = await repository.getLatestRuntimeSessionByDeploymentId(17);

        assertEquals(response.status, 303);
        if (location === null) {
          throw new Error('Expected Deep Linking picker redirect.');
        }
        assertStringIncludes(location, '/lti/deep-linking/sessions/');
        assertEquals(runtimeSession, null);

        const sessionId = location.match(/\/lti\/deep-linking\/sessions\/([^?]+)/)?.[1];

        if (sessionId === undefined) {
          throw new Error('Expected Deep Linking session id.');
        }

        const session = await repository.getDeepLinkingSessionById(sessionId);

        assertEquals(session?.deploymentRecordId, 17);
        assertEquals(session?.deepLinkReturnUrl, 'https://sakai.example/portal/site/course');
      },
    );
  });
});
