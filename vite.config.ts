import { readFile } from 'node:fs/promises';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { cloudflare } from '@cloudflare/vite-plugin';
import { appWriterPlatform } from './cloudflare.platform.ts';
import { defineConfig, loadEnv } from 'vite-plus';

const workerTests = [
  'src/runtime/dynamic_worker_delivery_integration_test.ts',
  'src/admin_auth/service_test.ts',
  'src/lti/tool_provider_d1_test.ts',
  'src/lms_kernel/repository_d1_runtime_test.ts',
  'src/lms_kernel/repository_d1_integration_test.ts',
  'src/app_writer/cloudflare_browser_preview_integration_test.ts',
];

export default defineConfig(({ mode, command }) => ({
  plugins:
    mode === 'test'
      ? []
      : [
          cloudflare({
            auxiliaryWorkers: [{ config: appWriterPlatform }],
            remoteBindings: false,
            config(loaded) {
              if (command !== 'serve') return loaded;
              const local = loadEnv(mode, process.cwd(), '');
              const env = { ...loaded.worker.env };
              // Bind only Lantern settings; never expose the host environment to a Worker.
              for (const name of [
                'APP_ORIGIN',
                'APP_RUNTIME_ORIGIN',
                'APP_ADMIN_TIME_ZONE',
                'ADMIN_AUTH_ALLOW_SIGNUP',
                'APP_WRITER_MODEL',
                'BETTER_AUTH_SECRET',
                'LTI_STATE_SECRET',
                'LTI_TOOL_PRIVATE_JWK',
                'GOOGLE_CLIENT_ID',
                'GOOGLE_CLIENT_SECRET',
                'AUTOGRADER_TURNSTILE_SITE_KEY',
                'AUTOGRADER_TURNSTILE_SECRET',
              ]) {
                const value = local[name];
                if (value !== undefined) env[name] = { type: 'text', value };
              }
              return { ...loaded, worker: { ...loaded.worker, env } };
            },
            types: { includeRuntime: false },
          }),
        ],
  server: { port: 8417, strictPort: true },
  define: { Deno: 'undefined', 'globalThis.Deno': 'undefined' },
  fmt: {
    singleQuote: true,
    printWidth: 100,
    proseWrap: 'preserve',
    ignorePatterns: [
      'private/**',
      'src/generated/**',
      'output/**',
      '.wrangler/**',
      '.playwright-cli/**',
      'examples/apps/**/dist/**',
    ],
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: [
      'private/**',
      'src/generated/**',
      'output/**',
      '.wrangler/**',
      '.playwright-cli/**',
      'examples/apps/**/dist/**',
    ],
    rules: { 'typescript/no-explicit-any': 'error' },
  },
  test: {
    projects: [
      {
        extends: false,
        test: {
          name: 'node',
          include: ['src/**/*_test.ts', 'tools/**/*_test.ts', 'sdk/**/*_test.ts'],
          exclude: workerTests,
        },
      },
      {
        extends: false,
        plugins: [
          cloudflareTest(async () => ({
            config: './cloudflare.test.config.ts',
            miniflare: {
              serviceBindings: { PHOTO_ROSTER: 'photo-roster' },
              workers: [
                {
                  name: 'photo-roster',
                  compatibilityDate: '2026-11-02',
                  modules: true,
                  scriptPath: 'examples/apps/photo-roster/dist/worker.js',
                  serviceBindings: {
                    LANTERN_LMS: {
                      name: 'lantern-lms',
                      compatibilityDate: '2026-11-02',
                      entrypoint: 'LanternLms',
                    },
                  },
                },
                {
                  name: 'lantern-lms',
                  compatibilityDate: '2026-11-02',
                  modules: true,
                  script: await readFile('src/test_helpers/roster_rpc_fixture.mjs', 'utf8'),
                },
              ],
              bindings: { TEST_MIGRATIONS: await readD1Migrations('src/db/d1_migrations') },
            },
          })),
        ],
        test: { name: 'workers', include: workerTests },
      },
    ],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
}));
