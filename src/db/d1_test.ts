import { assertEquals, assertInstanceOf, assertRejects } from '@std/assert';
import type { D1Database, D1PreparedStatement, D1Result } from './d1.ts';
import {
  normalizeD1Parameter,
  prepareD1,
  queryD1Objects,
  runD1,
  splitSqlStatements,
} from './d1.ts';

Deno.test('splitSqlStatements keeps semicolons inside strings and comments', () => {
  assertEquals(
    splitSqlStatements(`
      CREATE TABLE notes (body TEXT DEFAULT 'one;two');
      -- comment; stays with the next statement
      INSERT INTO notes (body) VALUES ('it''s;fine');
      /* block; comment */
      CREATE INDEX "idx;notes" ON notes (body);
    `),
    [
      "CREATE TABLE notes (body TEXT DEFAULT 'one;two')",
      "-- comment; stays with the next statement\n      INSERT INTO notes (body) VALUES ('it''s;fine')",
      '/* block; comment */\n      CREATE INDEX "idx;notes" ON notes (body)',
    ],
  );
});

Deno.test('normalizeD1Parameter maps booleans, dates, JSON, and bytes to D1-safe values', () => {
  const date = new Date('2026-05-13T12:34:56.000Z');
  const bytes = new Uint8Array([1, 2, 3]);

  assertEquals(normalizeD1Parameter(true), 1);
  assertEquals(normalizeD1Parameter(false), 0);
  assertEquals(normalizeD1Parameter(date), '2026-05-13T12:34:56.000Z');
  assertEquals(normalizeD1Parameter(['learner', 'instructor']), '["learner","instructor"]');
  assertEquals(
    normalizeD1Parameter({ mode: 'completion', maxScore: 100 }),
    '{"mode":"completion","maxScore":100}',
  );
  assertInstanceOf(normalizeD1Parameter(bytes), ArrayBuffer);
});

Deno.test('prepareD1 binds normalized parameters', () => {
  const db = createStubD1Database();
  const statement = prepareD1(db, 'select * from launches where active = ?', [
    true,
  ]) as StubD1PreparedStatement;

  assertEquals(statement.boundValues, [1]);
});

Deno.test('query helpers fail clearly when D1 reports failure', async () => {
  const db = createStubD1Database({
    runResult: {
      success: false,
      error: 'UNIQUE constraint failed: package_versions.app_version',
    },
  });

  await assertRejects(
    () => runD1(db, 'insert into package_versions (app_id) values (?)', ['demo']),
    Error,
    'UNIQUE constraint failed: package_versions.app_version',
  );
});

Deno.test('queryD1Objects returns rows from successful D1 result', async () => {
  const db = createStubD1Database({
    allResult: {
      success: true,
      results: [{ app_id: 'quick-study' }],
    },
  });

  assertEquals(await queryD1Objects(db, 'select app_id from package_versions'), [
    { app_id: 'quick-study' },
  ]);
});

interface StubD1Options {
  allResult?: D1Result<Record<string, unknown>>;
  runResult?: D1Result<Record<string, unknown>>;
}

type StubD1PreparedStatement = D1PreparedStatement & {
  boundValues: unknown[];
};

function createStubD1Database(options: StubD1Options = {}): D1Database {
  return {
    prepare(_query) {
      return createStubD1Statement(options);
    },
    batch(statements) {
      return Promise.resolve(statements.map(() => ({ success: true })));
    },
    exec(_query) {
      return Promise.resolve({
        count: 1,
        duration: 1,
      });
    },
  };
}

function createStubD1Statement(options: StubD1Options): StubD1PreparedStatement {
  const statement: StubD1PreparedStatement = {
    boundValues: [],
    bind(...values) {
      statement.boundValues = values;
      return statement;
    },
    all<T>() {
      return Promise.resolve((options.allResult ?? { success: true, results: [] }) as D1Result<T>);
    },
    first() {
      return Promise.resolve(null);
    },
    run() {
      return Promise.resolve(options.runResult ?? { success: true });
    },
    raw<T>() {
      return Promise.resolve([] as T[]);
    },
  };

  return statement;
}
