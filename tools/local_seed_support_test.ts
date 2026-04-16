import { assert, assertEquals } from '@std/assert';
import { createObjectEnvReader } from '../src/platform/env.ts';
import {
  getReferencePackageSourceRoot,
  listReferencePackageIds,
  readReferencePackageReviewData,
} from '../src/package_review/intake.ts';
import { createFileSystemPackageSource } from '../src/package_review/package_source_fs.ts';
import { getDefaultPackageSnapshotStore } from '../src/package_review/snapshot_store_fs.ts';
import { getTestToolPrivateJwkEnvValue } from '../src/test_helpers/lti.ts';
import { createInMemoryPackageReviewRepository } from '../src/test_helpers/package_review.ts';
import { seedReferencePackages } from './local_seed_support.ts';

Deno.test("seedReferencePackages imports and approves Lantern's shipped reference packages", async () => {
  const storageRoot = await Deno.makeTempDir({ prefix: 'lantern-local-seed-' });
  const repository = createInMemoryPackageReviewRepository();

  try {
    const summary = await seedReferencePackages({
      repository,
      env: createObjectEnvReader({
        LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue(),
      }),
      storageRoot,
      snapshotStore: getDefaultPackageSnapshotStore(),
      reviewNotes: 'Approved in local seed support test.',
    });

    assertEquals(summary.importedCount, listReferencePackageIds().length);
    assertEquals(summary.reusedSnapshotCount, 0);
    assertEquals(summary.existingCount, 0);
    assertEquals(summary.approvedCount, listReferencePackageIds().length);

    for (const appId of listReferencePackageIds()) {
      const reviewData = await readReferencePackageReviewData(
        appId,
        createFileSystemPackageSource(getReferencePackageSourceRoot(appId)),
      );
      const packageVersion = await repository.getPackageVersionByAppVersion(
        appId,
        reviewData.version,
      );

      assertEquals(packageVersion?.approvalStatus, 'approved');
      assert(packageVersion?.accessibilityReview !== null);
    }
  } finally {
    await Deno.remove(storageRoot, { recursive: true });
  }
});
