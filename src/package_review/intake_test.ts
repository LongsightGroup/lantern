import { assert, assertEquals, assertRejects, assertThrows } from '@std/assert';
import { getTestToolPrivateJwkEnvValue } from '../test_helpers/lti.ts';
import {
  getReferencePackageSourceRoot,
  importDemoPackage,
  importPackage,
  importReferencePackage,
  listReferencePackageIds,
  loadPackageSnapshot,
} from './intake.ts';
import { createMemoryPackageSource } from './package_source.ts';
import { createFileSystemPackageSource } from './package_source_fs.ts';
import { verifyReviewedRuntimeContractSignature } from './runtime_contract.ts';
import { getDefaultPackageSnapshotStore } from './snapshot_store_fs.ts';

const snapshotStore = getDefaultPackageSnapshotStore();
const TEST_RUNTIME_CONTRACT_ENV = {
  get(name: string): string | undefined {
    return name === 'LTI_TOOL_PRIVATE_JWK' ? getTestToolPrivateJwkEnvValue() : undefined;
  },
};

async function withToolSigningEnv(run: () => Promise<void>): Promise<void> {
  const previousToolKey = Deno.env.get('LTI_TOOL_PRIVATE_JWK');
  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());

  try {
    await run();
  } finally {
    if (previousToolKey === undefined) {
      Deno.env.delete('LTI_TOOL_PRIVATE_JWK');
    } else {
      Deno.env.set('LTI_TOOL_PRIVATE_JWK', previousToolKey);
    }
  }
}

Deno.test('importDemoPackage snapshots the demo package into Lantern-managed storage', async () => {
  await withToolSigningEnv(async () => {
    const storageRoot = await Deno.makeTempDir({ prefix: 'lantern-storage-' });

    try {
      const result = await importDemoPackage({
        storageRoot,
        source: createFileSystemPackageSource('examples/apps/chapter-4-asteroids'),
        snapshotStore,
        env: TEST_RUNTIME_CONTRACT_ENV,
      });

      assertEquals(result.reviewData.appId, 'chapter-4-asteroids');
      assertEquals(result.reviewData.version, '0.1.0');
      assert(result.artifact.snapshotRoot.startsWith(`${storageRoot}/chapter-4-asteroids/0.1.0`));
      assertEquals(result.artifact.manifestPath, `${result.artifact.snapshotRoot}/manifest.json`);
      assertEquals(
        result.artifact.entrypointPath,
        `${result.artifact.snapshotRoot}/dist/index.html`,
      );
      assert(!result.artifact.snapshotRoot.startsWith('examples/apps/chapter-4-asteroids'));
      assert(result.artifact.digest.startsWith('sha256:'));
      assertEquals(result.runtimeContract.appId, result.reviewData.appId);
      assertEquals(result.runtimeContract.packageVersion, result.reviewData.version);
      assertEquals(result.runtimeContract.artifactDigest, result.artifact.digest);
      assertEquals(result.runtimeContract.entrypoint, result.reviewData.entrypoint);
      assertEquals(result.runtimeContract.capabilities, result.reviewData.capabilities);

      await verifyReviewedRuntimeContractSignature({
        runtimeContract: result.runtimeContract,
        runtimeContractSignature: result.runtimeContractSignature,
        env: TEST_RUNTIME_CONTRACT_ENV,
      });

      const sourceManifest = await Deno.readTextFile(
        'examples/apps/chapter-4-asteroids/manifest.json',
      );
      const snapshotManifest = await Deno.readTextFile(result.artifact.manifestPath);
      const sourceEntrypoint = await Deno.readTextFile(
        'examples/apps/chapter-4-asteroids/dist/index.html',
      );
      const snapshotEntrypoint = await Deno.readTextFile(result.artifact.entrypointPath);

      assertEquals(snapshotManifest, sourceManifest);
      assertEquals(snapshotEntrypoint, sourceEntrypoint);
    } finally {
      await Deno.remove(storageRoot, { recursive: true });
    }
  });
});

