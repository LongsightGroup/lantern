import type { EnvReader } from '../src/platform/env.ts';
import {
  getReferencePackageSourceRoot,
  importReferencePackage,
  listReferencePackageIds,
  loadReferencePackageSnapshot,
  readReferencePackageReviewData,
} from '../src/package_review/intake.ts';
import { createFileSystemPackageSource } from '../src/package_review/package_source_fs.ts';
import type { PackageReviewRepository } from '../src/package_review/repository.ts';
import type { PackageSnapshotStore } from '../src/package_review/snapshot_store.ts';
import type { AccessibilityReview } from '../src/package_review/types.ts';
import { getDefaultPackageSnapshotStore } from '../src/package_review/snapshot_store_fs.ts';

export interface LocalSeedSummary {
  importedCount: number;
  reusedSnapshotCount: number;
  existingCount: number;
  approvedCount: number;
  packageIds: string[];
}

export async function seedReferencePackages(input: {
  repository: PackageReviewRepository;
  env: EnvReader;
  storageRoot?: string;
  snapshotStore?: PackageSnapshotStore;
  reviewNotes?: string;
  accessibilityReview?: AccessibilityReview;
}): Promise<LocalSeedSummary> {
  const storageRoot = input.storageRoot;
  const snapshotStore = input.snapshotStore ?? getDefaultPackageSnapshotStore();
  const reviewNotes =
    input.reviewNotes ?? 'Approved by Lantern local seed for shipped reference packages.';
  const accessibilityReview = input.accessibilityReview ?? defaultApprovedAccessibilityReview();
  let importedCount = 0;
  let reusedSnapshotCount = 0;
  let existingCount = 0;
  let approvedCount = 0;
  const packageIds: string[] = [];

  for (const appId of listReferencePackageIds()) {
    const source = createFileSystemPackageSource(getReferencePackageSourceRoot(appId));
    const reviewData = await readReferencePackageReviewData(appId, source);
    let packageVersion = await input.repository.getPackageVersionByAppVersion(
      reviewData.appId,
      reviewData.version,
    );

    if (packageVersion === null) {
      const stored = await loadReferencePackageSnapshot({
        appId,
        ...(storageRoot === undefined ? {} : { storageRoot }),
        env: input.env,
        source,
        snapshotStore,
      });

      if (stored === null) {
        packageVersion = await input.repository.registerPackageVersion(
          await importReferencePackage({
            appId,
            ...(storageRoot === undefined ? {} : { storageRoot }),
            env: input.env,
            source,
            snapshotStore,
          }),
        );
        importedCount += 1;
      } else {
        packageVersion = await input.repository.registerPackageVersion(stored);
        reusedSnapshotCount += 1;
      }
    } else {
      existingCount += 1;
    }

    if (packageVersion.approvalStatus !== 'approved') {
      packageVersion = await input.repository.approvePackageVersion({
        id: packageVersion.id,
        reviewNotes,
        accessibilityReview,
      });
      approvedCount += 1;
    }

    packageIds.push(packageVersion.appId);
  }

  return {
    importedCount,
    reusedSnapshotCount,
    existingCount,
    approvedCount,
    packageIds,
  };
}

function defaultApprovedAccessibilityReview(): AccessibilityReview {
  return {
    keyboard: 'pass',
    focusVisible: 'pass',
    focusNotObscured: 'pass',
    structure: 'pass',
    contrast: 'pass',
    reducedMotion: 'pass',
    equivalentAlternatives: 'not_applicable',
    failureNotes: null,
    exceptionNote: 'Local seed approval for shipped reference packages.',
  };
}
