import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import { restoreEnv, withRuntimeOriginEnv } from './app_test_support.ts';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { buildRuntimeSessionRecord, getTestToolPrivateJwkEnvValue } from './test_helpers/lti.ts';

const EXAMPLE_SNAPSHOT_ROOT = 'examples/apps/chapter-4-asteroids';

Deno.test('runtime document and reviewed assets send deny-by-default containment headers on the configured runtime origin', async () => {
  const previousToolKey = Deno.env.get('LTI_TOOL_PRIVATE_JWK');
  const snapshotRoot = 'examples/apps/template';

  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());

  try {
    await withRuntimeOriginEnv(async () => {
      const app = createApp({
        getRepository: () =>
          createInMemoryPackageReviewRepository({
            packageVersions: [
              buildPackageVersionRecord({
                id: 1,
                approvalStatus: 'approved',
                reviewedAt: '2026-03-23T18:05:00Z',
                runtimeContractSignature: 'test-reviewed-runtime-contract-signature',
                grading: {
                  mode: 'browser',
                  rubricFile: null,
                  maxScore: 100,
                },
                manifestJson: {
                  app_id: 'template-app',
                  version: '0.1.0',
                  title: 'Template App',
                  grading: {
                    mode: 'browser',
                    max_score: 100,
                  },
                  authoring: {
                    kind: 'browser_autograder',
                    grader_spec_files: ['/grading/specs/checks.spec.js'],
                    evidence_example_file: '/evidence/example-output.json',
                  },
                },
              }),
            ],
            runtimeSessions: [
              buildRuntimeSessionRecord({
                appId: 'template-app',
                snapshotRoot,
                entrypointPath: `${snapshotRoot}/dist/index.html`,
                contentPath: `${snapshotRoot}/content/activity.json`,
                expiresAt: '2030-03-26T02:45:00Z',
              }),
            ],
          }),
      });
      const documentResponse = await app.request(
        'https://runtime.lantern.example/runtime/sessions/runtime-session-123?token=runtime-token-123',
      );
      const assetResponse = await app.request(
        'https://runtime.lantern.example/runtime/sessions/runtime-session-123/files/__token__/runtime-token-123/dist/app.js',
      );
      const browserGraderResponse = await app.request(
        'https://runtime.lantern.example/runtime/sessions/runtime-session-123/browser-grader/runner.js',
        {
          headers: {
            Authorization: 'Bearer runtime-token-123',
          },
        },
      );
      const csp = documentResponse.headers.get('content-security-policy');
      const permissionsPolicy = documentResponse.headers.get('permissions-policy');

      assertEquals(documentResponse.status, 200);
      assertEquals(assetResponse.status, 200);
      assertEquals(browserGraderResponse.status, 200);

      if (!csp) {
        throw new Error('Expected runtime document response to include Content-Security-Policy.');
      }

      if (!permissionsPolicy) {
        throw new Error('Expected runtime document response to include Permissions-Policy.');
      }

      assertStringIncludes(csp, "default-src 'none'");
      assertStringIncludes(csp, "script-src 'self' 'unsafe-inline'");
      assertStringIncludes(csp, "style-src 'self' 'unsafe-inline'");
      assertStringIncludes(csp, "img-src 'self' data:");
      assertStringIncludes(csp, "connect-src 'self'");
      assertStringIncludes(csp, "worker-src 'none'");
      assertStringIncludes(csp, "object-src 'none'");
      assertStringIncludes(csp, "base-uri 'self'");
      assertStringIncludes(permissionsPolicy, 'camera=()');
      assertStringIncludes(permissionsPolicy, 'microphone=()');
      assertStringIncludes(permissionsPolicy, 'fullscreen=()');
      assertEquals(documentResponse.headers.get('referrer-policy'), 'no-referrer');
      assertEquals(documentResponse.headers.get('x-content-type-options'), 'nosniff');
      assertEquals(documentResponse.headers.get('cross-origin-resource-policy'), 'same-origin');
      assertEquals(assetResponse.headers.get('referrer-policy'), 'no-referrer');
      assertEquals(assetResponse.headers.get('x-content-type-options'), 'nosniff');
      assertEquals(assetResponse.headers.get('cross-origin-resource-policy'), 'same-origin');
      assertEquals(browserGraderResponse.headers.get('referrer-policy'), 'no-referrer');
      assertEquals(browserGraderResponse.headers.get('x-content-type-options'), 'nosniff');
      assertEquals(
        browserGraderResponse.headers.get('cross-origin-resource-policy'),
        'same-origin',
      );
    });
  } finally {
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousToolKey);
  }
});

Deno.test('runtime document fails clearly when APP_RUNTIME_ORIGIN is missing', async () => {
  const previousToolKey = Deno.env.get('LTI_TOOL_PRIVATE_JWK');
  const previousRuntimeOrigin = Deno.env.get('APP_RUNTIME_ORIGIN');

  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());
  Deno.env.delete('APP_RUNTIME_ORIGIN');

  try {
    const response = await createApp({
      getRepository: () =>
        createInMemoryPackageReviewRepository({
          packageVersions: [
            buildPackageVersionRecord({
              id: 1,
              approvalStatus: 'approved',
              reviewedAt: '2026-03-23T18:05:00Z',
              runtimeContractSignature: 'test-reviewed-runtime-contract-signature',
            }),
          ],
          runtimeSessions: [
            buildRuntimeSessionRecord({
              snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
              entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
              contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
              expiresAt: '2030-03-26T02:45:00Z',
            }),
          ],
        }),
    }).request(
      'https://runtime.lantern.example/runtime/sessions/runtime-session-123?token=runtime-token-123',
    );
    const body = await response.text();

    assertEquals(response.status, 500);
    assertStringIncludes(
      body,
      'APP_RUNTIME_ORIGIN is required to serve reviewed runtime sessions.',
    );
  } finally {
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousToolKey);
    restoreEnv('APP_RUNTIME_ORIGIN', previousRuntimeOrigin);
  }
});
