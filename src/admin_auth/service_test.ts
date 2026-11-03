import { test } from 'vite-plus/test';
import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert';
import { getAuthTables } from 'better-auth/db';
import { createBetterAdminAuth, createBetterAdminAuthOptions } from './service.ts';
import type { AdminAuthConfig } from './config.ts';
import { withKernelD1 } from '../lms_kernel/d1_test_support.ts';
import type { EnvReader } from '../platform/env.ts';

test('createBetterAdminAuth fails clearly when BETTER_AUTH_SECRET is missing', async () =>
  withKernelD1(async (db) => {
    const env: EnvReader = {
      get(name: string) {
        return name === 'APP_ORIGIN' ? 'https://lantern.example' : undefined;
      },
    };

    assertThrows(
      () => {
        createBetterAdminAuth({
          db,
          env,
        });
      },
      Error,
      'BETTER_AUTH_SECRET is required',
    );
  }));

test('createBetterAdminAuth fails clearly when Google client secret is missing', async () =>
  withKernelD1(async (db) => {
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
          db,
          env,
        });
      },
      Error,
      'GOOGLE_CLIENT_SECRET is required',
    );
  }));

test('Better Auth admin service reports configured social providers', async () =>
  withKernelD1(async (db) => {
    const withoutGoogle = createBetterAdminAuthOptions({
      db,
      config: createAdminAuthConfig({ socialProviders: [] }),
    });
    const withGoogle = createBetterAdminAuthOptions({
      db,
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
    const auth = createBetterAdminAuth({ db, env: googleEnv });
    assertEquals(auth.socialProviders, [{ id: 'google', label: 'Google' }]);
    await auth.getSession(new Request('https://lantern.example/admin'));
  }));

test('Better Auth Google social sign-in preserves authorization redirect and OAuth state cookie', async () =>
  withKernelD1(async (db) => {
    const auth = createBetterAdminAuth({
      db,
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
  }));

test('Better Auth migration matches the configured auth schema tables and fields', async () =>
  withKernelD1(async (db) => {
    const tables = getAuthTables(
      createBetterAdminAuthOptions({
        db,
        config: createAdminAuthConfig(),
      }),
    );

    for (const table of Object.values(tables)) {
      const tableName = table.modelName;
      const columns = await db
        .prepare('SELECT name FROM pragma_table_info(?)')
        .bind(tableName)
        .all<{ name: string }>();
      const columnNames = new Set(columns.results?.map((column) => column.name));
      assertEquals(columnNames.size > 0, true);

      for (const fieldName of Object.keys(table.fields)) {
        assertEquals(
          columnNames.has(fieldName),
          true,
          `Migration is missing ${tableName}.${fieldName}.`,
        );
      }
    }
  }));

function createAdminAuthConfig(overrides: Partial<AdminAuthConfig> = {}): AdminAuthConfig {
  return {
    baseURL: 'https://lantern.example',
    secret: 'test-better-auth-secret-test-better-auth-secret',
    allowSignUp: true,
    socialProviders: [
      {
        id: 'google',
        label: 'Google',
        clientId: 'test-google-client',
        clientSecret: 'test-google-secret',
      },
    ],
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
