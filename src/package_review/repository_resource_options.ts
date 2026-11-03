import { compare } from 'semver';
import type { PackageVersionRecord } from './types.ts';

export function sortPackageVersions(records: PackageVersionRecord[]): PackageVersionRecord[] {
  return [...records].sort((left, right) => {
    if (left.appId !== right.appId) {
      return left.appId.localeCompare(right.appId);
    }

    const versionComparison = compare(right.version, left.version);

    if (versionComparison !== 0) {
      return versionComparison;
    }

    return right.importedAt.localeCompare(left.importedAt);
  });
}
