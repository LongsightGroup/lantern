import { assertEquals, assertRejects } from '@std/assert';
import type { D1Database, D1Parameter, D1PreparedStatement, D1Result } from '../db/d1.ts';
import {
  buildAppGenerationRunRecord,
  buildAppGenerationWorkspaceRecord,
} from '../test_helpers/package_review_in_memory_app_generation.ts';
import { createD1AppGenerationRepositoryMethods } from './repository_d1.ts';
import type { AppGenerationRunRecord, AppGenerationWorkspaceRecord } from './types.ts';

Deno.test('D1 app generation repository creates and refetches generation runs', async () => {
  const record = buildAppGenerationRunRecord({
    normalizedRequest: buildNormalizedRequest(),
    appPlan: buildAppPlan(),
    selectedStarterId: 'simple-activity',
    selectedContext: {
      starter: 'simple-activity',
    },
    modelRequestMetadata: [
      {
        provider: 'cloudflare',
        model: '@cf/test/model',
        requestId: 'request-1',
        durationMs: 120,
        responseCharacters: 4096,
        stage: 'author',
        attempt: 1,
        outcome: 'succeeded',
        errorCode: null,
      },
    ],
    generationNotes: ['Plan created.'],
  });
  const db = createPlannedD1Database({
    firstResults: [toD1AppGenerationRunRow(record)],
  });
  const repository = createD1AppGenerationRepositoryMethods(db);

  const created = await repository.createAppGenerationRun(record);

  assertEquals(created.normalizedRequest?.safeToGenerate, true);
  assertEquals(created.appPlan?.appId, 'vocabulary-match');
  assertEquals(created.selectedContext, { starter: 'simple-activity' });
  assertEquals(created.modelRequestMetadata[0]?.requestId, 'request-1');
  assertEquals(typeof db.statements[0]?.parameters[8], 'string');
  assertEquals(db.statements[0]?.parameters[10], 'simple-activity');
});

Deno.test('D1 app generation repository updates generation runs', async () => {
  const record = buildAppGenerationRunRecord({
    status: 'planning',
    updatedAt: '2026-05-14T12:05:00.000Z',
  });
  const db = createPlannedD1Database({
    firstResults: [toD1AppGenerationRunRow(record)],
  });
  const repository = createD1AppGenerationRepositoryMethods(db);

  const updated = await repository.updateAppGenerationRun(record);

  assertEquals(updated.status, 'planning');
  assertEquals(db.statements[0]?.parameters.at(-1), 'generation-1');
});

Deno.test('D1 app generation repository saves and refetches generation workspaces', async () => {
  const record = buildAppGenerationWorkspaceRecord({
    files: [
      {
        path: 'manifest.json',
        role: 'package',
        contents: '{"app_id":"vocabulary-match"}',
      },
      {
        path: 'dist/index.html',
        role: 'package',
        contents: '<main data-test="app-root"></main>',
      },
      {
        path: 'AGENTS.md',
        role: 'instruction',
        contents: 'Use Lantern SDK APIs only.\n',
      },
    ],
    generationPlan: [
      {
        id: 'initialize_workspace',
        status: 'succeeded',
        startedAt: '2026-05-14T12:00:00.000Z',
        completedAt: '2026-05-14T12:00:01.000Z',
        summary: 'Initialized starter workspace.',
        result: {
          recipeId: 'lantern-learning-app-writer@0.1.0',
        },
        diagnosticCount: 0,
      },
    ],
    validationFindings: [
      {
        code: 'preview_failed',
        severity: 'error',
        message: 'Preview assertion failed.',
        file: 'preview/tests.json',
        field: null,
        fix: 'Update the preview test selector.',
        detail: {
          testName: 'renders root',
        },
      },
    ],
    repairAttemptCount: 1,
    updatedAt: '2026-05-14T12:06:00.000Z',
  });
  const db = createPlannedD1Database({
    firstResults: [toD1AppGenerationWorkspaceRow(record)],
  });
  const repository = createD1AppGenerationRepositoryMethods(db);

  const saved = await repository.saveAppGenerationWorkspace(record);

  assertEquals(
    saved.files.map((file) => file.path),
    ['manifest.json', 'dist/index.html', 'AGENTS.md'],
  );
  assertEquals(saved.files[2]?.role, 'instruction');
  assertEquals(saved.generationPlan[0]?.id, 'initialize_workspace');
  assertEquals(saved.generationPlan[0]?.status, 'succeeded');
  assertEquals(saved.validationFindings[0]?.code, 'preview_failed');
  assertEquals(saved.repairAttemptCount, 1);
  assertEquals(typeof db.statements[0]?.parameters[2], 'string');
  assertEquals(typeof db.statements[0]?.parameters[3], 'string');
});

