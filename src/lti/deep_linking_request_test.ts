import { assertEquals, assertExists } from '@std/assert';
import { validateDeepLinkingRequest } from './deep_linking.ts';
import { assertRejectsDeepLinking, decodeJwtPayload } from './deep_linking_test_helpers.ts';
import { isLtiBoundaryDenialError } from './launch_rejection.ts';
import {
  buildDeploymentBinding,
  buildLoginStateRecord,
  buildMoodleDeploymentBinding,
  buildSakaiDeploymentBinding,
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
    targetLinkUri: 'http://localhost:8417/lti/deep-linking',
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
        targetLinkUri: 'http://localhost:8417/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2026-03-24T16:20:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-deep-linking',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8417/lti/deep-linking',
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
        targetLinkUri: 'http://localhost:8417/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2026-03-24T16:20:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-deep-linking-unsupported',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8417/lti/deep-linking',
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

Deno.test('deep linking validator rejects unsupported content-item types with a typed spec-invalid denial', async () => {
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
        state: 'state-deep-linking-typed-denial',
        nonce: 'nonce-deep-linking-typed-denial',
        targetLinkUri: 'http://localhost:8417/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2026-03-24T16:20:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-deep-linking-typed-denial',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8417/lti/deep-linking',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
    deepLinkAcceptTypes: ['html'],
  });

  try {
    await validateDeepLinkingRequest({
      repository,
      state: 'state-deep-linking-typed-denial',
      idToken,
      now: () => new Date('2026-03-24T16:15:00Z'),
      loadJwks: () => Promise.resolve(getTestCanvasJwks()),
    });
  } catch (error) {
    if (!isLtiBoundaryDenialError(error)) {
      throw error;
    }

    assertEquals(error.code, 'unsupported_deep_linking_accept_type');
    assertEquals(error.category, 'specInvalid');
    assertEquals(error.message, 'Unsupported Deep Linking accept_types: html.');
    assertEquals(error.detail.acceptTypes, 'html');
    return;
  }

  throw new Error('Expected typed Deep Linking denial.');
});

Deno.test('deep linking validator retries JWKS once before rejecting a valid authoring request during key rollover', async () => {
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
        ltiProfileOverride: 'governedCompatibility',
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-24T16:00:00Z',
    },
    loginStates: [
      buildLoginStateRecord({
        state: 'state-deep-linking-retry',
        nonce: 'nonce-deep-linking-retry',
        targetLinkUri: 'http://localhost:8417/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2026-03-24T16:20:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-deep-linking-retry',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8417/lti/deep-linking',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
  });
  let jwksRequests = 0;

  const request = await validateDeepLinkingRequest({
    repository,
    state: 'state-deep-linking-retry',
    idToken,
    now: () => new Date('2026-03-24T16:15:00Z'),
    loadJwks: () => {
      jwksRequests += 1;

      return Promise.resolve(jwksRequests === 1 ? { keys: [] } : getTestCanvasJwks());
    },
  });

  assertEquals(jwksRequests, 2);
  assertEquals(request.placement, 'assignment_selection');
  const interopEvents = await repository.listAuditEventsByEventType('interop.path_used');
  assertEquals(
    interopEvents.some((event) => event.detail.path === 'jwks_refetch'),
    true,
  );
});

Deno.test('deep linking validator rejects a key-rollover request in certification mode without retrying JWKS', async () => {
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
        state: 'state-deep-linking-retry-certification',
        nonce: 'nonce-deep-linking-retry-certification',
        targetLinkUri: 'http://localhost:8417/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2026-03-24T16:20:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-deep-linking-retry-certification',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8417/lti/deep-linking',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
  });
  let jwksRequests = 0;

  try {
    await validateDeepLinkingRequest({
      repository,
      state: 'state-deep-linking-retry-certification',
      idToken,
      now: () => new Date('2026-03-24T16:15:00Z'),
      loadJwks: () => {
        jwksRequests += 1;

        return Promise.resolve(jwksRequests === 1 ? { keys: [] } : getTestCanvasJwks());
      },
    });
  } catch (error) {
    if (!isLtiBoundaryDenialError(error)) {
      throw error;
    }

    assertEquals(jwksRequests, 1);
    assertEquals(error.code, 'signature_validation_failed');
    assertEquals(error.category, 'specInvalid');
    return;
  }

  throw new Error('Expected certification Deep Linking denial.');
});

