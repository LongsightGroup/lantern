import { assertEquals, assertRejects } from '@std/assert';
import type { D1Database, D1Parameter, D1PreparedStatement, D1Result } from '../db/d1.ts';
import { createD1AuthoringRepositoryMethods } from './repository_authoring_d1.ts';

Deno.test('D1 authoring repository creates drafts from approved browser autograder packages', async () => {
  const db = createPlannedD1Database({
    firstResults: [buildPackageVersionRow(), null, buildAuthoringDraftRow()],
    allResults: [[]],
  });
  const repository = createD1AuthoringRepositoryMethods(db);

  const draft = await repository.createAuthoringDraftFromPackageVersion({
    packageVersionId: 1,
    draftId: 'draft-1',
    createdAt: '2026-05-13T12:00:00.000Z',
  });

  assertEquals(draft.authoringPaths, ['/grader/spec.json', '/examples/evidence.json']);
  assertEquals(db.statements[2]?.parameters[6], '["/grader/spec.json","/examples/evidence.json"]');
});

Deno.test('D1 authoring repository rejects unapproved package versions', async () => {
  const db = createPlannedD1Database({
    firstResults: [buildPackageVersionRow({ approvalStatus: 'pending' })],
  });
  const repository = createD1AuthoringRepositoryMethods(db);

  await assertRejects(
    () =>
      repository.createAuthoringDraftFromPackageVersion({
        packageVersionId: 1,
        draftId: 'draft-1',
        createdAt: '2026-05-13T12:00:00.000Z',
      }),
    Error,
    'Authoring draft requires an approved package version. Found chapter-4-asteroids@0.1.0 in pending state.',
  );
});

Deno.test('D1 authoring repository saves only approved draft paths', async () => {
  const db = createPlannedD1Database({
    firstResults: [
      buildAuthoringDraftRow(),
      buildAuthoringDraftRow({
        latestPromptText: 'Tighten rubric.',
        latestGenerationNotes: '["Adjusted scoring"]',
        savedSource: 'ai',
        updatedAt: '2026-05-13T12:05:00.000Z',
      }),
    ],
    allResults: [[buildAuthoringDraftFileRow()]],
  });
  const repository = createD1AuthoringRepositoryMethods(db);

  const draft = await repository.saveAuthoringDraftFiles({
    draftId: 'draft-1',
    files: [{ relativePath: 'grader/spec.json', contents: '{}' }],
    latestPromptText: 'Tighten rubric.',
    latestGenerationNotes: ['Adjusted scoring'],
    savedSource: 'ai',
    updatedAt: '2026-05-13T12:05:00.000Z',
  });

  assertEquals(draft.savedSource, 'ai');
  assertEquals(draft.files[0]?.relativePath, '/grader/spec.json');
  assertEquals(db.statements[1]?.parameters, ['draft-1', '/grader/spec.json', '{}', 1]);
});

Deno.test('D1 authoring repository rejects files outside the authoring contract', async () => {
  const db = createPlannedD1Database({
    firstResults: [buildAuthoringDraftRow()],
  });
  const repository = createD1AuthoringRepositoryMethods(db);

  await assertRejects(
    () =>
      repository.saveAuthoringDraftFiles({
        draftId: 'draft-1',
        files: [{ relativePath: '/dist/app.js', contents: 'alert(1)' }],
        latestPromptText: null,
        latestGenerationNotes: [],
        savedSource: 'manual',
        updatedAt: '2026-05-13T12:05:00.000Z',
      }),
    Error,
    'Authoring draft file /dist/app.js is outside the approved authoring file set.',
  );
});

Deno.test('D1 authoring repository marks drafts previewed', async () => {
  const db = createPlannedD1Database({
    firstResults: [
      buildAuthoringDraftRow({
        lastPreviewedAt: '2026-05-13T12:05:00.000Z',
        updatedAt: '2026-05-13T12:05:00.000Z',
      }),
    ],
    allResults: [[]],
  });
  const repository = createD1AuthoringRepositoryMethods(db);

  const draft = await repository.markAuthoringDraftPreviewed({
    draftId: 'draft-1',
    previewedAt: '2026-05-13T12:05:00.000Z',
  });

  assertEquals(draft.lastPreviewedAt, '2026-05-13T12:05:00.000Z');
  assertEquals(db.statements[0]?.parameters, [
    '2026-05-13T12:05:00.000Z',
    '2026-05-13T12:05:00.000Z',
    'draft-1',
  ]);
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

function buildPackageVersionRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 1,
    appId: 'chapter-4-asteroids',
    version: '0.1.0',
    title: 'Chapter 4 Asteroids',
    approvalStatus: 'approved',
    manifestJson: JSON.stringify({
      authoring: {
        kind: 'browser_autograder',
        grader_spec_files: ['/grader/spec.json'],
        evidence_example_file: '/examples/evidence.json',
      },
    }),
    artifactRoot: 'var/packages/chapter-4-asteroids/0.1.0',
    ...overrides,
  };
}

function buildAuthoringDraftRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    draftId: 'draft-1',
    packageVersionId: 1,
    appId: 'chapter-4-asteroids',
    packageVersion: '0.1.0',
    packageTitle: 'Chapter 4 Asteroids',
    authoringKind: 'browser_autograder',
    authoringPaths: '["/grader/spec.json","/examples/evidence.json"]',
    baseSnapshotRoot: 'var/packages/chapter-4-asteroids/0.1.0',
    latestPromptText: null,
    latestGenerationNotes: '[]',
    savedSource: 'manual',
    lastPreviewedAt: null,
    createdAt: '2026-05-13T12:00:00.000Z',
    updatedAt: '2026-05-13T12:00:00.000Z',
    ...overrides,
  };
}

function buildAuthoringDraftFileRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    draftId: 'draft-1',
    relativePath: '/grader/spec.json',
    contents: '{}',
    sequence: 1,
    ...overrides,
  };
}
