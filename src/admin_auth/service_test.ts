import { assertEquals, assertThrows } from '@std/assert';
import { getAuthTables } from 'better-auth/db';
import { createBetterAdminAuth, createBetterAdminAuthOptions } from './service.ts';
import type { D1Database, D1PreparedStatement, D1Result } from '../db/d1.ts';
import type { EnvReader } from '../platform/env.ts';

Deno.test('createBetterAdminAuth fails clearly when BETTER_AUTH_SECRET is missing', () => {
  const env: EnvReader = {
    get(name: string) {
      return name === 'APP_ORIGIN' ? 'https://lantern.example' : undefined;
    },
  };

  assertThrows(
    () => {
      createBetterAdminAuth({
        db: createStubD1Database(),
        env,
      });
    },
    Error,
    'BETTER_AUTH_SECRET is required',
  );
});

Deno.test('Better Auth migration matches the configured auth schema tables and fields', async () => {
  const migration = await Deno.readTextFile('src/db/d1_migrations/0010_better_auth_tables.sql');
  const tables = getAuthTables(
    createBetterAdminAuthOptions({
      db: createStubD1Database(),
      baseURL: 'https://lantern.example',
      secret: 'test-better-auth-secret-test-better-auth-secret',
      allowSignUp: true,
    }),
  );

  for (const table of Object.values(tables)) {
    const tableName = table.modelName;
    assertEquals(migration.includes(`CREATE TABLE IF NOT EXISTS ${tableName}`), true);

    for (const fieldName of Object.keys(table.fields)) {
      assertEquals(
        migration.includes(`${fieldName} `),
        true,
        `Migration is missing ${tableName}.${fieldName}.`,
      );
    }
  }
});

function createStubD1Database(): D1Database {
  return {
    prepare() {
      return createStubD1Statement();
    },
    batch() {
      return Promise.resolve([]);
    },
    exec() {
      return Promise.resolve({ count: 0, duration: 0 });
    },
  };
}

function createStubD1Statement(): D1PreparedStatement {
  return {
    bind() {
      return this;
    },
    first() {
      return Promise.resolve(null);
    },
    run() {
      return Promise.resolve(createEmptyD1Result());
    },
    all<T = Record<string, unknown>>() {
      return Promise.resolve(createEmptyD1Result<T>());
    },
    raw() {
      return Promise.resolve([]);
    },
  };
}

function createEmptyD1Result<T>(): D1Result<T> {
  return {
    results: [],
    success: true,
    meta: {},
  };
}