Deno.test('deep linking validator accepts jti as the nonce-equivalent and records the bridge path', async () => {
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
        ltiProfileOverride: 'governedCompatibility',
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-24T16:00:00Z',
    },
    loginStates: [
      buildLoginStateRecord({
        state: 'state-deep-linking-jti',
        nonce: 'nonce-deep-linking-jti',
        targetLinkUri: 'http://localhost:8417/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2026-03-24T16:20:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: null,
    jwtId: 'nonce-deep-linking-jti',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8417/lti/deep-linking',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
  });

  const request = await validateDeepLinkingRequest({
    repository,
    state: 'state-deep-linking-jti',
    idToken,
    now: () => new Date('2026-03-24T16:15:00Z'),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });

  assertEquals(request.placement, 'assignment_selection');

  const interopEvents = await repository.listAuditEventsByEventType('interop.path_used');

  assertEquals(
    interopEvents.some((event) => event.detail.path === 'jti_nonce_bridge'),
    true,
  );
});

Deno.test('deep linking validator rejects the jti nonce bridge in certification mode with a policy denial', async () => {
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
        state: 'state-deep-linking-jti-certification',
        nonce: 'nonce-deep-linking-jti-certification',
        targetLinkUri: 'http://localhost:8417/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2026-03-24T16:20:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: null,
    jwtId: 'nonce-deep-linking-jti-certification',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8417/lti/deep-linking',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
  });

  try {
    await validateDeepLinkingRequest({
      repository,
      state: 'state-deep-linking-jti-certification',
      idToken,
      now: () => new Date('2026-03-24T16:15:00Z'),
      loadJwks: () => Promise.resolve(getTestCanvasJwks()),
    });
  } catch (error) {
    if (!isLtiBoundaryDenialError(error)) {
      throw error;
    }

    assertEquals(error.code, 'nonce_bridge_not_allowed');
    assertEquals(error.category, 'policyDenied');
    return;
  }

  throw new Error('Expected certification Deep Linking denial.');
});

Deno.test('deep linking validator tolerates target_link_uri scheme, query, and trailing-slash drift when the callback host and route still match', async () => {
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
        ltiProfileOverride: 'governedCompatibility',
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-24T16:00:00Z',
    },
    loginStates: [
      buildLoginStateRecord({
        state: 'state-deep-linking-normalized',
        nonce: 'nonce-deep-linking-normalized',
        targetLinkUri: 'https://lantern.example/lti/deep-linking/',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2026-03-24T16:20:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-deep-linking-normalized',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://lantern.example/lti/deep-linking?placement=assignment_selection',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
  });

  const request = await validateDeepLinkingRequest({
    repository,
    state: 'state-deep-linking-normalized',
    idToken,
    now: () => new Date('2026-03-24T16:15:00Z'),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });

  assertEquals(
    request.targetLinkUri,
    'http://lantern.example/lti/deep-linking?placement=assignment_selection',
  );
  const interopEvents = await repository.listAuditEventsByEventType('interop.path_used');

  assertEquals(
    interopEvents.some((event) => event.detail.path === 'target_link_uri_drift'),
    true,
  );
});

Deno.test('deep linking validator rejects target_link_uri normalization drift in certification mode with a policy denial', async () => {
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
        state: 'state-deep-linking-normalized-certification',
        nonce: 'nonce-deep-linking-normalized-certification',
        targetLinkUri: 'https://lantern.example/lti/deep-linking/',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2026-03-24T16:20:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-deep-linking-normalized-certification',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://lantern.example/lti/deep-linking?placement=assignment_selection',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
  });

  try {
    await validateDeepLinkingRequest({
      repository,
      state: 'state-deep-linking-normalized-certification',
      idToken,
      now: () => new Date('2026-03-24T16:15:00Z'),
      loadJwks: () => Promise.resolve(getTestCanvasJwks()),
    });
  } catch (error) {
    if (!isLtiBoundaryDenialError(error)) {
      throw error;
    }

    assertEquals(error.code, 'target_link_uri_drift_not_allowed');
    assertEquals(error.category, 'policyDenied');
    return;
  }

  throw new Error('Expected certification Deep Linking denial.');
});

Deno.test('deep linking validator preserves resource_selection placement when the target_link_uri names it explicitly', async () => {
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
        state: 'state-deep-linking-resource-selection',
        nonce: 'nonce-deep-linking-resource-selection',
        targetLinkUri: 'https://lantern.example/lti/deep-linking?placement=resource_selection',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2026-03-24T16:20:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-deep-linking-resource-selection',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri:
      'http://lantern.example/lti/deep-linking/?placement=resource_selection&source=canvas',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
  });

  const request = await validateDeepLinkingRequest({
    repository,
    state: 'state-deep-linking-resource-selection',
    idToken,
    now: () => new Date('2026-03-24T16:15:00Z'),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });

  assertEquals(request.placement, 'resource_selection');
  assertEquals(
    request.targetLinkUri,
    'http://lantern.example/lti/deep-linking/?placement=resource_selection&source=canvas',
  );
});