Deno.test('importDemoPackage refuses to overwrite an existing immutable snapshot', async () => {
  await withToolSigningEnv(async () => {
    const storageRoot = await Deno.makeTempDir({ prefix: 'lantern-storage-' });

    try {
      await importDemoPackage({
        storageRoot,
        source: createFileSystemPackageSource('examples/apps/chapter-4-asteroids'),
        snapshotStore,
        env: TEST_RUNTIME_CONTRACT_ENV,
      });

      await assertRejects(
        () =>
          importDemoPackage({
            storageRoot,
            source: createFileSystemPackageSource('examples/apps/chapter-4-asteroids'),
            snapshotStore,
            env: TEST_RUNTIME_CONTRACT_ENV,
          }),
        Error,
        'Package version chapter-4-asteroids@0.1.0 already exists and cannot be replaced.',
      );
    } finally {
      await Deno.remove(storageRoot, { recursive: true });
    }
  });
});

Deno.test('importReferencePackage snapshots each curated reference app into Lantern-managed storage', async () => {
  await withToolSigningEnv(async () => {
    const storageRoot = await Deno.makeTempDir({ prefix: 'lantern-storage-' });

    try {
      for (const appId of listReferencePackageIds()) {
        const result = await importReferencePackage({
          appId,
          storageRoot,
          source: createFileSystemPackageSource(getReferencePackageSourceRoot(appId)),
          snapshotStore,
          env: TEST_RUNTIME_CONTRACT_ENV,
        });
        const sourceRoot = getReferencePackageSourceRoot(appId);

        assertEquals(result.reviewData.appId, appId);
        assert(
          result.artifact.snapshotRoot.startsWith(
            `${storageRoot}/${appId}/${result.reviewData.version}`,
          ),
        );
        assert(!result.artifact.snapshotRoot.startsWith(sourceRoot));
        assertEquals(result.runtimeContract.appId, appId);
        assertEquals(result.runtimeContract.packageVersion, result.reviewData.version);

        await verifyReviewedRuntimeContractSignature({
          runtimeContract: result.runtimeContract,
          runtimeContractSignature: result.runtimeContractSignature,
          env: TEST_RUNTIME_CONTRACT_ENV,
        });

        const sourceManifest = await Deno.readTextFile(`${sourceRoot}/manifest.json`);
        const snapshotManifest = await Deno.readTextFile(result.artifact.manifestPath);

        assertEquals(snapshotManifest, sourceManifest);
      }
    } finally {
      await Deno.remove(storageRoot, { recursive: true });
    }
  });
});

Deno.test('importPackage and loadPackageSnapshot use manifest-derived package identity', async () => {
  await withToolSigningEnv(async () => {
    const storageRoot = await Deno.makeTempDir({ prefix: 'lantern-storage-' });
    const sourceRoot = getReferencePackageSourceRoot('quick-study');
    const source = await createMemoryPackageSourceFromDirectory(sourceRoot);

    try {
      assertEquals(
        await loadPackageSnapshot({
          storageRoot,
          source,
          snapshotStore,
          env: TEST_RUNTIME_CONTRACT_ENV,
        }),
        null,
      );

      const imported = await importPackage({
        storageRoot,
        source,
        snapshotStore,
        env: TEST_RUNTIME_CONTRACT_ENV,
      });

      assertEquals(imported.reviewData.appId, 'quick-study');
      assertEquals(imported.reviewData.version, '0.1.0');
      assertEquals(imported.artifact.snapshotRoot, `${storageRoot}/quick-study/0.1.0`);

      const loaded = await loadPackageSnapshot({
        storageRoot,
        source,
        snapshotStore,
        env: TEST_RUNTIME_CONTRACT_ENV,
      });

      if (loaded === null) {
        throw new Error('Expected stored package snapshot after import.');
      }

      assertEquals(loaded.reviewData.appId, imported.reviewData.appId);
      assertEquals(loaded.reviewData.version, imported.reviewData.version);
      assertEquals(loaded.artifact.digest, imported.artifact.digest);
      assertEquals(
        await Deno.readTextFile(imported.artifact.manifestPath),
        await Deno.readTextFile(`${sourceRoot}/manifest.json`),
      );
    } finally {
      await Deno.remove(storageRoot, { recursive: true });
    }
  });
});

