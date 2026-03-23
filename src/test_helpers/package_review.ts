import { compare, parse } from "@std/semver";
import type { ImportedPackageVersion } from "../package_review/intake.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import type {
  ApprovalStatus,
  DeploymentRecord,
  PackageVersionRecord,
} from "../package_review/types.ts";

const DEFAULT_IMPORTED_AT = "2026-03-23T17:30:00Z";
const DEFAULT_REVIEWED_AT = "2026-03-23T18:05:00Z";
const DEFAULT_UPDATED_AT = "2026-03-23T18:15:00Z";

export function buildPackageVersionRecord(
  overrides: Partial<PackageVersionRecord> = {},
): PackageVersionRecord {
  return {
    id: 1,
    appId: "chapter-4-asteroids",
    version: "0.1.0",
    title: "Chapter 4 Asteroids",
    description: "Shoot the correct vocabulary target.",
    owner: {
      type: "user",
      id: "instructor_123",
    },
    entrypoint: "/dist/index.html",
    roles: ["learner", "instructor"],
    installScope: "course",
    capabilities: [
      "read_launch_context",
      "read_activity_content",
      "submit_attempt_event",
      "finalize_attempt",
      "read_local_state",
      "write_local_state",
    ],
    grading: {
      mode: "declarative",
      rubricFile: "/scoring/rubric.json",
      maxScore: 100,
    },
    approvalStatus: "pending",
    reviewNotes: null,
    reviewedAt: null,
    validationIssues: [],
    manifestJson: {
      app_id: "chapter-4-asteroids",
      version: "0.1.0",
      title: "Chapter 4 Asteroids",
    },
    artifact: {
      snapshotRoot: "var/packages/chapter-4-asteroids/0.1.0",
      manifestPath: "var/packages/chapter-4-asteroids/0.1.0/manifest.json",
      entrypointPath: "var/packages/chapter-4-asteroids/0.1.0/dist/index.html",
      digest: "sha256:chapter-4-asteroids-0.1.0",
    },
    importedAt: DEFAULT_IMPORTED_AT,
    ...overrides,
  };
}

export function buildImportedPackageVersion(
  overrides: Partial<PackageVersionRecord> = {},
): ImportedPackageVersion {
  const record = buildPackageVersionRecord(overrides);

  return {
    reviewData: {
      appId: record.appId,
      version: record.version,
      title: record.title,
      description: record.description,
      owner: record.owner,
      entrypoint: record.entrypoint,
      roles: record.roles,
      installScope: record.installScope,
      capabilities: record.capabilities,
      grading: record.grading,
      manifestJson: record.manifestJson,
      validationIssues: record.validationIssues,
    },
    artifact: record.artifact,
  };
}

export function buildDeploymentRecord(
  overrides: Partial<DeploymentRecord> = {},
): DeploymentRecord {
  return {
    id: 1,
    slug: "chapter-4-asteroids-pilot",
    label: "Chapter 4 Asteroids Pilot Deployment",
    appId: "chapter-4-asteroids",
    enabledPackageVersionId: 1,
    enabledPackageVersion: "0.1.0",
    updatedAt: DEFAULT_UPDATED_AT,
    ...overrides,
  };
}