Deno.test('deep linking validator rejects target_link_uri placement drift between the saved login state and the launch', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        id: 7,
        appId: 'chapter-4-asteroids',
        binding: buildDeploymentBinding(),
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-24T16:00:00Z',
    },
    loginStates: [
      buildLoginStateRecord({
        state: 'state-deep-linking-placement-mismatch',
        nonce: 'nonce-deep-linking-placement-mismatch',
        targetLinkUri: 'http://localhost:8417/lti/deep-linking',
        createdAt: '2026-03-24T16:10:00Z',
        expiresAt: '2026-03-24T16:20:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-deep-linking-placement-mismatch',
    subject: null,
    messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
    targetLinkUri: 'http://localhost:8417/lti/deep-linking?placement=resource_selection',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
  });

  try {
    await validateDeepLinkingRequest({
      repository,
      state: 'state-deep-linking-placement-mismatch',
      idToken,
      now: () => new Date('2026-03-24T16:15:00Z'),
      loadJwks: () => Promise.resolve(getTestCanvasJwks()),
    });
  } catch (error) {
    if (!isLtiBoundaryDenialError(error)) {
      throw error;
    }

    assertEquals(error.code, 'request_mismatch');
    assertEquals(error.category, 'specInvalid');
    return;
  }

  throw new Error('Expected certification Deep Linking denial.');
});

Deno.test('deep linking validator accepts Moodle and Sakai launches when the saved deployment binding matches', async () => {
  const cases = [
    {
      lms: 'moodle' as const,
      state: 'state-deep-linking-moodle',
      nonce: 'nonce-deep-linking-moodle',
      issuer: 'https://moodle.example',
      clientId: 'moodle-client-123',
      deploymentId: 'moodle-deployment-123',
    },
    {
      lms: 'sakai' as const,
      state: 'state-deep-linking-sakai',
      nonce: 'nonce-deep-linking-sakai',
      issuer: 'https://sakai.example',
      clientId: 'sakai-client-123',
      deploymentId: 'sakai-deployment-123',
    },
  ];

  for (const testCase of cases) {
    const repository = createInMemoryPackageReviewRepository({
      deployments: [
        buildDeploymentRecord({
          id: 7,
          appId: 'chapter-4-asteroids',
          binding: testCase.lms === 'moodle'
            ? buildMoodleDeploymentBinding({
              issuer: testCase.issuer,
              clientId: testCase.clientId,
              deploymentId: testCase.deploymentId,
            })
            : buildSakaiDeploymentBinding({
              issuer: testCase.issuer,
              clientId: testCase.clientId,
              deploymentId: testCase.deploymentId,
            }),
        }),
      ],
      loginStates: [
        buildLoginStateRecord({
          lms: testCase.lms,
          issuer: testCase.issuer,
          clientId: testCase.clientId,
          deploymentId: testCase.deploymentId,
          state: testCase.state,
          nonce: testCase.nonce,
          targetLinkUri: 'http://localhost:8417/lti/deep-linking',
          createdAt: '2026-03-24T16:10:00Z',
          expiresAt: '2026-03-24T16:20:00Z',
        }),
      ],
    });
    const idToken = await signCanvasIdToken({
      deploymentBinding: {
        issuer: testCase.issuer,
        clientId: testCase.clientId,
        deploymentId: testCase.deploymentId,
      },
      nonce: testCase.nonce,
      audience: testCase.clientId,
      subject: null,
      messageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
      targetLinkUri: 'http://localhost:8417/lti/deep-linking',
      deepLinkReturnUrl: `${testCase.issuer}/deep_link_return`,
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
    });

    const request = await validateDeepLinkingRequest({
      repository,
      state: testCase.state,
      idToken,
      now: () => new Date('2026-03-24T16:15:00Z'),
      loadJwks: () => Promise.resolve(getTestCanvasJwks()),
    });

    const savedState = await repository.getLoginStateByState(testCase.state);

    assertEquals(request.lms, testCase.lms);
    assertEquals(request.canvasEnvironment, null);
    assertEquals(request.issuer, testCase.issuer);
    assertEquals(request.clientId, testCase.clientId);
    assertEquals(request.deploymentId, testCase.deploymentId);
    assertEquals(request.deepLinkReturnUrl, `${testCase.issuer}/deep_link_return`);
    assertEquals(savedState?.usedAt !== null, true);
  }
});