Deno.test('curated authoring examples stay explicitly registered in the reference package registry', () => {
  const ids = listReferencePackageIds();

  assertEquals(ids.includes('template-app'), true);
  assertEquals(getReferencePackageSourceRoot('template-app'), 'examples/apps/template');
  assertEquals(ids.includes('web-checkup'), true);
  assertEquals(getReferencePackageSourceRoot('web-checkup'), 'examples/apps/web-checkup');
  assertEquals(ids.includes('typescript-ladder-game'), true);
  assertEquals(
    getReferencePackageSourceRoot('typescript-ladder-game'),
    'examples/apps/typescript-ladder-game',
  );
});

Deno.test('importReferencePackage snapshots web-checkup through the explicit curated registry', async () => {
  await withToolSigningEnv(async () => {
    const storageRoot = await Deno.makeTempDir({ prefix: 'lantern-storage-' });

    try {
      const appId = 'web-checkup';
      const sourceRoot = getReferencePackageSourceRoot(appId);
      const result = await importReferencePackage({
        appId,
        storageRoot,
        source: createFileSystemPackageSource(sourceRoot),
        snapshotStore,
        env: TEST_RUNTIME_CONTRACT_ENV,
      });

      assertEquals(result.reviewData.appId, appId);
      assert(
        result.artifact.snapshotRoot.startsWith(
          `${storageRoot}/${appId}/${result.reviewData.version}`,
        ),
      );
      assert(!result.artifact.snapshotRoot.startsWith(sourceRoot));
      assertEquals(result.runtimeContract.appId, appId);

      await verifyReviewedRuntimeContractSignature({
        runtimeContract: result.runtimeContract,
        runtimeContractSignature: result.runtimeContractSignature,
        env: TEST_RUNTIME_CONTRACT_ENV,
      });

      const sourceManifest = await Deno.readTextFile(`${sourceRoot}/manifest.json`);
      const snapshotManifest = await Deno.readTextFile(result.artifact.manifestPath);

      assertEquals(snapshotManifest, sourceManifest);
    } finally {
      await Deno.remove(storageRoot, { recursive: true });
    }
  });
});

Deno.test('createMemoryPackageSource rejects duplicate normalized paths', () => {
  assertThrows(
    () =>
      createMemoryPackageSource([
        {
          relativePath: 'manifest.json',
          bytes: '{}',
        },
        {
          relativePath: './manifest.json',
          bytes: '{}',
        },
      ]),
    Error,
    'Package source file manifest.json was provided more than once.',
  );
});

Deno.test('createMemoryPackageSource rejects paths outside the reviewed package root', () => {
  assertThrows(
    () =>
      createMemoryPackageSource([
        {
          relativePath: '../manifest.json',
          bytes: '{}',
        },
      ]),
    Error,
    'Package source file must stay inside the reviewed package.',
  );
});

async function createMemoryPackageSourceFromDirectory(root: string) {
  const files = await listFiles(root);

  return createMemoryPackageSource(
    await Promise.all(
      files.map(async (relativePath) => ({
        relativePath,
        bytes: await Deno.readFile(`${root}/${relativePath}`),
      })),
    ),
  );
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  await walkFiles(root, '', files);
  files.sort();

  return files;
}

async function walkFiles(root: string, relativeRoot: string, files: string[]): Promise<void> {
  const absoluteRoot = relativeRoot === '' ? root : `${root}/${relativeRoot}`;

  for await (const entry of Deno.readDir(absoluteRoot)) {
    const relativePath = relativeRoot === '' ? entry.name : `${relativeRoot}/${entry.name}`;

    if (entry.isDirectory) {
      await walkFiles(root, relativePath, files);
      continue;
    }

    if (entry.isFile) {
      files.push(relativePath);
    }
  }
}
