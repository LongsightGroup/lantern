import { assertEquals, assertRejects } from '@std/assert';
import { resolveWorkerServices } from './app_worker_services.ts';
import type { D1Database } from './db/d1.ts';
import { createObjectEnvReader } from './platform/env.ts';
import { getReferencePackageBucketSourceRoot } from './package_review/intake.ts';
import { createMemoryPackageSource } from './package_review/package_source.ts';
import { verifyReviewedRuntimeContractSignature } from './package_review/runtime_contract.ts';
import type { RuntimeArtifactBucket } from './runtime/artifact_store.ts';
import { getTestToolPrivateJwkEnvValue } from './test_helpers/lti.ts';
import {
  buildPackageVersionRecord,
  buildRuntimeSessionRecord,
} from './test_helpers/package_review.ts';

const DEMO_BUCKET_SOURCE_ROOT = getReferencePackageBucketSourceRoot('chapter-4-asteroids');
const DEMO_SNAPSHOT_ROOT = 'var/packages/chapter-4-asteroids/0.1.0';
const DEMO_REFERENCE_SOURCE_FILES = {
  'manifest.json': `{
  "schema_version": "1",
  "app_id": "chapter-4-asteroids",
  "version": "0.1.0",
  "title": "Chapter 4 Asteroids",
  "description": "A colorful arcade interceptor that turns vocabulary review into a live asteroid mission.",
  "owner": {
    "type": "user",
    "id": "instructor_123"
  },
  "entrypoint": "/dist/index.html",
  "roles": ["learner", "instructor"],
  "install_scope": "course",
  "capabilities": [
    "read_launch_context",
    "read_activity_content",
    "submit_attempt_event",
    "finalize_attempt",
    "read_local_state",
    "write_local_state"
  ],
  "grading": {
    "mode": "declarative",
    "rubric_file": "/scoring/rubric.json",
    "max_score": 100
  },
  "browser": {
    "fullscreen": false,
    "clipboard_write": false
  },
  "content_files": ["/content/activity.json"],
  "preview": {
    "fixtures_file": "/preview/fixtures.json",
    "tests_file": "/preview/tests.json"
  }
}
`,
  'dist/index.html':
    '<!doctype html><html><head><title>Chapter 4 Asteroids</title><script src="app.js"></script></head><body>Asteroids</body></html>\n',
  'dist/app.js': "console.log('chapter-4-asteroids');\n",
  'content/activity.json': '{"title":"Chapter 4 Asteroids","questions":[{"id":"q1"}]}\n',
  'preview/fixtures.json': '{}\n',
  'preview/tests.json': '[]\n',
  'scoring/rubric.json': '{"max_score":100}\n',
} as const;
const QUICK_STUDY_SOURCE_FILES = {
  'manifest.json': `{
  "schema_version": "1",
  "app_id": "quick-study",
  "version": "0.1.0",
  "title": "Quick Study",
  "description": "A calm flashcard deck that turns short review sessions into a streak-driven study ritual.",
  "owner": {
    "type": "user",
    "id": "instructor_123"
  },
  "entrypoint": "/dist/index.html",
  "roles": ["learner", "instructor"],
  "install_scope": "course",
  "capabilities": [
    "read_launch_context",
    "read_activity_content",
    "submit_attempt_event",
    "finalize_attempt",
    "read_local_state",
    "write_local_state"
  ],
  "grading": {
    "mode": "completion",
    "max_score": 100
  },
  "browser": {
    "fullscreen": false,
    "clipboard_write": false
  },
  "content_files": ["/content/activity.json"],
  "preview": {
    "fixtures_file": "/preview/fixtures.json",
    "tests_file": "/preview/tests.json"
  }
}
`,
  'dist/index.html':
    '<!doctype html><html><head><title>Quick Study</title><script src="app.js"></script></head><body>Quick Study</body></html>\n',
  'dist/app.js': "console.log('quick-study');\n",
  'content/activity.json': '{"title":"Quick Study","questions":[{"id":"card-1"}]}\n',
  'preview/fixtures.json': '{}\n',
  'preview/tests.json': '[]\n',
} as const;

