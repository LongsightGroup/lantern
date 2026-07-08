import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert';
import { getAuthTables } from 'better-auth/db';
import { createBetterAdminAuth, createBetterAdminAuthOptions } from './service.ts';
import type { AdminAuthConfig } from './config.ts';
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

Deno.test('createBetterAdminAuth fails clearly when Google client secret is missing', () => {
  const env: EnvReader = {
    get(name: string) {
      const values: Record<string, string> = {
        APP_ORIGIN: 'https://lantern.example',
        BETTER_AUTH_SECRET: 'test-better-auth-secret-test-better-auth-secret',
        GOOGLE_CLIENT_ID: 'test-google-client',
      };

      return values[name];
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
    'GOOGLE_CLIENT_SECRET is required',
  );
});

Deno.test('Better Auth admin service reports configured social providers', () => {
  const withoutGoogle = createBetterAdminAuthOptions({
    db: createStubD1Database(),
    config: createAdminAuthConfig({ socialProviders: [] }),
  });
  const withGoogle = createBetterAdminAuthOptions({
    db: createStubD1Database(),
    config: createAdminAuthConfig(),
  });
  const googleEnv: EnvReader = {
    get(name: string) {
      const values: Record<string, string> = {
        APP_ORIGIN: 'https://lantern.example',
        BETTER_AUTH_SECRET: 'test-better-auth-secret-test-better-auth-secret',
        GOOGLE_CLIENT_ID: 'test-google-client',
        GOOGLE_CLIENT_SECRET: 'test-google-secret',
      };

      return values[name];
    },
  };

  assertEquals(withoutGoogle.socialProviders, undefined);
  assertEquals(withGoogle.socialProviders?.google === undefined, false);
  assertEquals(
    createBetterAdminAuth({
      db: createStubD1Database(),
      env: googleEnv,
    }).socialProviders,
    [{ id: 'google', label: 'Google' }],
  );
});

Deno.test('Better Auth Google social sign-in preserves authorization redirect and OAuth state cookie', async () => {
  const auth = createBetterAdminAuth({
    db: createStubD1Database(),
    env: createObjectEnvReader({
      APP_ORIGIN: 'https://lantern.example',
      BETTER_AUTH_SECRET: 'test-better-auth-secret-test-better-auth-secret',
      GOOGLE_CLIENT_ID: 'test-google-client',
      GOOGLE_CLIENT_SECRET: 'test-google-secret',
    }),
  });

  const result = await auth.startSocialSignIn({
    request: new Request('https://lantern.example/admin/login/google', { method: 'POST' }),
    providerId: 'google',
    returnTo: '/admin/packages',
  });

  assertEquals(result.success, true);

  if (!result.success) {
    throw new Error(result.message);
  }

  const location = result.response.headers.get('location') ?? '';
  const setCookie = result.response.headers.get('set-cookie') ?? '';

  assertEquals(result.response.status, 303);
  assertStringIncludes(location, 'https://accounts.google.com/o/oauth2/v2/auth?');
  assertStringIncludes(location, 'client_id=test-google-client');
  assertStringIncludes(
    location,
    'redirect_uri=https%3A%2F%2Flantern.example%2Fapi%2Fauth%2Fcallback%2Fgoogle',
  );
  assertStringIncludes(setCookie, 'better-auth.state=');
});

Deno.test('Better Auth migration matches the configured auth schema tables and fields', async () => {
  const migration = await Deno.readTextFile('src/db/d1_migrations/0010_better_auth_tables.sql');
  const tables = getAuthTables(
    createBetterAdminAuthOptions({
      db: createStubD1Database(),
      config: createAdminAuthConfig(),
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
    prepare(query: string) {
      return createStubD1Statement(query);
    },
    batch() {
      return Promise.resolve([]);
    },
    exec() {
      return Promise.resolve({ count: 0, duration: 0 });
    },
  };
}

function createAdminAuthConfig(
  overrides: Partial<AdminAuthConfig> = {},
): AdminAuthConfig {
  return {
    baseURL: 'https://lantern.example',
    secret: 'test-better-auth-secret-test-better-auth-secret',
    allowSignUp: true,
    socialProviders: [{
      id: 'google',
      label: 'Google',
      clientId: 'test-google-client',
      clientSecret: 'test-google-secret',
    }],
    ...overrides,
  };
}

function createObjectEnvReader(values: Record<string, string>): EnvReader {
  return {
    get(name: string) {
      return values[name];
    },
  };
}

function createStubD1Statement(query: string): D1PreparedStatement {
  let boundParams: unknown[] = [];

  return {
    bind(...params: unknown[]) {
      boundParams = params;
      return this;
    },
    first() {
      return Promise.resolve(null);
    },
    run() {
      return Promise.resolve(createD1Result(createReturningRows(query, boundParams)));
    },
    all<T = Record<string, unknown>>() {
      return Promise.resolve(createD1Result(createReturningRows(query, boundParams) as T[]));
    },
    raw() {
      return Promise.resolve([]);
    },
  };
}

function createReturningRows(query: string, params: unknown[]): Array<Record<string, unknown>> {
  if (!query.includes('insert into "auth_verifications"')) {
    return [];
  }

  const [identifier, value, expiresAt, createdAt, updatedAt, id] = params;

  return [{
    id,
    identifier,
    value,
    expiresAt,
    createdAt,
    updatedAt,
  }];
}

function createD1Result<T>(results: T[]): D1Result<T> {
  return {
    results,
    success: true,
    meta: {},
  };
}
