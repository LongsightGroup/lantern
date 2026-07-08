import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import {
  buildDeepLinkingResourceOption,
  buildDeepLinkingResourceSelection,
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import {
  buildDeepLinkingSessionRecord,
  buildDeploymentBinding,
  createSyncedTestLtiStorage,
} from './test_helpers/lti.ts';
import {
  extractHiddenInputValue,
  verifyDeepLinkingResponseJwt,
  withCanvasReturnEnv,
} from './app_test_support.ts';

Deno.test('POST /lti/deep-linking/sessions/:id/submit creates one reviewed placement and returns lti-tool auto-post HTML', async () => {
  const binding = buildDeploymentBinding();
  const ltiStorage = await createSyncedTestLtiStorage({ binding });
  await ltiStorage.addSession({
    id: 'lti-tool-session-submit',
    jwtPayload: {},
    user: {
      id: 'canvas-user-123',
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
    },
    context: {
      id: 'course-42',
      label: 'Physics 101',
      title: 'Physics 101',
    },
    platform: {
      issuer: binding.issuer,
      clientId: binding.clientId,
      deploymentId: binding.deploymentId,
      name: 'Canvas',
    },
    launch: {
      target: 'https://lantern.example/lti/deep-linking',
    },
    services: {
      deepLinking: {
        returnUrl: 'https://canvas.example/courses/42/deep_link_return',
        acceptTypes: ['ltiResourceLink'],
        acceptPresentationDocumentTargets: ['iframe'],
        acceptMultiple: false,
        autoCreate: false,
        data: 'deep-linking-state-token',
      },
    },
    customParameters: {},
    isAdmin: false,
    isInstructor: true,
    isStudent: false,
    isAssignmentAndGradesAvailable: false,
    isDeepLinkingAvailable: true,
    isNameAndRolesAvailable: false,
  });
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 2,
        version: '0.2.0',
        installScope: 'assignment',
        grading: {
          mode: 'declarative',
          rubricFile: '/scoring/rubric.json',
          maxScore: 25,
        },
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 1,
        enabledPackageVersionId: 2,
        enabledPackageVersion: '0.2.0',
        binding,
      }),
    ],
    deepLinkingSessions: [
      buildDeepLinkingSessionRecord({
        sessionId: 'deep-linking-session-submit',
        sessionToken: 'deep-linking-token-submit',
        ltiToolSessionId: 'lti-tool-session-submit',
        acceptLineItem: true,
        selection: {
          packageVersionId: 2,
          packageVersion: '0.2.0',
          activityId: '/content/bonus.json',
          contentPath: '/content/bonus.json',
        },
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
    deepLinkingResourceOptions: [
      buildDeepLinkingResourceOption(),
      buildDeepLinkingResourceOption({
        packageVersionId: 2,
        packageVersion: '0.2.0',
        contentPath: '/content/bonus.json',
        activityId: '/content/bonus.json',
        contentTitle: 'Bonus Activity',
      }),
    ],
  });
  const formData = new FormData();

  formData.set('token', 'deep-linking-token-submit');

  await withCanvasReturnEnv(async () => {
    const response = await createApp({
      getRepository: () => repository,
      getLtiToolStorage: () => ltiStorage,
    }).request('http://localhost/lti/deep-linking/sessions/deep-linking-session-submit/submit', {
      method: 'POST',
      body: formData,
    });

    assertEquals(response.status, 200);

    const body = await response.text();
    const responseJwt = extractHiddenInputValue(body, 'JWT');
    const verified = await verifyDeepLinkingResponseJwt(responseJwt);
    const contentItems = verified.payload[
      'https://purl.imsglobal.org/spec/lti-dl/claim/content_items'
    ] as Array<Record<string, unknown>>;
    const contentItem = contentItems[0] ?? {};
    const lineItem = contentItem.lineItem as Record<string, unknown> | undefined;
    const presentation = contentItem.presentation as Record<string, unknown> | undefined;
    const savedSession = await repository.getDeepLinkingSessionById('deep-linking-session-submit');
    const auditEvents = await repository.listAuditEventsByEventType(
      'deep_linking.placement.created',
    );
    const placementId = String(auditEvents[0]?.detail.placementId ?? '');
    const savedPlacement = await repository.getReviewedPlacementById(placementId);

    assertStringIncludes(body, '<!DOCTYPE html>');
    assertStringIncludes(body, 'action="https://canvas.example/courses/42/deep_link_return"');
    assertStringIncludes(body, 'name="JWT"');
    assertEquals(lineItem?.scoreMaximum, 25);
    assertEquals(lineItem?.tag, 'final-grade');
    assertEquals(presentation?.documentTarget, 'iframe');
    assertEquals(savedPlacement?.packageVersionId, 2);
    assertEquals(savedPlacement?.contentPath, '/content/bonus.json');
    assertEquals(savedPlacement?.resourceLinkId, null);
    assertEquals(savedSession?.usedAt !== null, true);
    assertEquals(auditEvents.length, 1);
    assertEquals(String(auditEvents[0]?.detail.placementId ?? ''), savedPlacement?.placementId);
    assertEquals(String(auditEvents[0]?.detail.contentPath ?? ''), '/content/bonus.json');

    const replay = await createApp({
      getRepository: () => repository,
      getLtiToolStorage: () => ltiStorage,
    }).request('http://localhost/lti/deep-linking/sessions/deep-linking-session-submit/submit', {
      method: 'POST',
      body: formData,
    });
    assertEquals(replay.status, 409);
    assertStringIncludes(await replay.text(), 'Assignment resource return already used');
  });
});