Deno.test('worker services import and reload the demo package from PACKAGE_ARTIFACTS', async () => {
  const bucket = createSeededArtifactBucket(DEMO_BUCKET_SOURCE_ROOT, DEMO_REFERENCE_SOURCE_FILES);
  const env = createObjectEnvReader({
    LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue(),
  });
  const services = resolveWorkerServices({ PACKAGE_ARTIFACTS: bucket }, env);

  assertEquals(await services.loadReferencePackageSnapshot('chapter-4-asteroids'), null);

  const reviewData = await services.readReferencePackageReviewData('chapter-4-asteroids');

  assertEquals(reviewData.appId, 'chapter-4-asteroids');
  assertEquals(reviewData.version, '0.1.0');

  const imported = await services.importReferencePackage('chapter-4-asteroids');

  assertEquals(imported.artifact.snapshotRoot, DEMO_SNAPSHOT_ROOT);
  assertEquals(imported.artifact.manifestPath, `${DEMO_SNAPSHOT_ROOT}/manifest.json`);
  assertEquals(imported.artifact.entrypointPath, `${DEMO_SNAPSHOT_ROOT}/dist/index.html`);
  assertEquals(
    await readBucketText(bucket, `${DEMO_SNAPSHOT_ROOT}/manifest.json`),
    DEMO_REFERENCE_SOURCE_FILES['manifest.json'],
  );

  await verifyReviewedRuntimeContractSignature({
    runtimeContract: imported.runtimeContract,
    runtimeContractSignature: imported.runtimeContractSignature,
    env,
  });

  const loaded = await services.loadReferencePackageSnapshot('chapter-4-asteroids');

  if (loaded === null) {
    throw new Error('Expected stored demo package snapshot after import.');
  }

  assertEquals(loaded.reviewData.appId, imported.reviewData.appId);
  assertEquals(loaded.reviewData.version, imported.reviewData.version);
  assertEquals(loaded.artifact.digest, imported.artifact.digest);

  await verifyReviewedRuntimeContractSignature({
    runtimeContract: loaded.runtimeContract,
    runtimeContractSignature: loaded.runtimeContractSignature,
    env,
  });

  await assertRejects(
    () => services.importReferencePackage('chapter-4-asteroids'),
    Error,
    'Package version chapter-4-asteroids@0.1.0 already exists and cannot be replaced.',
  );
});

Deno.test('worker services import and reload arbitrary reviewed package sources', async () => {
  const bucket = createInMemoryArtifactBucket({});
  const env = createObjectEnvReader({
    LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue(),
  });
  const services = resolveWorkerServices({ PACKAGE_ARTIFACTS: bucket }, env);
  const source = createMemoryPackageSource(
    Object.entries(QUICK_STUDY_SOURCE_FILES).map(([relativePath, bytes]) => ({
      relativePath,
      bytes,
    })),
  );

  assertEquals(await services.loadPackageSnapshotFromSource(source), null);

  const imported = await services.importPackageFromSource(source);

  assertEquals(imported.reviewData.appId, 'quick-study');
  assertEquals(imported.reviewData.version, '0.1.0');
  assertEquals(imported.artifact.snapshotRoot, 'var/packages/quick-study/0.1.0');
  assertEquals(
    await readBucketText(bucket, 'var/packages/quick-study/0.1.0/manifest.json'),
    QUICK_STUDY_SOURCE_FILES['manifest.json'],
  );

  await verifyReviewedRuntimeContractSignature({
    runtimeContract: imported.runtimeContract,
    runtimeContractSignature: imported.runtimeContractSignature,
    env,
  });

  const loaded = await services.loadPackageSnapshotFromSource(source);

  if (loaded === null) {
    throw new Error('Expected stored reviewed package snapshot after import.');
  }

  assertEquals(loaded.reviewData.appId, imported.reviewData.appId);
  assertEquals(loaded.reviewData.version, imported.reviewData.version);
  assertEquals(loaded.artifact.digest, imported.artifact.digest);

  await assertRejects(
    () => services.importPackageFromSource(source),
    Error,
    'Package version quick-study@0.1.0 already exists and cannot be replaced.',
  );
});

