import { assertEquals, assertExists } from '@std/assert';
import { validateDeepLinkingRequest } from './deep_linking.ts';
import { assertRejectsDeepLinking, decodeJwtPayload } from './deep_linking_test_helpers.ts';
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
import { LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE } from './types.ts';

Deno.test('deep linking launch helpers encode assignment-selection claims without requiring a subject claim', async () => {
  const token = await signCanvasIdToken({
    nonce: 'nonce-deep-linking',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8000/lti/deep-linking',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
    deepLinkData: 'dl-state-123',
    deepLinkAcceptTypes: ['ltiResourceLink'],
    deepLinkAcceptPresentationDocumentTargets: ['iframe'],
    deepLinkAcceptLineItem: false,
  });
  const payload = decodeJwtPayload(token);
  const settings = payload[
    'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'
  ] as Record<string, unknown>;

  assertEquals('sub' in payload, false);
  assertExists(settings);
  assertEquals(settings.accept_types, ['ltiResourceLink']);
  assertEquals(settings.accept_multiple, false);
  assertEquals(settings.accept_presentation_document_targets, ['iframe']);
  assertEquals(settings.deep_link_return_url, 'https://canvas.example/courses/42/deep_link_return');
});

Deno.test('deep linking validator accepts a supported assignment-selection launch and preserves authoring settings', async () => {
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
        state: 'state-deep-linking',
        nonce: 'nonce-deep-linking',
        targetLinkUri: 'http://localhost:8000/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2026-03-24T16:20:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-deep-linking',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8000/lti/deep-linking',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
    deepLinkData: 'dl-state-123',
    roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
  });
  const request = await validateDeepLinkingRequest({
    repository,
    state: 'state-deep-linking',
    idToken,
    now: () => new Date('2026-03-24T16:15:00Z'),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });

  assertEquals(request?.placement, 'assignment_selection');
  assertEquals(request?.userId, null);
  assertEquals(request?.userRole, 'instructor');
  assertEquals(request?.settings.acceptTypes, ['ltiResourceLink']);
  assertEquals(request?.deepLinkReturnUrl, 'https://canvas.example/courses/42/deep_link_return');
  const savedState = await repository.getLoginStateByState('state-deep-linking');

  assertEquals(savedState?.usedAt !== null, true);
});

Deno.test('deep linking validator rejects unsupported content-item types without consuming login state', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        id: 7,
        appId: 'chapter-4-asteroids',
        binding: buildDeploymentBinding(),
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        state: 'state-deep-linking-unsupported',
        nonce: 'nonce-deep-linking-unsupported',
        targetLinkUri: 'http://localhost:8000/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2026-03-24T16:20:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-deep-linking-unsupported',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8000/lti/deep-linking',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
    deepLinkAcceptTypes: ['html'],
  });

  await assertRejectsDeepLinking(
    () =>
      validateDeepLinkingRequest({
        repository,
        state: 'state-deep-linking-unsupported',
        idToken,
        now: () => new Date('2026-03-24T16:15:00Z'),
        loadJwks: () => Promise.resolve(getTestCanvasJwks()),
      }),
    'Unsupported Deep Linking accept_types: html.',
  );

  const savedState = await repository.getLoginStateByState('state-deep-linking-unsupported');

  assertEquals(savedState?.usedAt, null);
});