Deno.test('POST /lti/deep-linking/sessions/:id/submit keeps missing reviewed selections on Lantern HTML', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deepLinkingSessions: [
      buildDeepLinkingSessionRecord({
        sessionId: 'deep-linking-session-submit-blocked',
        sessionToken: 'deep-linking-token-submit-blocked',
        selection: null,
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
    deepLinkingResourceOptions: [buildDeepLinkingResourceOption()],
  });
  const formData = new FormData();

  formData.set('token', 'deep-linking-token-submit-blocked');

  const response = await createApp({
    getRepository: () => repository,
  }).request(
    'http://localhost/lti/deep-linking/sessions/deep-linking-session-submit-blocked/submit',
    {
      method: 'POST',
      body: formData,
    },
  );

  assertEquals(response.status, 409);

  const body = await response.text();

  assertStringIncludes(body, '<!doctype html>');
  assertStringIncludes(body, 'Return blocked');
  assertStringIncludes(
    body,
    'Save one reviewed assignment resource before returning it to the LMS.',
  );
});

Deno.test('POST /lti/deep-linking/sessions/:id/submit blocks missing session tokens with Lantern-owned HTML', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deepLinkingSessions: [
      buildDeepLinkingSessionRecord({
        sessionId: 'deep-linking-session-submit-auth',
        sessionToken: 'deep-linking-token-submit-auth',
        selection: buildDeepLinkingResourceSelection(),
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
    deepLinkingResourceOptions: [buildDeepLinkingResourceOption()],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/lti/deep-linking/sessions/deep-linking-session-submit-auth/submit', {
    method: 'POST',
    body: new FormData(),
  });

  assertEquals(response.status, 409);

  const body = await response.text();

  assertStringIncludes(body, '<!doctype html>');
  assertStringIncludes(body, 'Session verification failed');
  assertStringIncludes(body, 'Reopen Deep Linking authoring from the LMS and try again.');
});

Deno.test('POST /lti/deep-linking/sessions/:id/submit keeps resource-selection replay copy placement-aware', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deepLinkingSessions: [
      buildDeepLinkingSessionRecord({
        sessionId: 'deep-linking-session-submit-resource-replay',
        sessionToken: 'deep-linking-token-submit-resource-replay',
        placement: 'resource_selection',
        selection: {
          packageVersionId: 3,
          packageVersion: '0.3.0',
          activityId: '/content/course.json',
          contentPath: '/content/course.json',
        },
        usedAt: '2026-03-25T16:21:00Z',
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
    deepLinkingResourceOptions: [
      buildDeepLinkingResourceOption({
        packageVersionId: 3,
        packageVersion: '0.3.0',
        installScope: 'course',
        contentPath: '/content/course.json',
        activityId: '/content/course.json',
        contentTitle: 'Course Activity',
      }),
    ],
  });
  const formData = new FormData();

  formData.set('token', 'deep-linking-token-submit-resource-replay');

  const response = await createApp({
    getRepository: () => repository,
  }).request(
    'http://localhost/lti/deep-linking/sessions/deep-linking-session-submit-resource-replay/submit',
    {
      method: 'POST',
      body: formData,
    },
  );

  assertEquals(response.status, 409);

  const body = await response.text();

  assertStringIncludes(body, 'Course resource return already used');
  assertStringIncludes(body, 'confirm the reviewed course resource, and return once.');
  assertEquals(body.includes('assignment picker'), false);
});

Deno.test('POST /lti/deep-linking/sessions/:id/submit keeps placement-creation failures on a Lantern-owned error surface', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 2,
        version: '0.2.0',
        installScope: 'assignment',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 1,
        enabledPackageVersionId: 2,
        enabledPackageVersion: '0.2.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    deepLinkingSessions: [
      buildDeepLinkingSessionRecord({
        sessionId: 'deep-linking-session-submit-failure',
        sessionToken: 'deep-linking-token-submit-failure',
        selection: {
          packageVersionId: 2,
          packageVersion: '0.2.0',
          activityId: '/content/bonus.json',
          contentPath: '/content/bonus.json',
        },
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
    deepLinkingResourceOptions: [
      buildDeepLinkingResourceOption({
        packageVersionId: 2,
        packageVersion: '0.2.0',
        contentPath: '/content/bonus.json',
        activityId: '/content/bonus.json',
        contentTitle: 'Bonus Activity',
      }),
    ],
  });
  const formData = new FormData();

  formData.set('token', 'deep-linking-token-submit-failure');

  await withCanvasReturnEnv(async () => {
    const response = await createApp({
      getRepository: () => ({
        ...repository,
        createReviewedPlacement() {
          return Promise.reject(new Error('Lantern could not create the reviewed placement.'));
        },
      }),
    }).request(
      'http://localhost/lti/deep-linking/sessions/deep-linking-session-submit-failure/submit',
      {
        method: 'POST',
        body: formData,
      },
    );

    assertEquals(response.status, 500);

    const body = await response.text();

    assertStringIncludes(body, '<!doctype html>');
    assertStringIncludes(body, 'Assignment resource return failed');
    assertStringIncludes(body, 'Lantern could not create the reviewed placement.');
    assertEquals(body.includes('id="lms-return-form"'), false);
  });
});
