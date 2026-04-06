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
  buildLoginStateRecord,
  buildMoodleDeploymentBinding,
  getTestCanvasJwks,
  signCanvasIdToken,
} from './test_helpers/lti.ts';

Deno.test('POST /lti/deep-linking accepts assignment-selection launches and redirects to a Lantern-owned picker session', async () => {
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
        binding: buildDeploymentBinding(),
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-24T16:00:00Z',
    },
    loginStates: [
      buildLoginStateRecord({
        state: 'state-deep-linking',
        nonce: 'nonce-deep-linking',
        targetLinkUri: 'http://localhost:8417/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
  });
  const formData = new FormData();
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-deep-linking',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8417/lti/deep-linking',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
    deepLinkData: 'dl-state-123',
  });

  formData.set('state', 'state-deep-linking');
  formData.set('id_token', idToken);

  const response = await createApp({
    getRepository: () => repository,
    loadCanvasJwks: () => Promise.resolve(getTestCanvasJwks()),
  }).request('http://localhost/lti/deep-linking', {
    method: 'POST',
    body: formData,
  });
  const location = response.headers.get('location') ?? '';
  const sessionLocation = new URL(`http://localhost${location}`);
  const sessionId = sessionLocation.pathname.split('/').at(-1) ?? '';
  const savedSession = await repository.getDeepLinkingSessionById(sessionId);
  const runtimeSession = await repository.getLatestRuntimeSessionByDeploymentId(7);
  const auditEvents = await repository.listAuditEventsByEventType('deep_linking.request.accepted');

  assertEquals(response.status, 303);
  assertStringIncludes(location, '/lti/deep-linking/sessions/');
  assertEquals(savedSession?.deepLinkReturnUrl.includes('deep_link_return'), true);
  assertEquals(savedSession?.sessionToken, sessionLocation.searchParams.get('token'));
  assertEquals(runtimeSession, null);
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.deploymentRecordId, 7);
  assertEquals(auditEvents[0]?.packageVersionId, 1);
  assertEquals(
    String(auditEvents[0]?.detail.internalDeploymentSlug ?? ''),
    'chapter-4-asteroids-pilot',
  );
  assertEquals(auditEvents[0]?.detail.ltiProfileId, 'certification');
  assertEquals(auditEvents[0]?.detail.ltiProfileSource, 'lanternDefault');
});

Deno.test('POST /lti/deep-linking rejects unsupported Deep Linking payloads before any picker handoff', async () => {
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
        binding: buildDeploymentBinding(),
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        state: 'state-deep-linking-error',
        nonce: 'nonce-deep-linking-error',
        targetLinkUri: 'http://localhost:8417/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
  });
  const formData = new FormData();
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-deep-linking-error',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8417/lti/deep-linking',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
    deepLinkAcceptTypes: ['html'],
  });

  formData.set('state', 'state-deep-linking-error');
  formData.set('id_token', idToken);

  const response = await createApp({
    getRepository: () => repository,
    loadCanvasJwks: () => Promise.resolve(getTestCanvasJwks()),
  }).request('http://localhost/lti/deep-linking', {
    method: 'POST',
    body: formData,
  });
  const savedState = await repository.getLoginStateByState('state-deep-linking-error');
  const runtimeSession = await repository.getLatestRuntimeSessionByDeploymentId(7);
  const auditEvents = await repository.listAuditEventsByEventType('deep_linking.request.rejected');

  assertEquals(response.status, 400);
  assertStringIncludes(await response.text(), 'Unsupported');
  assertEquals(savedState?.usedAt, null);
  assertEquals(runtimeSession, null);
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.detail.category, 'specInvalid');
  assertEquals(auditEvents[0]?.detail.code, 'unsupported_deep_linking_accept_type');
  assertEquals(auditEvents[0]?.detail.ltiProfileId, 'governedCompatibility');
});

Deno.test('POST /lti/deep-linking returns 409 and records a typed policy denial when certification blocks the nonce bridge', async () => {
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
        binding: buildDeploymentBinding(),
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-24T16:00:00Z',
    },
    loginStates: [
      buildLoginStateRecord({
        state: 'state-deep-linking-policy-denial',
        nonce: 'nonce-deep-linking-policy-denial',
        targetLinkUri: 'http://localhost:8417/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
  });
  const formData = new FormData();
  const idToken = await signCanvasIdToken({
    nonce: null,
    jwtId: 'nonce-deep-linking-policy-denial',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8417/lti/deep-linking',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
  });

  formData.set('state', 'state-deep-linking-policy-denial');
  formData.set('id_token', idToken);

  const response = await createApp({
    getRepository: () => repository,
    loadCanvasJwks: () => Promise.resolve(getTestCanvasJwks()),
  }).request('http://localhost/lti/deep-linking', {
    method: 'POST',
    body: formData,
  });
  const savedState = await repository.getLoginStateByState('state-deep-linking-policy-denial');
  const auditEvents = await repository.listAuditEventsByEventType('deep_linking.request.rejected');

  assertEquals(response.status, 409);
  assertStringIncludes(await response.text(), 'nonce');
  assertEquals(savedState?.usedAt, null);
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.detail.category, 'policyDenied');
  assertEquals(auditEvents[0]?.detail.code, 'nonce_bridge_not_allowed');
  assertEquals(auditEvents[0]?.detail.ltiProfileId, 'certification');
});

Deno.test('POST /lti/deep-linking accepts Moodle Deep Linking launches through the generic route', async () => {
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
        id: 8,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildMoodleDeploymentBinding({
          issuer: 'https://moodle.example',
          clientId: 'moodle-client-123',
          deploymentId: 'moodle-deployment-123',
        }),
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        lms: 'moodle',
        canvasEnvironment: null,
        issuer: 'https://moodle.example',
        clientId: 'moodle-client-123',
        deploymentId: 'moodle-deployment-123',
        state: 'state-deep-linking-moodle',
        nonce: 'nonce-deep-linking-moodle',
        targetLinkUri: 'http://localhost:8417/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
  });
  const formData = new FormData();
  const idToken = await signCanvasIdToken({
    deploymentBinding: {
      issuer: 'https://moodle.example',
      clientId: 'moodle-client-123',
      deploymentId: 'moodle-deployment-123',
    },
    audience: 'moodle-client-123',
    nonce: 'nonce-deep-linking-moodle',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8417/lti/deep-linking',
    deepLinkReturnUrl: 'https://moodle.example/mod/lti/deep_link_return.php',
  });

  formData.set('state', 'state-deep-linking-moodle');
  formData.set('id_token', idToken);

  const response = await createApp({
    getRepository: () => repository,
    loadCanvasJwks: () => Promise.resolve(getTestCanvasJwks()),
  }).request('http://localhost/lti/deep-linking', {
    method: 'POST',
    body: formData,
  });
  const location = response.headers.get('location') ?? '';
  const auditEvents = await repository.listAuditEventsByEventType('deep_linking.request.accepted');

  assertEquals(response.status, 303);
  assertStringIncludes(location, '/lti/deep-linking/sessions/');
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.deploymentRecordId, 8);
  assertEquals(auditEvents[0]?.detail.lms, 'moodle');
});
