import type { PackageVersionRecord } from '../package_review/types.ts';

export function resolvePreviousPackageVersion(
  history: readonly PackageVersionRecord[],
  packageVersion: PackageVersionRecord,
): PackageVersionRecord | null {
  const currentIndex = history.findIndex((version) => version.id === packageVersion.id);

  if (currentIndex < 0) {
    return null;
  }

  return history[currentIndex + 1] ?? null;
}

export function resolvePreviousApprovedPackageVersion(
  history: readonly PackageVersionRecord[],
  packageVersion: PackageVersionRecord,
): PackageVersionRecord | null {
  const currentIndex = history.findIndex((version) => version.id === packageVersion.id);

  if (currentIndex < 0) {
    return null;
  }

  return (
    history.slice(currentIndex + 1).find((version) => version.approvalStatus === 'approved') ?? null
  );
}
