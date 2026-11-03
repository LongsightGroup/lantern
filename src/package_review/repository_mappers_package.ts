import { parseReviewedRuntimeContract } from './runtime_contract.ts';
import { type PackageVersionRecord, parseAccessibilityReview } from './types.ts';
import type { PackageVersionRow } from './repository_row_types.ts';
import { normalizeOptionalTimestamp, normalizeTimestamp } from './repository_value_support.ts';

export function mapOptionalPackageVersion(
  row: PackageVersionRow | undefined,
): PackageVersionRecord | null {
  if (!row) {
    return null;
  }

  return mapPackageVersionRow(row);
}

export function mapPackageVersionRow(row: PackageVersionRow | undefined): PackageVersionRecord {
  if (!row) {
    throw new Error('Expected a package version row.');
  }

  if (row.runtimeContract === null || row.runtimeContractSignature === null) {
    throw new Error(
      `Package version ${row.appId}@${row.version} is missing its reviewed runtime contract and cannot launch.`,
    );
  }

  return {
    id: row.id,
    appId: row.appId,
    version: row.version,
    title: row.title,
    description: row.description,
    owner: {
      type: row.ownerType,
      id: row.ownerId,
    },
    runtime: parseReviewedRuntimeContract(row.runtimeContract).runtime,
    roles: row.roles,
    installScope: row.installScope,
    capabilities: row.capabilities,
    grading: {
      mode: row.gradingMode,
      rubricFile: row.gradingRubricFile,
      maxScore: row.gradingMaxScore,
    },
    catalogVisibility: row.catalogVisibility,
    approvalStatus: row.approvalStatus,
    reviewNotes: row.reviewNotes,
    accessibilityReview:
      row.accessibilityReview === null ? null : parseAccessibilityReview(row.accessibilityReview),
    reviewedAt: normalizeOptionalTimestamp(row.reviewedAt),
    validationIssues: row.validationIssues ?? [],
    manifestJson: row.manifestJson,
    artifact: {
      snapshotRoot: row.artifactRoot,
      manifestPath: `${row.artifactRoot}/manifest.json`,
      entrypointPath: `${row.artifactRoot}${row.entrypoint}`,
      digest: row.artifactDigest,
    },
    runtimeContract: parseReviewedRuntimeContract(row.runtimeContract),
    runtimeContractSignature: row.runtimeContractSignature,
    importedAt: normalizeTimestamp(row.importedAt),
  };
}