export function createInMemoryPackageReviewRepository(
  options: {
    packageVersions?: PackageVersionRecord[];
    deployments?: DeploymentRecord[];
  } = {},
): PackageReviewRepository {
  const packageVersions = [...(options.packageVersions ?? [])];
  const deployments = [...(options.deployments ?? [])];

  return {
    registerPackageVersion(input) {
      const existing = packageVersions.find((record) =>
        record.appId === input.reviewData.appId &&
        record.version === input.reviewData.version
      );

      if (existing) {
        throw new Error(
          `Package version ${input.reviewData.appId}@${input.reviewData.version} already exists and cannot be replaced.`,
        );
      }

      const nextRecord = buildPackageVersionRecord({
        id: nextId(packageVersions),
        appId: input.reviewData.appId,
        version: input.reviewData.version,
        title: input.reviewData.title,
        description: input.reviewData.description,
        owner: input.reviewData.owner,
        entrypoint: input.reviewData.entrypoint,
        roles: input.reviewData.roles,
        installScope: input.reviewData.installScope,
        capabilities: input.reviewData.capabilities,
        grading: input.reviewData.grading,
        validationIssues: input.reviewData.validationIssues,
        manifestJson: input.reviewData.manifestJson,
        artifact: input.artifact,
      });

      packageVersions.push(nextRecord);

      return Promise.resolve(clonePackageVersion(nextRecord));
    },

    listPackageVersions() {
      return Promise.resolve(
        clonePackageVersions(sortPackageVersions(packageVersions)),
      );
    },

    listPackageVersionsByApp(appId) {
      const records = packageVersions.filter((record) =>
        record.appId === appId
      );
      return Promise.resolve(
        clonePackageVersions(sortPackageVersions(records)),
      );
    },

    getPackageVersionById(id) {
      const record = packageVersions.find((candidate) => candidate.id === id);
      return Promise.resolve(record ? clonePackageVersion(record) : null);
    },

    getPackageVersionByAppVersion(appId, version) {
      const record = packageVersions.find((candidate) =>
        candidate.appId === appId && candidate.version === version
      );
      return Promise.resolve(record ? clonePackageVersion(record) : null);
    },

    approvePackageVersion(input) {
      return Promise.resolve(
        clonePackageVersion(
          reviewPackageVersion(
            packageVersions,
            input.id,
            "approved",
            input.reviewNotes,
          ),
        ),
      );
    },

    rejectPackageVersion(input) {
      return Promise.resolve(
        clonePackageVersion(
          reviewPackageVersion(
            packageVersions,
            input.id,
            "rejected",
            input.reviewNotes,
          ),
        ),
      );
    },

    getDeploymentBySlug(slug) {
      const deployment = deployments.find((candidate) =>
        candidate.slug === slug
      );
      return Promise.resolve(deployment ? cloneDeployment(deployment) : null);
    },

    pinDeploymentVersion(input) {
      const packageVersion = packageVersions.find((candidate) =>
        candidate.id === input.packageVersionId
      );

      if (!packageVersion) {
        throw new Error(
          `Package version id ${input.packageVersionId} was not found.`,
        );
      }

      if (packageVersion.approvalStatus !== "approved") {
        throw new Error("Only approved package versions can be enabled.");
      }

      if (packageVersion.appId !== input.appId) {
        throw new Error(
          `Package version ${packageVersion.appId}@${packageVersion.version} does not belong to deployment app ${input.appId}.`,
        );
      }

      const existing = deployments.find((candidate) =>
        candidate.slug === input.slug
      );

      if (existing && existing.appId !== input.appId) {
        throw new Error(
          `Deployment ${input.slug} belongs to app ${existing.appId}.`,
        );
      }

      const nextDeployment = buildDeploymentRecord({
        id: existing?.id ?? nextId(deployments),
        slug: input.slug,
        label: input.label,
        appId: input.appId,
        enabledPackageVersionId: packageVersion.id,
        enabledPackageVersion: packageVersion.version,
        updatedAt: DEFAULT_UPDATED_AT,
      });

      if (existing) {
        const index = deployments.findIndex((candidate) =>
          candidate.slug === input.slug
        );
        deployments.splice(index, 1, nextDeployment);
      } else {
        deployments.push(nextDeployment);
      }

      return Promise.resolve(cloneDeployment(nextDeployment));
    },
  };
}

function reviewPackageVersion(
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

  const nextRecord = buildPackageVersionRecord({
    ...existing,
    approvalStatus,
    reviewNotes,
    reviewedAt: DEFAULT_REVIEWED_AT,
  });

  packageVersions.splice(index, 1, nextRecord);

  return nextRecord;
}

function sortPackageVersions(
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

function clonePackageVersions(
  packageVersions: PackageVersionRecord[],
): PackageVersionRecord[] {
  return packageVersions.map(clonePackageVersion);
}

function clonePackageVersion(
  record: PackageVersionRecord,
): PackageVersionRecord {
  return structuredClone(record);
}

function cloneDeployment(record: DeploymentRecord): DeploymentRecord {
  return structuredClone(record);
}

function nextId(records: Array<{ id: number }>): number {
  return records.reduce((max, record) => Math.max(max, record.id), 0) + 1;
}
