import { compare, parse } from "@std/semver";
import type {
  DeepLinkingSessionRecord,
  DynamicRegistrationStateRecord,
  LoginStateRecord,
  LtiPlacement,
  RuntimeSessionRecord,
} from "../lti/types.ts";
import type {
  BrokerVerificationRunStatus,
  BrokerVerificationSource,
  BrokerVerificationStatus,
  CertificationWorkflowKey,
  ControlPlaneDeploymentDetailSnapshot,
  ControlPlaneDeploymentInventoryRow,
  ControlPlaneDiagnosticItem,
  OfficialBrokerCertificationStatus,
  RetryableGradePublicationLookup,
} from "../ops/types.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import type {
  ApprovalStatus,
  AttemptEventRecord,
  AttemptRecord,
  AuditEventRecord,
  DeepLinkingResourceOption,
  DeploymentRecord,
  GradePublicationRecord,
  LanternLtiProfileSettingsRecord,
  LineItemBindingRecord,
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
  ReviewedPlacementRecord,
} from "../package_review/types.ts";
import { DEFAULT_REVIEWED_AT } from "./package_review_test_defaults.ts";

export interface InMemoryOpsRepository {
  listControlPlaneDeployments(): Promise<ControlPlaneDeploymentInventoryRow[]>;
  getControlPlaneDeploymentDetail(
    deploymentRecordId: number,
  ): Promise<ControlPlaneDeploymentDetailSnapshot | null>;
  listControlPlaneDiagnostics(
    deploymentRecordId: number,
  ): Promise<ControlPlaneDiagnosticItem[]>;
  getLatestBrokerVerification(): Promise<BrokerVerificationStatus | null>;
  getLatestBrokerVerificationStatus(): Promise<BrokerVerificationStatus | null>;
  recordBrokerVerificationRun(input: {
    deploymentRecordId: number | null;
    source: BrokerVerificationSource;
    scope: BrokerVerificationStatus["supportedPath"];
    workflowKey: CertificationWorkflowKey;
    status: BrokerVerificationRunStatus | "notCertified";
    certificationState:
      | Exclude<OfficialBrokerCertificationStatus["state"], "notCertified">
      | null;
    summary: string;
    detailUrl: string | null;
    checkedAt: string;
  }): Promise<void>;
  getRetryableGradePublicationLookup(
    attemptId: string,
  ): Promise<RetryableGradePublicationLookup | null>;
  getRuntimeSessionByAttemptId(
    attemptId: string,
  ): Promise<RuntimeSessionRecord | null>;
}

export interface InMemoryDeepLinkingRepository {
  createDynamicRegistrationState(
    record: DynamicRegistrationStateRecord,
  ): Promise<DynamicRegistrationStateRecord>;
  getDynamicRegistrationStateByState(
    state: string,
  ): Promise<DynamicRegistrationStateRecord | null>;
  consumeDynamicRegistrationState(input: {
    state: string;
    usedAt: string;
  }): Promise<DynamicRegistrationStateRecord>;
  createDeepLinkingSession(
    record: DeepLinkingSessionRecord,
  ): Promise<DeepLinkingSessionRecord>;
  getDeepLinkingSessionById(
    sessionId: string,
  ): Promise<DeepLinkingSessionRecord | null>;
  consumeDeepLinkingSession(input: {
    sessionId: string;
    usedAt: string;
  }): Promise<DeepLinkingSessionRecord>;
  updateDeepLinkingSessionSelection(input: {
    sessionId: string;
    selection: DeepLinkingSessionRecord["selection"];
  }): Promise<DeepLinkingSessionRecord>;
  listDeepLinkingResourceOptions(
    appId: string,
    placement: LtiPlacement,
  ): Promise<DeepLinkingResourceOption[]>;
}

export type InMemoryRepository =
  & PackageReviewRepository
  & InMemoryOpsRepository
  & InMemoryDeepLinkingRepository;

export type InMemoryPackageReviewRepositoryOptions = {
  packageVersions?: PackageVersionRecord[];
  deployments?: DeploymentRecord[];
  attempts?: AttemptRecord[];
  attemptEvents?: AttemptEventRecord[];
  lineItemBindings?: LineItemBindingRecord[];
  gradePublications?: GradePublicationRecord[];
  auditEvents?: AuditEventRecord[];
  loginStates?: LoginStateRecord[];
  dynamicRegistrationStates?: DynamicRegistrationStateRecord[];
  runtimeSessions?: RuntimeSessionRecord[];
  deepLinkingSessions?: DeepLinkingSessionRecord[];
  deepLinkingResourceOptions?: DeepLinkingResourceOption[];
  reviewedPlacements?: ReviewedPlacementRecord[];
  previewSessions?: PreviewSessionRecord[];
  previewEvidence?: PreviewEvidenceRecord[];
  controlPlaneDeployments?: ControlPlaneDeploymentInventoryRow[];
  controlPlaneDeploymentDetails?: ControlPlaneDeploymentDetailSnapshot[];
  controlPlaneDiagnostics?: ControlPlaneDiagnosticItem[];
  brokerVerifications?: BrokerVerificationStatus[];
  retryableGradePublications?: RetryableGradePublicationLookup[];
  lanternLtiProfileSettings?: LanternLtiProfileSettingsRecord;
};

