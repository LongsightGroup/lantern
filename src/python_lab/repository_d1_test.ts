import { readFile } from 'node:fs/promises';
import { test } from 'vite-plus/test';
import { assertEquals, assertStringIncludes } from '@std/assert';
import type { D1Database, D1Parameter, D1PreparedStatement, D1Result } from '../db/d1.ts';
import { createD1PythonLabRepository } from './repository_d1.ts';
import type { PythonLabRecord } from './repository.ts';

test('D1 Python Lab admission reserves the IP window and daily visitor in one batch', async () => {
  const db = createRecordingDatabase();
  const repository = createD1PythonLabRepository(db);

  const admission = await repository.reserveLab({
    lab: lab(),
    visitorDay: '2026-07-13',
    ipWindowStartedAt: '2026-07-13T12:00:00.000Z',
  });

  assertEquals(admission.status, 'accepted');
  assertEquals(db.batches.length, 1);
  assertEquals(db.batches[0]?.length, 2);
  assertStringIncludes(db.batches[0]?.[0]?.query ?? '', 'INSERT INTO python_lab_rate_limits');
  assertStringIncludes(db.batches[0]?.[1]?.query ?? '', 'INSERT INTO python_lab_trials');
  assertEquals(db.batches[0]?.[1]?.parameters.slice(0, 3), [
    'lab-123',
    'visitor-hash',
    '2026-07-13',
  ]);
});

test('D1 Python Lab admission translates a unique visitor reservation into a rate-limit result', async () => {
  const db = createRecordingDatabase(
    'UNIQUE constraint failed: python_lab_trials.visitor_hash, python_lab_trials.visitor_day',
  );
  const repository = createD1PythonLabRepository(db);

  const admission = await repository.reserveLab({
    lab: lab(),
    visitorDay: '2026-07-13',
    ipWindowStartedAt: null,
  });

  assertEquals(admission, { status: 'visitor_limited' });
});

test('Python Lab migration persists the daily visitor and final-run recovery constraints', async () => {
  const migration = await readFile('src/db/d1_migrations/0003_python_autograder_lab.sql', 'utf8');

  assertStringIncludes(migration, 'visitor_day TEXT NOT NULL');
  assertStringIncludes(migration, 'UNIQUE (visitor_hash, visitor_day)');
  assertStringIncludes(migration, 'source_persisted_at TEXT');
  assertStringIncludes(migration, 'UNIQUE (attempt_id, phase)');
});

interface RecordingStatement extends D1PreparedStatement {
  readonly query: string;
  readonly parameters: D1Parameter[];
}

function createRecordingDatabase(batchError?: string): D1Database & {
  readonly batches: RecordingStatement[][];
} {
  const batches: RecordingStatement[][] = [];

  return {
    batches,
    prepare(query) {
      let parameters: D1Parameter[] = [];
      const statement: RecordingStatement = {
        query,
        get parameters() {
          return parameters;
        },
        bind(...values) {
          parameters = values;
          return statement;
        },
        all<T>() {
          return Promise.resolve({ success: true, results: [] } satisfies D1Result<T>);
        },
        first<T>() {
          return Promise.resolve(null as T | null);
        },
        run() {
          return Promise.resolve({ success: true });
        },
        raw<T>() {
          return Promise.resolve([] as T[]);
        },
      };
      return statement;
    },
    batch(statements) {
      const recorded = statements as RecordingStatement[];
      batches.push(recorded);
      return Promise.resolve(
        recorded.map((_statement, index) => ({
          success: batchError === undefined || index !== recorded.length - 1,
          ...(batchError === undefined || index !== recorded.length - 1
            ? {}
            : { error: batchError }),
        })),
      );
    },
    exec() {
      return Promise.resolve({ count: 0, duration: 0 });
    },
  };
}

function lab(): PythonLabRecord {
  return {
    labId: 'lab-123',
    visitorHash: 'visitor-hash',
    requestIpHash: 'ip-hash',
    accessTokenHash: 'access-token-hash',
    state: 'generating',
    authorDraft: {
      title: 'Add numbers',
      prompt: 'Write a function that returns the sum of two integers.',
      starterCode: 'def add(left, right):\n    return 0\n',
      functionName: 'add',
    },
    packageVersionId: null,
    privateArtifactKey: 'var/private-python-lab/lab-123/assignment.json',
    failureMessage: null,
    createdAt: '2026-07-13T12:00:00.000Z',
    updatedAt: '2026-07-13T12:00:00.000Z',
    expiresAt: '2026-07-20T12:00:00.000Z',
  };
}
