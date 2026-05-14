import { assertEquals, assertRejects } from '@std/assert';
import type { D1Database, D1Parameter, D1PreparedStatement, D1Result } from '../db/d1.ts';
import {
  buildPreviewEvidenceRecord,
  buildPreviewSessionRecord,
} from '../test_helpers/package_review_test_builder_preview.ts';
import { createD1PreviewRepositoryMethods } from './repository_preview_d1.ts';

Deno.test('D1 preview repository creates sessions with JSON capabilities and fixtures', async () => {
  const db = createPlannedD1Database({
    firstResults: [{ id: 1 }, buildPreviewSessionRow()],
  });
  const repository = createD1PreviewRepositoryMethods(db);

  const session = await repository.createPreviewSession(buildPreviewSessionRecord());

  assertEquals(session.sessionId, 'preview-session-123');
  assertEquals(session.capabilities.includes('finalize_attempt'), true);
  assertEquals(db.statements[1]?.parameters[8], JSON.stringify(session.capabilities));
  assertEquals(typeof db.statements[1]?.parameters[18], 'string');
});

Deno.test('D1 preview repository reports missing package versions clearly', async () => {
  const db = createPlannedD1Database({
    firstResults: [null],
  });
  const repository = createD1PreviewRepositoryMethods(db);

  await assertRejects(
    () => repository.createPreviewSession(buildPreviewSessionRecord()),
    Error,
    'Package version id 1 was not found.',
  );
});

Deno.test('D1 preview repository gets latest preview with optional origin filter', async () => {
  const db = createPlannedD1Database({
    firstResults: [buildPreviewSessionRow({ origin: 'adminAuthoringDraft' })],
  });
  const repository = createD1PreviewRepositoryMethods(db);

  const session = await repository.getLatestPreviewSessionByPackageVersion(
    1,
    'adminAuthoringDraft',
  );

  assertEquals(session?.origin, 'adminAuthoringDraft');
  assertEquals(db.statements[0]?.parameters, [1, 'adminAuthoringDraft']);
});

Deno.test('D1 preview repository appends evidence with the next sequence', async () => {
  const db = createPlannedD1Database({
    firstResults: [
      { sessionId: 'preview-session-123' },
      { nextSequence: 3 },
      buildPreviewEvidenceRow({ sequence: 3 }),
    ],
  });
  const repository = createD1PreviewRepositoryMethods(db);

  const evidence = await repository.appendPreviewEvidence({
    previewSessionId: 'preview-session-123',
    eventType: 'preview.launch',
    capability: 'read_launch_context',
    summary: 'Preview launched.',
    detail: { route: '/admin/preview' },
    occurredAt: '2026-05-13T12:00:00.000Z',
  });

  assertEquals(evidence.sequence, 3);
  assertEquals(db.statements[2]?.parameters[5], '{"route":"/admin/preview"}');
});

Deno.test('D1 preview repository lists parsed evidence in sequence order', async () => {
  const db = createPlannedD1Database({
    allResults: [
      [buildPreviewEvidenceRow({ sequence: 1 }), buildPreviewEvidenceRow({ id: 2, sequence: 2 })],
    ],
  });
  const repository = createD1PreviewRepositoryMethods(db);

  const evidence = await repository.listPreviewEvidence('preview-session-123');

  assertEquals(
    evidence.map((item) => item.sequence),
    [1, 2],
  );
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

function buildPreviewSessionRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const record = buildPreviewSessionRecord();

  return {
    sessionId: record.sessionId,
    packageVersionId: record.packageVersionId,
    appId: record.appId,
    packageVersion: record.packageVersion,
    packageTitle: record.packageTitle,
    origin: record.origin,
    contentPath: record.contentPath,
    deepLinkingSessionId: record.deepLinkingSessionId,
    capabilities: JSON.stringify(record.capabilities),
    snapshotRoot: record.snapshotRoot,
    entrypointPath: record.entrypointPath,
    launchUserId: record.launch.userId,
    launchUserRole: record.launch.userRole,
    launchCourseId: record.launch.courseId,
    launchAssignmentId: record.launch.assignmentId,
    launchActivityId: record.launch.activityId,
    fakeAttemptId: record.fakeAttemptId,
    fakeScoreMaximum: record.fakeScoreMaximum,
    fixtureData: JSON.stringify(record.fixtureData),
    createdAt: record.createdAt,
    ...overrides,
  };
}

function buildPreviewEvidenceRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const record = buildPreviewEvidenceRecord();

  return {
    id: record.id,
    previewSessionId: record.previewSessionId,
    sequence: record.sequence,
    eventType: record.eventType,
    capability: record.capability,
    summary: record.summary,
    detail: JSON.stringify(record.detail),
    occurredAt: record.occurredAt,
    ...overrides,
  };
}