export type InMemoryRepositoryState = Required<
  InMemoryPackageReviewRepositoryOptions
>;

export function cloneRecord<T>(record: T): T {
  return structuredClone(record);
}

export function createState(
  options: InMemoryPackageReviewRepositoryOptions = {},
): InMemoryRepositoryState {
  return {
    packageVersions: cloneRecord(options.packageVersions ?? []),
    deployments: cloneRecord(options.deployments ?? []),
    attempts: cloneRecord(options.attempts ?? []),
    attemptEvents: cloneRecord(options.attemptEvents ?? []),
    lineItemBindings: cloneRecord(options.lineItemBindings ?? []),
    gradePublications: cloneRecord(options.gradePublications ?? []),
    auditEvents: cloneRecord(options.auditEvents ?? []),
    loginStates: cloneRecord(options.loginStates ?? []),
    dynamicRegistrationStates: cloneRecord(
      options.dynamicRegistrationStates ?? [],
    ),
    runtimeSessions: cloneRecord(options.runtimeSessions ?? []),
    deepLinkingSessions: cloneRecord(options.deepLinkingSessions ?? []),
    deepLinkingResourceOptions: cloneRecord(
      options.deepLinkingResourceOptions ?? [],
    ),
    reviewedPlacements: cloneRecord(options.reviewedPlacements ?? []),
    previewSessions: cloneRecord(options.previewSessions ?? []),
    previewEvidence: cloneRecord(options.previewEvidence ?? []),
    controlPlaneDeployments: cloneRecord(options.controlPlaneDeployments ?? []),
    controlPlaneDeploymentDetails: cloneRecord(
      options.controlPlaneDeploymentDetails ?? [],
    ),
    controlPlaneDiagnostics: cloneRecord(options.controlPlaneDiagnostics ?? []),
    brokerVerifications: cloneRecord(options.brokerVerifications ?? []),
    retryableGradePublications: cloneRecord(
      options.retryableGradePublications ?? [],
    ),
    lanternLtiProfileSettings: cloneRecord(
      options.lanternLtiProfileSettings ?? {
        defaultLtiProfile: "governedCompatibility",
        updatedAt: DEFAULT_REVIEWED_AT,
      },
    ),
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

    const versionComparison = compare(
      parse(right.version),
      parse(left.version),
    );

    if (versionComparison !== 0) {
      return versionComparison;
    }

    return right.importedAt.localeCompare(left.importedAt);
  });
}

export function reviewPackageVersion(
  packageVersions: PackageVersionRecord[],
  id: number,
  approvalStatus: Exclude<ApprovalStatus, "pending">,
  reviewNotes: string | null,
): PackageVersionRecord {
  const index = packageVersions.findIndex((record) => record.id === id);

  if (index < 0) {
    throw new Error(`Package version id ${id} was not found.`);
  }

  const existing = packageVersions[index];

  if (!existing) {
    throw new Error(`Package version id ${id} was not found.`);
  }

  if (existing.approvalStatus !== "pending") {
    throw new Error(
      `Package version ${existing.appId}@${existing.version} has already been reviewed and cannot change state.`,
    );
  }

  const nextRecord = cloneRecord({
    ...existing,
    approvalStatus,
    reviewNotes,
    reviewedAt: DEFAULT_REVIEWED_AT,
  });

  packageVersions.splice(index, 1, nextRecord);

  return nextRecord;
}

export function getLatestBrokerVerificationRecord(
  brokerVerifications: BrokerVerificationStatus[],
): BrokerVerificationStatus | null {
  return (
    [...brokerVerifications].sort((left, right) => {
      const leftCheckedAt = left.internal?.checkedAt ??
        left.official.checkedAt ?? "";
      const rightCheckedAt = right.internal?.checkedAt ??
        right.official.checkedAt ?? "";

      return rightCheckedAt.localeCompare(leftCheckedAt);
    })[0] ?? null
  );
}
