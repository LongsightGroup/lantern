import { assert, assertEquals, assertRejects } from '@std/assert';
import { getTestToolPrivateJwkEnvValue } from '../test_helpers/lti.ts';
import {
  getReferencePackageSourceRoot,
  importDemoPackage,
  importReferencePackage,
  listReferencePackageIds,
} from './intake.ts';
import { verifyReviewedRuntimeContractSignature } from './runtime_contract.ts';

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
      const result = await importDemoPackage({ storageRoot });

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
      await importDemoPackage({ storageRoot });

      await assertRejects(
        () => importDemoPackage({ storageRoot }),
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
