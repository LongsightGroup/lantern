import { assertEquals, assertRejects } from '@std/assert';
import type { D1Database, D1Parameter, D1PreparedStatement, D1Result } from '../db/d1.ts';
import { createD1GradingRepositoryMethods } from './repository_grading_d1.ts';

Deno.test('D1 grading repository stores attempt evidence with next sequence', async () => {
  const artifactRow = buildAttemptEvidenceArtifactRow({ sequence: 2 });
  const db = createPlannedD1Database({
    firstResults: [artifactRow],
  });
  const repository = createD1GradingRepositoryMethods(db);

  const artifact = await repository.createAttemptEvidenceArtifact({
    artifactId: 'artifact-1',
    attemptId: 'attempt-1',
    kind: 'structured_json',
    contentType: 'application/json',
    fileName: 'evidence.json',
    storageKey: 'attempts/attempt-1/evidence.json',
    byteSize: 128,
    sha256: 'sha256',
    createdAt: '2026-05-13T12:00:00.000Z',
  });

  assertEquals(artifact.sequence, 2);
  assertEquals(db.statements[0]?.query.includes('next_evidence_artifact_sequence'), true);
  assertEquals(db.statements[0]?.query.includes('COALESCE(MAX'), false);
  assertEquals(db.statements[0]?.parameters, [
    'artifact-1',
    'structured_json',
    'application/json',
    'evidence.json',
    'attempts/attempt-1/evidence.json',
    128,
    'sha256',
    '2026-05-13T12:00:00.000Z',
    'attempt-1',
  ]);
  assertEquals(db.statements[1]?.query.includes('SET next_evidence_artifact_sequence'), true);
  assertEquals(db.statements[1]?.parameters, ['attempt-1']);
});

Deno.test('D1 grading repository reports duplicate evidence artifacts clearly', async () => {
  const db = createPlannedD1Database({
    batchError: new Error('UNIQUE constraint failed: attempt_evidence_artifacts.artifact_id'),
  });
  const repository = createD1GradingRepositoryMethods(db);

  await assertRejects(
    () =>
      repository.createAttemptEvidenceArtifact({
        artifactId: 'artifact-1',
        attemptId: 'attempt-1',
        kind: 'structured_json',
        contentType: 'application/json',
        fileName: 'evidence.json',
        storageKey: 'attempts/attempt-1/evidence.json',
        byteSize: 128,
        sha256: 'sha256',
        createdAt: '2026-05-13T12:00:00.000Z',
      }),
    Error,
    'Attempt evidence artifact artifact-1 already exists and cannot be replaced.',
  );
});

Deno.test('D1 grading repository returns a concurrent line item binding on unique conflict', async () => {
  const lineItemRow = buildLineItemBindingRow();
  const db = createPlannedD1Database({
    firstResults: [null, lineItemRow],
    runError: new Error('UNIQUE constraint failed: line_item_bindings.line_item_url'),
  });
  const repository = createD1GradingRepositoryMethods(db);

  const binding = await repository.saveLineItemBinding({
    deploymentRecordId: 1,
    packageVersionId: 2,
    contextId: 'course-1',
    resourceLinkId: 'resource-link-1',
    activityId: 'asteroids',
    lineItemsUrl: 'https://canvas.example/line_items',
    lineItemUrl: 'https://canvas.example/line_items/1',
    resourceId: 'resource-1',
    tag: 'asteroids',
    label: 'Asteroids',
    scoreMaximum: 10,
    createdAt: '2026-05-13T12:00:00.000Z',
    updatedAt: '2026-05-13T12:00:00.000Z',
  });

  assertEquals(binding.id, 10);
  assertEquals(db.statements[2]?.parameters, [
    1,
    2,
    'course-1',
    'resource-link-1',
    'asteroids',
    'https://canvas.example/line_items/1',
  ]);
});

Deno.test('D1 grading repository stores grade publication error detail as JSON text', async () => {
  const gradeRow = buildGradePublicationRow({
    errorDetail: '{"reason":"rate_limited"}',
  });
  const db = createPlannedD1Database({
    firstResults: [gradeRow],
  });
  const repository = createD1GradingRepositoryMethods(db);

  const publication = await repository.createGradePublication({
    attemptId: 'attempt-1',
    lineItemBindingId: 10,
    lineItemUrl: 'https://canvas.example/line_items/1',
    platformUserId: 'user-1',
    scoreGiven: 8,
    scoreMaximum: 10,
    activityProgress: 'Completed',
    gradingProgress: 'Failed',
    status: 'failed',
    createdAt: '2026-05-13T12:00:00.000Z',
    updatedAt: '2026-05-13T12:00:00.000Z',
    publishedAt: null,
    errorCode: 'rate_limited',
    errorDetail: { reason: 'rate_limited' },
  });

  assertEquals(publication.errorDetail, { reason: 'rate_limited' });
  assertEquals(db.statements[0]?.parameters[13], '{"reason":"rate_limited"}');
});

