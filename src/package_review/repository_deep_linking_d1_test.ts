import { assertEquals, assertRejects } from '@std/assert';
import type { D1Database, D1Parameter, D1PreparedStatement, D1Result } from '../db/d1.ts';
import { buildDeepLinkingSessionRecord } from '../test_helpers/lti_session_builders.ts';
import { createD1DeepLinkingRepositoryMethods } from './repository_deep_linking_d1.ts';

Deno.test('D1 deep linking repository creates and parses JSON-backed session settings', async () => {
  const sessionRow = buildDeepLinkingSessionRow({
    acceptMultiple: 1,
    acceptPresentationDocumentTargets: '["iframe","window"]',
    acceptLineItem: 1,
    selectedPackageVersionId: 2,
    selectedPackageVersion: '0.1.0',
    selectedActivityId: 'asteroids',
    selectedContentPath: 'activities/asteroids.html',
  });
  const db = createPlannedD1Database({
    firstResults: [sessionRow],
  });
  const repository = createD1DeepLinkingRepositoryMethods(db);

  const session = await repository.createDeepLinkingSession(
    buildDeepLinkingSessionRecord({
      acceptMultiple: true,
      acceptPresentationDocumentTargets: ['iframe', 'window'],
      acceptLineItem: true,
      selection: {
        packageVersionId: 2,
        packageVersion: '0.1.0',
        activityId: 'asteroids',
        contentPath: 'activities/asteroids.html',
      },
    }),
  );

  assertEquals(session.acceptMultiple, true);
  assertEquals(session.acceptPresentationDocumentTargets, ['iframe', 'window']);
  assertEquals(session.selection?.activityId, 'asteroids');
  assertEquals(db.statements[0]?.parameters[12], '["ltiResourceLink"]');
  assertEquals(db.statements[0]?.parameters[13], 1);
});

Deno.test('D1 deep linking repository rejects already-used sessions', async () => {
  const db = createPlannedD1Database({
    firstResults: [
      buildDeepLinkingSessionRow({
        usedAt: '2026-05-13T12:00:00.000Z',
      }),
    ],
  });
  const repository = createD1DeepLinkingRepositoryMethods(db);

  await assertRejects(
    () =>
      repository.consumeDeepLinkingSession({
        sessionId: 'deep-linking-session-123',
        usedAt: '2026-05-13T12:05:00.000Z',
      }),
    Error,
    'Deep Linking session deep-linking-session-123 has already been used.',
  );
});

Deno.test('D1 reviewed placement binding returns existing idempotent binding', async () => {
  const db = createPlannedD1Database({
    firstResults: [
      buildReviewedPlacementRow({
        resourceLinkId: 'resource-link-1',
        boundAt: '2026-05-13T12:00:00.000Z',
      }),
    ],
  });
  const repository = createD1DeepLinkingRepositoryMethods(db);

  const placement = await repository.bindReviewedPlacementResourceLink({
    placementId: 'placement-1',
    resourceLinkId: 'resource-link-1',
    boundAt: '2026-05-13T12:00:00.000Z',
  });

  assertEquals(placement.resourceLinkId, 'resource-link-1');
  assertEquals(db.statements.length, 1);
});

Deno.test('D1 reviewed placement binding rejects conflicting resource links', async () => {
  const db = createPlannedD1Database({
    firstResults: [
      buildReviewedPlacementRow({
        resourceLinkId: 'resource-link-1',
        boundAt: '2026-05-13T12:00:00.000Z',
      }),
    ],
  });
  const repository = createD1DeepLinkingRepositoryMethods(db);

  await assertRejects(
    () =>
      repository.bindReviewedPlacementResourceLink({
        placementId: 'placement-1',
        resourceLinkId: 'resource-link-2',
        boundAt: '2026-05-13T12:05:00.000Z',
      }),
    Error,
    'Reviewed placement placement-1 is already bound to Canvas resource link resource-link-1.',
  );
});

