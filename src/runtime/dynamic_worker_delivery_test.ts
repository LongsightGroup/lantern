import { test } from 'vite-plus/test';
import { assertEquals, assertNotEquals, assertRejects, assertStringIncludes } from '@std/assert';
import {
  buildReviewedRuntimeAssetMap,
  buildReviewedRuntimeWorkerCode,
  buildReviewedRuntimeWorkerId,
  createDynamicWorkerRuntimeDelivery,
  type DynamicWorkerCode,
} from './dynamic_worker_delivery.ts';
import {
  buildPackageVersionRecord,
  buildRuntimeSessionRecord,
} from '../test_helpers/package_review.ts';

test('Dynamic Worker delivery worker ids stay deterministic and reviewed-identity keyed', () => {
  const firstId = buildReviewedRuntimeWorkerId({
    runtimeContractSignature: 'sig-a',
  });
  const secondId = buildReviewedRuntimeWorkerId({
    runtimeContractSignature: 'sig-a',
  });
  const differentSignatureId = buildReviewedRuntimeWorkerId({
    runtimeContractSignature: 'sig-b',
  });
  const differentEnvelopeId = buildReviewedRuntimeWorkerId({
    runtimeContractSignature: 'sig-a',
    envelopeVersion: 'v2',
  });

  assertEquals(firstId, secondId);
  assertNotEquals(firstId, differentSignatureId);
  assertNotEquals(firstId, differentEnvelopeId);
});

test('Dynamic Worker delivery describes the reviewed envelope using the deterministic worker id', () => {
  const delivery = createDynamicWorkerRuntimeDelivery({
    loader: {
      get() {
        throw new Error('not used');
      },
    },
    snapshotStore: createMemorySnapshotStore({}),
  });
  const session = buildRuntimeSessionRecord();
  const reviewedPackage = buildPackageVersionRecord({
    approvalStatus: 'approved',
    runtimeContractSignature: 'sig-a',
  });

  assertEquals(
    delivery.describeDelivery({
      session,
      reviewedPackage,
    }),
    {
      substrate: 'dynamic_worker',
      workerId: 'reviewed-runtime:v1:sig-a',
    },
  );
});

test('Dynamic Worker delivery embeds immutable reviewed assets plus browser grader files', async () => {
  const session = buildRuntimeSessionRecord({
    snapshotRoot: 'var/packages/template-app/0.1.0',
    entrypointPath: 'var/packages/template-app/0.1.0/dist/index.html',
  });
  const reviewedPackage = buildPackageVersionRecord({
    appId: 'template-app',
    approvalStatus: 'approved',
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
  });
  const snapshotStore = createMemorySnapshotStore({
    'dist/index.html': '<!doctype html><title>Template</title>',
    'dist/app.js': "console.log('template');",
    'grading/specs/checks.spec.js':
      "describe('page', () => it('loads', () => expect(true).toBeTruthy()));",
  });

  const assets = await buildReviewedRuntimeAssetMap({
    session,
    reviewedPackage,
    snapshotStore,
  });

  assertEquals(
    decodeBase64(assets['/dist/index.html']?.bodyBase64 ?? ''),
    '<!doctype html><title>Template</title>',
  );
  assertEquals(
    decodeBase64(assets['/_lantern_internal/browser-grader/reviewed/0.js']?.bodyBase64 ?? ''),
    "describe('page', () => it('loads', () => expect(true).toBeTruthy()));",
  );
  assertStringIncludes(
    decodeBase64(assets['/_lantern_internal/browser-grader/runner.js']?.bodyBase64 ?? ''),
    'document.currentScript',
  );
  assertStringIncludes(
    decodeBase64(assets['/_lantern_internal/browser-grader/jasmine.js']?.bodyBase64 ?? ''),
    'root.__LanternBrowserGrader',
  );
});

test('Dynamic Worker delivery code blocks outbound access and carries no extra bindings', async () => {
  const session = buildRuntimeSessionRecord({
    snapshotRoot: 'var/packages/chapter-4-asteroids/0.1.0',
    entrypointPath: 'var/packages/chapter-4-asteroids/0.1.0/dist/index.html',
  });
  const reviewedPackage = buildPackageVersionRecord({
    approvalStatus: 'approved',
  });
  const code = await buildReviewedRuntimeWorkerCode({
    session,
    reviewedPackage,
    snapshotStore: createMemorySnapshotStore({
      'dist/index.html': '<!doctype html><title>Reviewed</title>',
    }),
  });

  assertEquals(code.globalOutbound, null);
  assertEquals('bindings' in code, false);
  assertStringIncludes(code.modules['index.js'] ?? '', 'Reviewed runtime asset not found.');
  assertEquals((code.modules['index.js'] ?? '').includes('cloudflare:workers'), false);
  assertEquals((code.modules['index.js'] ?? '').includes('Deno.'), false);
  assertEquals((code.modules['index.js'] ?? '').includes('globalThis.Deno'), false);
});

