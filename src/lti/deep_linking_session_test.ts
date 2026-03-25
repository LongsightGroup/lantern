import { assertEquals, assertExists } from '@std/assert';
import {
  buildDeepLinkingSelectionValue,
  createDeepLinkingSession,
  createReviewedPlacementFromDeepLinkingSession,
  requireAuthorizedDeepLinkingSession,
  resolveDeepLinkingSelection,
  saveDeepLinkingSessionSelection,
} from './deep_linking.ts';
import {
  buildDeepLinkingSessionRecord,
  buildDeploymentBinding,
  buildValidatedDeepLinkingRequest,
} from '../test_helpers/lti.ts';
import {
  buildDeepLinkingResourceOption,
  buildDeepLinkingResourceSelection,
  buildDeploymentRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';

Deno.test('deep linking in-memory fixtures preserve reviewed resources and explicit session selection', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deepLinkingSessions: [buildDeepLinkingSessionRecord()],
    deepLinkingResourceOptions: [
      buildDeepLinkingResourceOption(),
      buildDeepLinkingResourceOption({
        packageVersionId: 2,
        packageVersion: '0.2.0',
        activityId: '/content/bonus.json',
        contentPath: '/content/bonus.json',
        contentTitle: 'Bonus Activity',
      }),
    ],
  });
  const initialSession = await repository.getDeepLinkingSessionById('deep-linking-session-123');
  const options = await repository.listDeepLinkingResourceOptions('chapter-4-asteroids');
  const updatedSession = await repository.updateDeepLinkingSessionSelection({
    sessionId: 'deep-linking-session-123',
    selection: {
      ...buildDeepLinkingResourceSelection({
        packageVersionId: 2,
        packageVersion: '0.2.0',
        activityId: '/content/bonus.json',
        contentPath: '/content/bonus.json',
        contentTitle: 'Bonus Activity',
      }),
    },
  });

  assertEquals(initialSession?.selection, null);
  assertEquals(options.length, 2);
  assertEquals(options[1]?.contentPath, '/content/bonus.json');
  assertEquals(updatedSession.selection?.packageVersionId, 2);
  assertEquals(updatedSession.selection?.contentPath, '/content/bonus.json');
});

Deno.test('createDeepLinkingSession persists a short-lived authoring session without creating runtime state', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        id: 7,
        appId: 'chapter-4-asteroids',
        binding: buildDeploymentBinding(),
      }),
    ],
  });
  const tokens = ['deep-linking-session-456', 'deep-linking-token-456'];
  const session = await createDeepLinkingSession({
    repository,
    request: buildValidatedDeepLinkingRequest({
      internalDeploymentId: 7,
      internalDeploymentSlug: 'chapter-4-asteroids-pilot',
    }),
    now: () => new Date('2026-03-24T16:20:00Z'),
    createOpaqueToken: () => {
      const next = tokens.shift();

      if (!next) {
        throw new Error('Expected another deterministic deep linking token.');
      }

      return next;
    },
  });
  const saved = await repository.getDeepLinkingSessionById('deep-linking-session-456');
  const runtimeSession = await repository.getLatestRuntimeSessionByDeploymentId(7);
  const attempt = await repository.getAttemptById('attempt-123');

  assertEquals(session.sessionId, 'deep-linking-session-456');
  assertEquals(session.sessionToken, 'deep-linking-token-456');
  assertEquals(session.deepLinkReturnUrl.includes('deep_link_return'), true);
  assertEquals(saved?.selection, null);
  assertEquals(runtimeSession, null);
  assertEquals(attempt, null);
});

Deno.test('deep linking helpers authorize the picker session and store one explicit reviewed selection', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deepLinkingSessions: [
      buildDeepLinkingSessionRecord({
        sessionId: 'deep-linking-session-picker',
        sessionToken: 'deep-linking-token-picker',
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
      buildDeepLinkingResourceOption({
        appId: 'other-app',
        packageTitle: 'Other App',
      }),
    ],
  });
  const session = await requireAuthorizedDeepLinkingSession({
    repository,
    sessionId: 'deep-linking-session-picker',
    token: 'deep-linking-token-picker',
    now: () => new Date('2026-03-23T22:46:00Z'),
  });
  const saved = await saveDeepLinkingSessionSelection({
    repository,
    session,
    selectionValue: buildDeepLinkingSelectionValue({
      packageVersionId: 2,
      contentPath: '/content/bonus.json',
    }),
  });
  const resources = await repository.listDeepLinkingResourceOptions(session.appId);
  const selection = resolveDeepLinkingSelection({
    session: saved.session,
    resources,
  });

  assertEquals(resources.length, 2);
  assertEquals(saved.session.selection?.packageVersionId, 2);
  assertEquals(saved.session.selection?.contentPath, '/content/bonus.json');
  assertEquals(saved.selection.packageTitle, 'Chapter 4 Asteroids');
  assertEquals(selection?.contentTitle, 'Bonus Activity');
});

Deno.test('deep linking helpers create one durable reviewed placement from the saved reviewed selection', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deepLinkingSessions: [
      buildDeepLinkingSessionRecord({
        sessionId: 'deep-linking-session-placement',
        selection: {
          packageVersionId: 2,
          packageVersion: '0.2.0',
          activityId: '/content/bonus.json',
          contentPath: '/content/bonus.json',
        },
      }),
    ],
    deepLinkingResourceOptions: [
      buildDeepLinkingResourceOption({
        packageVersionId: 2,
        packageVersion: '0.2.0',
        activityId: '/content/bonus.json',
        contentPath: '/content/bonus.json',
        contentTitle: 'Bonus Activity',
      }),
    ],
  });
  const session = await repository.getDeepLinkingSessionById('deep-linking-session-placement');

  assertExists(session);

  const created = await createReviewedPlacementFromDeepLinkingSession({
    repository,
    session,
    now: () => new Date('2026-03-24T17:00:00Z'),
    createPlacementId: () => 'placement-123',
  });
  const saved = await repository.getReviewedPlacementById('placement-123');

  assertEquals(created.selection.contentTitle, 'Bonus Activity');
  assertEquals(created.placement.placementId, 'placement-123');
  assertEquals(created.placement.deploymentRecordId, session.deploymentRecordId);
  assertEquals(created.placement.contextId, 'course-42');
  assertEquals(created.placement.packageVersionId, 2);
  assertEquals(created.placement.packageVersion, '0.2.0');
  assertEquals(created.placement.packageTitle, 'Chapter 4 Asteroids');
  assertEquals(created.placement.activityId, '/content/bonus.json');
  assertEquals(created.placement.contentPath, '/content/bonus.json');
  assertEquals(created.placement.contentTitle, 'Bonus Activity');
  assertEquals(created.placement.resourceLinkId, null);
  assertEquals(saved?.packageVersionId, 2);
  assertEquals(saved?.contentPath, '/content/bonus.json');
});