Deno.test('D1 app generation repository reports duplicate generation ids clearly', async () => {
  const db = createPlannedD1Database({
    runError: new Error('UNIQUE constraint failed: app_generation_runs.generation_id'),
  });
  const repository = createD1AppGenerationRepositoryMethods(db);

  await assertRejects(
    () => repository.createAppGenerationRun(buildAppGenerationRunRecord()),
    Error,
    'App generation run generation-1 already exists and cannot be replaced.',
  );
});

interface PlannedD1Options {
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
  const firstResults = [...(options.firstResults ?? [])];

  return {
    statements,
    prepare(query) {
      return createPlannedD1Statement(query, statements, firstResults, options);
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
      return Promise.resolve({ success: true, results: [] as T[] });
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

function toD1AppGenerationRunRow(record: AppGenerationRunRecord): Record<string, unknown> {
  return {
    generationId: record.generationId,
    ownerId: record.ownerId,
    status: record.status,
    requestedAppId: record.requestedAppId,
    generatedAppId: record.generatedAppId,
    generatedVersion: record.generatedVersion,
    packageVersionId: record.packageVersionId,
    promptText: record.promptText,
    normalizedRequestJson: record.normalizedRequest === null
      ? null
      : JSON.stringify(record.normalizedRequest),
    appPlanJson: record.appPlan === null ? null : JSON.stringify(record.appPlan),
    selectedStarterId: record.selectedStarterId,
    selectedContextJson: JSON.stringify(record.selectedContext),
    modelRequestMetadataJson: JSON.stringify(record.modelRequestMetadata),
    generationNotesJson: JSON.stringify(record.generationNotes),
    validationFindingsJson: JSON.stringify(record.validationFindings),
    repairAttemptCount: record.repairAttemptCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toD1AppGenerationWorkspaceRow(
  record: AppGenerationWorkspaceRecord,
): Record<string, unknown> {
  return {
    generationId: record.generationId,
    selectedStarterId: record.selectedStarterId,
    filesJson: JSON.stringify(record.files),
    generationPlanJson: JSON.stringify(record.generationPlan),
    validationFindingsJson: JSON.stringify(record.validationFindings),
    repairAttemptCount: record.repairAttemptCount,
    updatedAt: record.updatedAt,
  };
}

function buildNormalizedRequest(): AppGenerationRunRecord['normalizedRequest'] {
  return {
    learningGoal: 'Practice vocabulary recognition.',
    audience: 'Grade 4',
    contentSummary: 'Ten vocabulary words.',
    requestedActivity: 'matching game',
    constraints: [],
    missingInformation: [],
    safeToGenerate: true,
  };
}

function buildAppPlan(): AppGenerationRunRecord['appPlan'] {
  return {
    appId: 'vocabulary-match',
    title: 'Vocabulary Match',
    description: 'A small matching activity for vocabulary practice.',
    learningGoal: 'Practice vocabulary recognition.',
    audience: 'Grade 4',
    activityType: 'matching',
    learnerFlow: ['Read the prompt.', 'Choose the matching word.', 'Complete all cards.'],
    contentModel: {
      itemCount: 10,
    },
    capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
    grading: {
      mode: 'completion',
      maxScore: 100,
      scoringSummary: 'Completion credit after all cards are answered.',
    },
    attemptEvents: [
      {
        when: 'after each answer',
        eventType: 'answer',
        questionIdPattern: 'card-*',
      },
    ],
    previewTests: ['renders the title'],
    accessibilityNotes: ['Use buttons for answer choices.'],
    riskNotes: [],
  };
}
