import { compare } from 'semver';
import type { RuntimeSessionRecord } from '../lti/types.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type {
  ApprovalStatus,
  AttemptEventRecord,
  AttemptEvidenceArtifactRecord,
  AttemptRecord,
  AuditEventRecord,
  AuthoringDraftFileRecord,
  AuthoringDraftRecord,
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
} from '../package_review/types.ts';
import type { AppGenerationRunRecord, AppGenerationWorkspaceRecord } from '../app_writer/types.ts';
import { type AccessibilityReview, parseAccessibilityReview } from '../package_review/types.ts';
import { DEFAULT_REVIEWED_AT } from './package_review_test_defaults.ts';
export type InMemoryRepository = PackageReviewRepository;

export type InMemoryPackageReviewRepositoryOptions = {
  packageVersions?: PackageVersionRecord[];
  attempts?: AttemptRecord[];
  attemptEvidenceArtifacts?: AttemptEvidenceArtifactRecord[];
  attemptEvents?: AttemptEventRecord[];
  auditEvents?: AuditEventRecord[];
  runtimeSessions?: RuntimeSessionRecord[];
  authoringDrafts?: AuthoringDraftRecord[];
  authoringDraftFiles?: AuthoringDraftFileRecord[];
  appGenerationRuns?: AppGenerationRunRecord[];
  appGenerationWorkspaces?: AppGenerationWorkspaceRecord[];
  previewSessions?: PreviewSessionRecord[];
  previewEvidence?: PreviewEvidenceRecord[];
};

export type InMemoryRepositoryState = Required<InMemoryPackageReviewRepositoryOptions>;

export function cloneRecord<T>(record: T): T {
  return structuredClone(record);
}

export function createState(
  options: InMemoryPackageReviewRepositoryOptions = {},
): InMemoryRepositoryState {
  return {
    packageVersions: cloneRecord(options.packageVersions ?? []),
    attempts: cloneRecord(options.attempts ?? []),
    attemptEvidenceArtifacts: cloneRecord(options.attemptEvidenceArtifacts ?? []),
    attemptEvents: cloneRecord(options.attemptEvents ?? []),
    auditEvents: cloneRecord(options.auditEvents ?? []),
    runtimeSessions: cloneRecord(options.runtimeSessions ?? []),
    authoringDrafts: cloneRecord(options.authoringDrafts ?? []),
    authoringDraftFiles: cloneRecord(options.authoringDraftFiles ?? []),
    appGenerationRuns: cloneRecord(options.appGenerationRuns ?? []),
    appGenerationWorkspaces: cloneRecord(options.appGenerationWorkspaces ?? []),
    previewSessions: cloneRecord(options.previewSessions ?? []),
    previewEvidence: cloneRecord(options.previewEvidence ?? []),
  };
}

export function nextId(records: Array<{ id: number }>): number {
  return records.reduce((max, record) => Math.max(max, record.id), 0) + 1;
}

export function sortPackageVersions(
  packageVersions: PackageVersionRecord[],
): PackageVersionRecord[] {
  return [...packageVersions].sort((left, right) => {
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

export function reviewPackageVersion(
  packageVersions: PackageVersionRecord[],
  id: number,
  approvalStatus: Exclude<ApprovalStatus, 'pending'>,
  reviewNotes: string | null,
  accessibilityReview: AccessibilityReview | null,
): PackageVersionRecord {
  const index = packageVersions.findIndex((record) => record.id === id);

  if (index < 0) {
    throw new Error(`Package version id ${id} was not found.`);
  }

  const existing = packageVersions[index];

  if (!existing) {
    throw new Error(`Package version id ${id} was not found.`);
  }

  if (existing.approvalStatus !== 'pending') {
    throw new Error(
      `Package version ${existing.appId}@${existing.version} has already been reviewed and cannot change state.`,
    );
  }

  const normalizedAccessibilityReview =
    accessibilityReview === null
      ? (() => {
          throw new Error('Accessibility review is required for new review decisions.');
        })()
      : parseAccessibilityReview(accessibilityReview);

  const nextRecord = cloneRecord({
    ...existing,
    approvalStatus,
    reviewNotes,
    accessibilityReview: normalizedAccessibilityReview,
    reviewedAt: DEFAULT_REVIEWED_AT,
  });

  packageVersions.splice(index, 1, nextRecord);

  return nextRecord;
}