Deno.test('worker services expose Dynamic Worker runtime delivery only when LOADER is bound', async () => {
  const env = createObjectEnvReader({
    LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue(),
  });
  const session = buildRuntimeSessionRecord({
    snapshotRoot: 'var/packages/chapter-4-asteroids/0.1.0',
    entrypointPath: 'var/packages/chapter-4-asteroids/0.1.0/dist/index.html',
  });
  const reviewedPackage = buildPackageVersionRecord({
    approvalStatus: 'approved',
  });

  const missingLoaderServices = resolveWorkerServices(
    { PACKAGE_ARTIFACTS: createInMemoryArtifactBucket({}) },
    env,
  );

  await assertRejects(
    () =>
      missingLoaderServices.runtimeDelivery.loadReviewedAsset({
        session,
        reviewedPackage,
        relativePath: 'dist/index.html',
      }),
    Error,
    'Cloudflare Workers reviewed runtime delivery requires a Worker Loader binding named LOADER.',
  );

  const loaderServices = resolveWorkerServices(
    {
      PACKAGE_ARTIFACTS: createInMemoryArtifactBucket({}),
      LOADER: createStubDynamicWorkerLoader(),
    },
    env,
  );

  assertEquals(loaderServices.runtimeDelivery.substrate, 'dynamic_worker');
  assertEquals(
    new TextDecoder().decode(
      (
        await loaderServices.runtimeDelivery.loadReviewedAsset({
          session,
          reviewedPackage,
          relativePath: 'dist/index.html',
        })
      ).bytes,
    ),
    'loader-bytes',
  );
});

Deno.test('worker services route D1 persistence through ported repository slices', async () => {
  const env = createObjectEnvReader({
    LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue(),
  });
  const services = resolveWorkerServices({ DB: createStubD1Database([]) }, env);

  assertEquals(await services.getRepository().listPackageVersions(), []);
  assertEquals(await services.getOpsRepository().listControlPlaneDeployments(), []);
});

function createSeededArtifactBucket(
  bucketRoot: string,
  files: Record<string, string>,
): RuntimeArtifactBucket {
  return createInMemoryArtifactBucket(
    Object.fromEntries(
      Object.entries(files).map(([relativePath, contents]) => [
        `${bucketRoot}/${relativePath}`,
        contents,
      ]),
    ),
  );
}

function createInMemoryArtifactBucket(
  files: Record<string, Uint8Array | string>,
): RuntimeArtifactBucket {
  const storedFiles = new Map(
    Object.entries(files).map(([key, value]) => [key, toUint8Array(value)]),
  );

  return {
    get(key) {
      const bytes = storedFiles.get(key);

      if (bytes === undefined) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        arrayBuffer() {
          return Promise.resolve(bytes.slice().buffer);
        },
      });
    },
    put(key, value) {
      storedFiles.set(key, toUint8Array(value));

      return Promise.resolve();
    },
    list(options) {
      return Promise.resolve({
        objects: [...storedFiles.keys()]
          .filter((key) => key.startsWith(options.prefix))
          .sort()
          .map((key) => ({ key })),
      });
    },
  };
}

function createStubD1Database(results: Array<Record<string, unknown>>): D1Database {
  return {
    prepare(_query) {
      return {
        bind() {
          return this;
        },
        all<T>() {
          return Promise.resolve({
            success: true,
            results: results as T[],
          });
        },
        first() {
          return Promise.resolve(null);
        },
        run() {
          return Promise.resolve({
            success: true,
          });
        },
        raw<T>() {
          return Promise.resolve([] as T[]);
        },
      };
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

async function readBucketText(bucket: RuntimeArtifactBucket, key: string): Promise<string> {
  const object = await bucket.get(key);

  if (object === null) {
    throw new Error(`Expected bucket object ${key}.`);
  }

  return new TextDecoder().decode(await object.arrayBuffer());
}

function toUint8Array(value: string | Uint8Array | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }

  if (value instanceof Uint8Array) {
    return value.slice();
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  }

  return new Uint8Array(value.slice(0));
}

function createStubDynamicWorkerLoader() {
  return {
    get() {
      return {
        getEntrypoint() {
          return {
            fetch() {
              return Promise.resolve(
                new Response('loader-bytes', {
                  headers: {
                    'content-type': 'text/plain; charset=UTF-8',
                  },
                }),
              );
            },
          };
        },
      };
    },
  };
}
