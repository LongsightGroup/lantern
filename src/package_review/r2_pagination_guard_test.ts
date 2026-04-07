import { assertRejects } from '@std/assert';
import type { RuntimeArtifactBucket } from '../runtime/artifact_store.ts';
import { createBucketPackageSource } from './package_source.ts';
import { createR2PackageSnapshotStore } from './snapshot_store.ts';

Deno.test('bucket package source fails clearly when truncated R2 listing omits a continuation cursor', async () => {
  const source = createBucketPackageSource(
    createMissingCursorBucket(),
    'reference-packages/demo/source',
  );

  await assertRejects(
    () => source.listFiles(),
    Error,
    'truncated results without a continuation cursor',
  );
});

Deno.test('snapshot store fails clearly when truncated R2 listing repeats a cursor', async () => {
  const snapshotStore = createR2PackageSnapshotStore(createRepeatedCursorBucket());

  await assertRejects(
    () => snapshotStore.listFiles('var/packages/demo/0.1.0'),
    Error,
    'repeated cursor',
  );
});

function createMissingCursorBucket(): RuntimeArtifactBucket {
  return {
    get() {
      return Promise.resolve(null);
    },
    put() {
      return Promise.resolve();
    },
    list() {
      return Promise.resolve({
        objects: [],
        truncated: true,
      });
    },
  };
}

function createRepeatedCursorBucket(): RuntimeArtifactBucket {
  return {
    get() {
      return Promise.resolve(null);
    },
    put() {
      return Promise.resolve();
    },
    list() {
      return Promise.resolve({
        objects: [{ key: 'var/packages/demo/0.1.0/manifest.json' }],
        truncated: true,
        cursor: 'loop',
      });
    },
  };
}
