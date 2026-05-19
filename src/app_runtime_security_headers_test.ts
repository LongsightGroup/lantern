import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import { createObjectEnvReader } from './platform/env.ts';
import {
  createR2RuntimeArtifactStore,
  type RuntimeArtifactBucket,
} from './runtime/artifact_store.ts';
import {
  contentTypeForRuntimePath,
  createDirectRuntimeDelivery,
  type RuntimeDelivery,
} from './runtime/delivery.ts';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { buildRuntimeSessionRecord, getTestToolPrivateJwkEnvValue } from './test_helpers/lti.ts';

const EXAMPLE_SNAPSHOT_ROOT = 'examples/apps/chapter-4-asteroids';
const TEMPLATE_SNAPSHOT_ROOT = 'examples/apps/template';
const RUNTIME_ENV = createObjectEnvReader({
  APP_ORIGIN: 'https://lantern.example',
  APP_RUNTIME_ORIGIN: 'https://runtime.lantern.example',
  LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue(),
});
const MISSING_RUNTIME_ORIGIN_ENV = createObjectEnvReader({
  APP_ORIGIN: 'https://lantern.example',
  LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue(),
});
const RUNTIME_ARTIFACT_STORE = createR2RuntimeArtifactStore(
  createRuntimeArtifactBucket({
    [`${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`]:
      '<!doctype html><html><head><title>Chapter 4 Asteroids</title></head><body>Chapter 4 Asteroids</body></html>',
    [`${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`]:
      '{"title":"Chapter 4 Asteroids","questions":[{"id":"q1"}]}',
    [`${TEMPLATE_SNAPSHOT_ROOT}/dist/index.html`]:
      '<!doctype html><html><head><title>Template App</title></head><body>Template App</body></html>',
    [`${TEMPLATE_SNAPSHOT_ROOT}/content/activity.json`]: '{"title":"Template App","questions":[]}',
    [`${TEMPLATE_SNAPSHOT_ROOT}/grading/specs/checks.spec.js`]:
      "describe('checks', () => it('passes', () => expect(true).toBeTruthy()));",
  }),
);

Deno.test('runtime document and reviewed assets send deny-by-default containment headers on the configured runtime origin', async () => {
  const app = createApp({
    env: RUNTIME_ENV,
    runtimeArtifactStore: RUNTIME_ARTIFACT_STORE,
    runtimeDelivery: createStubRuntimeDelivery({
      substrate: 'dynamic_worker',
      reviewedAssets: {
        'dist/index.html':
          '<!doctype html><html><head><title>Template App</title></head><body>Template App</body></html>',
        'dist/app.js': 'console.log("template");\n',
      },
      browserGraderAssets: {
        'runner.js':
          'window.__LanternBrowserGraderRunner = { run() { return Promise.resolve(null); } };',
      },
    }),
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
            snapshotRoot: TEMPLATE_SNAPSHOT_ROOT,
            entrypointPath: `${TEMPLATE_SNAPSHOT_ROOT}/dist/index.html`,
            contentPath: `${TEMPLATE_SNAPSHOT_ROOT}/content/activity.json`,
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
  assertStringIncludes(
    csp,
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  );
  assertStringIncludes(csp, "style-src 'self' 'unsafe-inline'");
  assertStringIncludes(csp, "img-src 'self' data:");
  assertStringIncludes(csp, "connect-src 'self' https://cloudflareinsights.com");
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
  assertEquals(browserGraderResponse.headers.get('cross-origin-resource-policy'), 'same-origin');
});

Deno.test('runtime document fails clearly when APP_RUNTIME_ORIGIN is missing', async () => {
  const response = await createApp({
    env: MISSING_RUNTIME_ORIGIN_ENV,
    runtimeArtifactStore: RUNTIME_ARTIFACT_STORE,
    runtimeDelivery: createDirectRuntimeDelivery(RUNTIME_ARTIFACT_STORE),
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
  assertStringIncludes(body, 'APP_RUNTIME_ORIGIN is required to serve reviewed runtime sessions.');
});

function createStubRuntimeDelivery(input: {
  substrate: RuntimeDelivery['substrate'];
  reviewedAssets: Record<string, string>;
  browserGraderAssets?: Record<string, string>;
}): RuntimeDelivery {
  return {
    substrate: input.substrate,
    describeDelivery({ reviewedPackage }) {
      return {
        substrate: input.substrate,
        workerId: input.substrate === 'dynamic_worker'
          ? `reviewed-runtime:v1:${reviewedPackage.runtimeContractSignature}`
          : null,
      };
    },
    loadReviewedAsset({ relativePath }) {
      const contents = input.reviewedAssets[relativePath];

      if (contents === undefined) {
        return Promise.reject(new Error(`Stub reviewed asset ${relativePath} was not configured.`));
      }

      return Promise.resolve({
        bytes: new TextEncoder().encode(contents),
        contentType: contentTypeForRuntimePath(relativePath),
      });
    },
    loadBrowserGraderAsset({ assetPath }) {
      const contents = input.browserGraderAssets?.[assetPath];

      if (contents === undefined) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        bytes: new TextEncoder().encode(contents),
        contentType: contentTypeForRuntimePath(assetPath),
      });
    },
  };
}

function createRuntimeArtifactBucket(files: Record<string, string>): RuntimeArtifactBucket {
  const encodedFiles = new Map(
    Object.entries(files).map(([path, contents]) => [path, new TextEncoder().encode(contents)]),
  );

  return {
    get(key: string) {
      const bytes = encodedFiles.get(key);

      if (bytes === undefined) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        arrayBuffer() {
          return Promise.resolve(bytes.slice().buffer);
        },
      });
    },
  };
}