Deno.test('D1 grading repository records audit events with JSON detail', async () => {
  const auditRow = buildAuditEventRow({
    detail: '{"placementId":"placement-1"}',
  });
  const db = createPlannedD1Database({
    firstResults: [auditRow],
  });
  const repository = createD1GradingRepositoryMethods(db);

  const event = await repository.recordAuditEvent({
    eventType: 'reviewer.placement.approved',
    actorType: 'user',
    actorId: 'reviewer-1',
    deploymentRecordId: 1,
    packageVersionId: 2,
    attemptId: null,
    lineItemBindingId: null,
    status: 'succeeded',
    summary: 'Placement approved.',
    detail: { placementId: 'placement-1' },
    occurredAt: '2026-05-13T12:00:00.000Z',
  });

  assertEquals(event.detail, { placementId: 'placement-1' });
  assertEquals(db.statements[0]?.parameters[9], '{"placementId":"placement-1"}');
});

interface PlannedD1Options {
  allResults?: Array<Array<Record<string, unknown>>>;
  firstResults?: Array<Record<string, unknown> | null>;
  firstError?: Error;
  batchError?: Error;
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
    batch<T>(batchStatements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      for (const statement of batchStatements) {
        const recorded = statement as D1PreparedStatement & RecordedStatement;
        statements.push({
          query: recorded.query,
          parameters: recorded.parameters,
        });
      }

      if (options.batchError !== undefined) {
        return Promise.resolve(
          [
            {
              success: false,
              error: options.batchError.message,
            },
          ] satisfies D1Result<T>[],
        );
      }

      return Promise.resolve(
        batchStatements.map((_statement, index) => ({
          success: true,
          results: (index === 0 ? [firstResults.shift()].filter(isRecord) : []) as T[],
        })) satisfies D1Result<T>[],
      );
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

  const statement = {
    query,
    get parameters() {
      return parameters;
    },
    bind(...values: D1Parameter[]) {
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
      if (options.firstError !== undefined) {
        throw options.firstError;
      }

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

  return statement;
}

function isRecord(
  value: Record<string, unknown> | null | undefined,
): value is Record<string, unknown> {
  return value !== null && value !== undefined;
}

function buildAttemptEvidenceArtifactRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    artifactId: 'artifact-1',
    attemptId: 'attempt-1',
    sequence: 1,
    kind: 'structured_json',
    contentType: 'application/json',
    fileName: 'evidence.json',
    storageKey: 'attempts/attempt-1/evidence.json',
    byteSize: 128,
    sha256: 'sha256',
    createdAt: '2026-05-13T12:00:00.000Z',
    ...overrides,
  };
}

function buildLineItemBindingRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 10,
    deploymentRecordId: 1,
    packageVersionId: 2,
    contextId: 'course-1',
    resourceLinkId: 'resource-link-1',
    activityId: 'asteroids',
    lineItemsUrl: 'https://canvas.example/line_items',
    lineItemUrl: 'https://canvas.example/line_items/1',
    resourceId: 'resource-1',
    tag: 'asteroids',
    label: 'Asteroids',
    scoreMaximum: 10,
    createdAt: '2026-05-13T12:00:00.000Z',
    updatedAt: '2026-05-13T12:00:00.000Z',
    ...overrides,
  };
}

function buildGradePublicationRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 20,
    attemptId: 'attempt-1',
    lineItemBindingId: 10,
    lineItemUrl: 'https://canvas.example/line_items/1',
    platformUserId: 'user-1',
    scoreGiven: 8,
    scoreMaximum: 10,
    activityProgress: 'Completed',
    gradingProgress: 'Failed',
    status: 'failed',
    createdAt: '2026-05-13T12:00:00.000Z',
    updatedAt: '2026-05-13T12:00:00.000Z',
    publishedAt: null,
    errorCode: 'rate_limited',
    errorDetail: null,
    ...overrides,
  };
}

function buildAuditEventRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 30,
    eventType: 'reviewer.placement.approved',
    actorType: 'user',
    actorId: 'reviewer-1',
    deploymentRecordId: 1,
    packageVersionId: 2,
    attemptId: null,
    lineItemBindingId: null,
    status: 'succeeded',
    summary: 'Placement approved.',
    detail: '{"placementId":"placement-1"}',
    occurredAt: '2026-05-13T12:00:00.000Z',
    ...overrides,
  };
}