Deno.test('D1 reviewed placement audit snapshot maps counts and status', async () => {
  const db = createPlannedD1Database({
    firstResults: [
      {
        ...buildReviewedPlacementRow({
          resourceLinkId: 'resource-link-1',
          boundAt: '2026-05-13T12:00:00.000Z',
        }),
        latestPreviewSessionId: 'preview-session-1',
        latestPreviewOccurredAt: '2026-05-13T12:03:00.000Z',
        previewEvidenceCount: 2,
        deepLinkingRequestCount: 1,
        placementEventCount: 1,
        reviewerEventCount: 1,
        latestAuditOccurredAt: '2026-05-13T12:04:00.000Z',
      },
    ],
  });
  const repository = createD1DeepLinkingRepositoryMethods(db);

  const snapshot = await repository.requirePlacementAuditSnapshotById('placement-1');

  assertEquals(snapshot.status, 'reviewed');
  assertEquals(snapshot.previewEvidenceCount, 2);
  assertEquals(snapshot.evidenceSummary.reviewerEventCount, 1);
});

interface PlannedD1Options {
  allResults?: Array<Array<Record<string, unknown>>>;
  firstResults?: Array<Record<string, unknown> | null>;
  runError?: Error;
}

interface RecordedStatement {
  query: string;
  parameters: D1Parameter[];
}

function createPlannedD1Database(
  options: PlannedD1Options,
): D1Database & { statements: RecordedStatement[] } {
  const statements: RecordedStatement[] = [];
  const allResults = [...(options.allResults ?? [])];
  const firstResults = [...(options.firstResults ?? [])];

  return {
    statements,
    prepare(query) {
      return createPlannedD1Statement(query, statements, allResults, firstResults, options);
    },
    batch(_statements) {
      return Promise.resolve([]);
    },
    exec(_query) {
      return Promise.resolve({
        count: 0,
        duration: 0,
      });
    },
  };
}

function createPlannedD1Statement(
  query: string,
  statements: RecordedStatement[],
  allResults: Array<Array<Record<string, unknown>>>,
  firstResults: Array<Record<string, unknown> | null>,
  options: PlannedD1Options,
): D1PreparedStatement {
  let parameters: D1Parameter[] = [];

  return {
    bind(...values) {
      parameters = values;
      return this;
    },
    all<T>() {
      statements.push({ query, parameters });
      return Promise.resolve({
        success: true,
        results: (allResults.shift() ?? []) as T[],
      });
    },
    first<T>() {
      statements.push({ query, parameters });
      return Promise.resolve((firstResults.shift() as T | null | undefined) ?? null);
    },
    run() {
      statements.push({ query, parameters });

      if (options.runError) {
        throw options.runError;
      }

      return Promise.resolve({ success: true } satisfies D1Result<Record<string, unknown>>);
    },
    raw<T>() {
      return Promise.resolve([] as T[]);
    },
  };
}

function buildDeepLinkingSessionRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    sessionId: 'deep-linking-session-123',
    sessionToken: 'deep-linking-token-123',
    deploymentRecordId: 1,
    deploymentSlug: 'chapter-4-asteroids-pilot',
    appId: 'chapter-4-asteroids',
    userId: 'canvas-user-123',
    userRole: 'instructor',
    contextId: 'course-42',
    contextTitle: 'Physics 101',
    deepLinkReturnUrl: 'https://canvas.example/courses/42/deep_link_return',
    data: 'deep-linking-state-token',
    placement: 'assignment_selection',
    acceptTypes: '["ltiResourceLink"]',
    acceptMultiple: 0,
    acceptPresentationDocumentTargets: '["iframe"]',
    acceptLineItem: 0,
    selectedPackageVersionId: null,
    selectedPackageVersion: null,
    selectedActivityId: null,
    selectedContentPath: null,
    createdAt: '2026-05-13T12:00:00.000Z',
    expiresAt: '2026-05-13T12:10:00.000Z',
    usedAt: null,
    ...overrides,
  };
}

function buildReviewedPlacementRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    placementId: 'placement-1',
    deploymentRecordId: 1,
    deploymentSlug: 'chapter-4-asteroids-pilot',
    appId: 'chapter-4-asteroids',
    contextId: 'course-42',
    contextTitle: 'Physics 101',
    packageVersionId: 2,
    packageVersion: '0.1.0',
    packageTitle: 'Chapter 4 Asteroids',
    activityId: 'asteroids',
    contentPath: 'activities/asteroids.html',
    contentTitle: 'Asteroids',
    createdByUserId: 'canvas-user-123',
    resourceLinkId: null,
    createdAt: '2026-05-13T12:00:00.000Z',
    boundAt: null,
    ...overrides,
  };
}