test('reviewed app Workers receive only the LMS binding and hard invocation limits', async () => {
  let loadedCode: DynamicWorkerCode | null = null;
  let invocationLimits: { readonly cpuMs: number; readonly subRequests: number } | null = null;
  const lmsBinding = { listRoster: () => Promise.resolve({ ok: true }) };
  const delivery = createDynamicWorkerRuntimeDelivery({
    loader: {
      get(_id, callback) {
        return {
          getEntrypoint(_name, options) {
            invocationLimits = options?.limits ?? null;
            return {
              async fetch() {
                loadedCode = await callback();
                return new Response('<!doctype html><title>Roster</title>', {
                  headers: { 'content-type': 'text/html' },
                });
              },
            };
          },
        };
      },
    },
    snapshotStore: createMemorySnapshotStore({
      'dist/worker.js': 'export default { fetch() { return new Response("ok"); } };',
    }),
    createLmsBinding(identity) {
      assertEquals(identity, { appId: 'photo-roster', packageVersionId: 7 });
      return lmsBinding;
    },
  });
  const reviewedPackage = buildPackageVersionRecord({
    id: 7,
    appId: 'photo-roster',
    runtime: { kind: 'worker', entrypoint: '/dist/worker.js' },
    capabilities: ['lms.roster.members.read'],
    approvalStatus: 'approved',
  });

  const response = await delivery.invokeReviewedWorker({
    session: { snapshotRoot: reviewedPackage.artifact.snapshotRoot },
    reviewedPackage,
    request: new Request('https://reviewed-app.internal/'),
  });
  const code = loadedCode as DynamicWorkerCode | null;
  if (code === null) {
    throw new Error('Expected the reviewed Worker code to load.');
  }

  assertEquals(response.status, 200);
  assertEquals(invocationLimits, { cpuMs: 50, subRequests: 8 });
  assertEquals(code.globalOutbound, null);
  assertEquals(code.env, { LANTERN_LMS: lmsBinding });
  assertEquals(Object.keys(code.env ?? {}), ['LANTERN_LMS']);
});

test('Dynamic Worker delivery keeps missing reviewed assets distinct from loader delivery failures', async () => {
  const session = buildRuntimeSessionRecord({
    snapshotRoot: 'var/packages/chapter-4-asteroids/0.1.0',
    entrypointPath: 'var/packages/chapter-4-asteroids/0.1.0/dist/index.html',
  });
  const reviewedPackage = buildPackageVersionRecord({
    approvalStatus: 'approved',
  });
  const missingAssetDelivery = createDynamicWorkerRuntimeDelivery({
    loader: createLoaderStub(),
    snapshotStore: createMemorySnapshotStore({
      'dist/index.html': '<!doctype html><title>Reviewed</title>',
    }),
  });

  await assertRejects(
    () =>
      missingAssetDelivery.loadReviewedAsset({
        session,
        reviewedPackage,
        relativePath: 'dist/missing.js',
      }),
    Error,
    'Reviewed runtime asset not found.',
  );

  const brokenDelivery = createDynamicWorkerRuntimeDelivery({
    loader: {
      get() {
        throw new Error('Dynamic Worker loader exploded.');
      },
    },
    snapshotStore: createMemorySnapshotStore({
      'dist/index.html': '<!doctype html><title>Reviewed</title>',
    }),
  });

  await assertRejects(
    () =>
      brokenDelivery.loadReviewedAsset({
        session,
        reviewedPackage,
        relativePath: 'dist/index.html',
      }),
    Error,
    'Dynamic Worker loader exploded.',
  );
});

function createMemorySnapshotStore(files: Record<string, string>) {
  const encodedFiles = new Map(
    Object.entries(files).map(([path, contents]) => [path, new TextEncoder().encode(contents)]),
  );

  return {
    readBytes(_snapshotRoot: string, relativePath: string) {
      const bytes = encodedFiles.get(relativePath);

      if (bytes === undefined) {
        return Promise.reject(new Error(`Reviewed snapshot file ${relativePath} was not found.`));
      }

      return Promise.resolve(bytes.slice());
    },
    writeBytes() {
      return Promise.reject(new Error('writeBytes is not implemented in this test store.'));
    },
    fileExists(_snapshotRoot: string, relativePath: string) {
      return Promise.resolve(encodedFiles.has(relativePath));
    },
    listFiles() {
      return Promise.resolve([...encodedFiles.keys()].sort());
    },
  };
}

function createLoaderStub() {
  return {
    get(
      _id: string,
      callback: () =>
        | Promise<{ modules: Record<string, string> }>
        | {
            modules: Record<string, string>;
          },
    ) {
      return {
        getEntrypoint() {
          return {
            async fetch(request: Request) {
              const code = await callback();
              const source = code.modules['index.js'] ?? '';
              const match = source.match(/const assets = (\{.+\});\n\nexport default/s);

              if (!match?.[1]) {
                throw new Error('Expected generated Dynamic Worker asset map.');
              }

              const assets = JSON.parse(match[1]) as Record<
                string,
                { contentType: string; bodyBase64: string }
              >;
              const asset = assets[new URL(request.url).pathname];

              if (!asset) {
                return new Response('Reviewed runtime asset not found.', {
                  status: 404,
                });
              }

              return new Response(
                Uint8Array.from(atob(asset.bodyBase64), (char) => char.codePointAt(0) ?? 0),
                {
                  status: 200,
                  headers: {
                    'content-type': asset.contentType,
                  },
                },
              );
            },
          };
        },
      };
    },
  };
}

function decodeBase64(value: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(value), (char) => char.codePointAt(0) ?? 0));
}
