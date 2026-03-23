import type { Pool, PoolClient, PostgresError } from "@db/postgres";
import { compare, parse } from "@std/semver";
import type { ImportedPackageVersion } from "./intake.ts";
import type {
  ApprovalStatus,
  DeploymentRecord,
  PackageVersionRecord,
  ValidationIssue,
} from "./types.ts";

const PACKAGE_VERSION_SELECT = `
  SELECT
    id,
    app_id,
    version,
    title,
    description,
    owner_type,
    owner_id,
    entrypoint,
    roles,
    install_scope,
    capabilities,
    grading_mode,
    grading_rubric_file,
    grading_max_score,
    approval_status,
    review_notes,
    reviewed_at,
    validation_issues,
    manifest_json,
    artifact_root,
    artifact_digest,
    imported_at
  FROM package_versions
`;

const DEPLOYMENT_SELECT = `
  SELECT
    deployments.id,
    deployments.slug,
    deployments.label,
    deployments.app_id,
    deployments.enabled_package_version_id,
    package_versions.version AS enabled_package_version,
    deployments.updated_at
  FROM deployments
  LEFT JOIN package_versions
    ON package_versions.id = deployments.enabled_package_version_id
`;

interface PackageVersionRow {
  id: number;
  appId: string;
  version: string;
  title: string;
  description: string | null;
  ownerType: "user";
  ownerId: string;
  entrypoint: string;
  roles: PackageVersionRecord["roles"];
  installScope: PackageVersionRecord["installScope"];
  capabilities: PackageVersionRecord["capabilities"];
  gradingMode: PackageVersionRecord["grading"]["mode"];
  gradingRubricFile: string | null;
  gradingMaxScore: number | null;
  approvalStatus: ApprovalStatus;
  reviewNotes: string | null;
  reviewedAt: Date | string | null;
  validationIssues: ValidationIssue[];
  manifestJson: Record<string, unknown>;
  artifactRoot: string;
  artifactDigest: string;
  importedAt: Date | string;
}

interface DeploymentRow {
  id: number;
  slug: string;
  label: string;
  appId: string;
  enabledPackageVersionId: number | null;
  enabledPackageVersion: string | null;
  updatedAt: Date | string;
}

export interface PackageReviewRepository {
  registerPackageVersion(
    input: ImportedPackageVersion,
  ): Promise<PackageVersionRecord>;
  listPackageVersions(): Promise<PackageVersionRecord[]>;
  listPackageVersionsByApp(appId: string): Promise<PackageVersionRecord[]>;
  getPackageVersionById(id: number): Promise<PackageVersionRecord | null>;
  getPackageVersionByAppVersion(
    appId: string,
    version: string,
  ): Promise<PackageVersionRecord | null>;
  approvePackageVersion(input: {
    id: number;
    reviewNotes: string | null;
  }): Promise<PackageVersionRecord>;
  rejectPackageVersion(input: {
    id: number;
    reviewNotes: string | null;
  }): Promise<PackageVersionRecord>;
  getDeploymentBySlug(slug: string): Promise<DeploymentRecord | null>;
  pinDeploymentVersion(input: {
    slug: string;
    label: string;
    appId: string;
    packageVersionId: number;
  }): Promise<DeploymentRecord>;
}

export function createPackageReviewRepository(
  pool: Pool,
): PackageReviewRepository {
  return {
    async registerPackageVersion(input) {
      return await withClient(pool, async (client) => {
        try {
          const result = await client.queryObject<PackageVersionRow>({
            text: `
              INSERT INTO package_versions (
                app_id,
                version,
                title,
                description,
                owner_type,
                owner_id,
                entrypoint,
                roles,
                install_scope,
                capabilities,
                grading_mode,
                grading_rubric_file,
                grading_max_score,
                approval_status,
                review_notes,
                reviewed_at,
                validation_issues,
                manifest_json,
                artifact_root,
                artifact_digest
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, 'pending', NULL, NULL, $14::jsonb, $15::jsonb, $16, $17
              )
              RETURNING
                id,
                app_id,
                version,
                title,
                description,
                owner_type,
                owner_id,
                entrypoint,
                roles,
                install_scope,
                capabilities,
                grading_mode,
                grading_rubric_file,
                grading_max_score,
                approval_status,
                review_notes,
                reviewed_at,
                validation_issues,
                manifest_json,
                artifact_root,
                artifact_digest,
                imported_at
            `,
            args: [
              input.reviewData.appId,
              input.reviewData.version,
              input.reviewData.title,
              input.reviewData.description,
              input.reviewData.owner.type,
              input.reviewData.owner.id,
              input.reviewData.entrypoint,
              input.reviewData.roles,
              input.reviewData.installScope,
              input.reviewData.capabilities,
              input.reviewData.grading.mode,
              input.reviewData.grading.rubricFile,
              input.reviewData.grading.maxScore,
              JSON.stringify(input.reviewData.validationIssues),
              JSON.stringify(input.reviewData.manifestJson),
              input.artifact.snapshotRoot,
              input.artifact.digest,
            ],
            camelCase: true,
          });

          return mapPackageVersionRow(result.rows[0]);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new Error(
              `Package version ${input.reviewData.appId}@${input.reviewData.version} already exists and cannot be replaced.`,
            );
          }

          throw error;
        }
      });
    },

    async listPackageVersions() {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<PackageVersionRow>({
          text:
            `${PACKAGE_VERSION_SELECT} ORDER BY app_id ASC, imported_at DESC`,
          camelCase: true,
        });

        return sortPackageVersions(result.rows.map(mapPackageVersionRow));
      });
    },

    async listPackageVersionsByApp(appId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<PackageVersionRow>({
          text: `${PACKAGE_VERSION_SELECT} WHERE app_id = $1`,
          args: [appId],
          camelCase: true,
        });

        return sortPackageVersions(result.rows.map(mapPackageVersionRow));
      });
    },

    async getPackageVersionById(id) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<PackageVersionRow>({
          text: `${PACKAGE_VERSION_SELECT} WHERE id = $1`,
          args: [id],
          camelCase: true,
        });

        return mapOptionalPackageVersion(result.rows[0]);
      });
    },

    async getPackageVersionByAppVersion(appId, version) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<PackageVersionRow>({
          text: `${PACKAGE_VERSION_SELECT} WHERE app_id = $1 AND version = $2`,
          args: [appId, version],
          camelCase: true,
        });

        return mapOptionalPackageVersion(result.rows[0]);
      });
    },

    async approvePackageVersion(input) {
      return await reviewPackageVersion(
        pool,
        input.id,
        "approved",
        input.reviewNotes,
      );
    },

    async rejectPackageVersion(input) {
      return await reviewPackageVersion(
        pool,
        input.id,
        "rejected",
        input.reviewNotes,
      );
    },

    async getDeploymentBySlug(slug) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<DeploymentRow>({
          text: `${DEPLOYMENT_SELECT} WHERE deployments.slug = $1`,
          args: [slug],
          camelCase: true,
        });

        return mapOptionalDeployment(result.rows[0]);
      });
    },

    async pinDeploymentVersion(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          "pin_deployment_version",
          async (transaction) => {
            const packageVersionResult = await transaction.queryObject<
              PackageVersionRow
            >({
              text: `
                ${PACKAGE_VERSION_SELECT}
                WHERE id = $1
                FOR UPDATE
              `,
              args: [input.packageVersionId],
              camelCase: true,
            });
            const packageVersionRow = packageVersionResult.rows[0];

            if (!packageVersionRow) {
              throw new Error(
                `Package version id ${input.packageVersionId} was not found.`,
              );
            }

            const packageVersion = mapPackageVersionRow(packageVersionRow);

            if (packageVersion.approvalStatus !== "approved") {
              throw new Error("Only approved package versions can be enabled.");
            }

            const deploymentResult = await transaction.queryObject<
              DeploymentRow
            >({
              text: `
                ${DEPLOYMENT_SELECT}
                WHERE deployments.slug = $1
                FOR UPDATE OF deployments
              `,
              args: [input.slug],
              camelCase: true,
            });
            const existingDeployment = deploymentResult.rows[0];

            if (
              existingDeployment &&
              existingDeployment.appId !== input.appId
            ) {
              throw new Error(
                `Deployment ${input.slug} belongs to app ${existingDeployment.appId}.`,
              );
            }

            const deploymentAppId = existingDeployment?.appId ?? input.appId;

            if (packageVersion.appId !== deploymentAppId) {
              throw new Error(
                `Package version ${packageVersion.appId}@${packageVersion.version} does not belong to deployment app ${deploymentAppId}.`,
              );
            }

            const upsertResult = await transaction.queryObject<DeploymentRow>({
              text: `
                INSERT INTO deployments (
                  slug,
                  label,
                  app_id,
                  enabled_package_version_id
                ) VALUES ($1, $2, $3, $4)
                ON CONFLICT (slug) DO UPDATE SET
                  label = EXCLUDED.label,
                  enabled_package_version_id = EXCLUDED.enabled_package_version_id,
                  updated_at = now()
                RETURNING
                  deployments.id,
                  deployments.slug,
                  deployments.label,
                  deployments.app_id,
                  deployments.enabled_package_version_id,
                  (
                    SELECT version
                    FROM package_versions
                    WHERE id = deployments.enabled_package_version_id
                  ) AS enabled_package_version,
                  deployments.updated_at
              `,
              args: [
                input.slug,
                input.label,
                deploymentAppId,
                packageVersion.id,
              ],
              camelCase: true,
            });

            return mapDeploymentRow(upsertResult.rows[0]);
          },
        );
      });
    },
  };
}

async function reviewPackageVersion(
  pool: Pool,
  id: number,
  approvalStatus: Exclude<ApprovalStatus, "pending">,
  reviewNotes: string | null,
): Promise<PackageVersionRecord> {
  return await withClient(pool, async (client) => {
    return await withTransaction(
      client,
      "review_package_version",
      async (transaction) => {
        const existingResult = await transaction.queryObject<PackageVersionRow>(
          {
            text: `
          ${PACKAGE_VERSION_SELECT}
          WHERE id = $1
          FOR UPDATE
        `,
            args: [id],
            camelCase: true,
          },
        );
        const existingRow = existingResult.rows[0];

        if (!existingRow) {
          throw new Error(`Package version id ${id} was not found.`);
        }

        if (existingRow.approvalStatus !== "pending") {
          throw new Error(
            `Package version ${existingRow.appId}@${existingRow.version} has already been reviewed and cannot change state.`,
          );
        }

        const updatedResult = await transaction.queryObject<PackageVersionRow>({
          text: `
          UPDATE package_versions
          SET
            approval_status = $1,
            review_notes = $2,
            reviewed_at = now()
          WHERE id = $3
          RETURNING
            id,
            app_id,
            version,
            title,
            description,
            owner_type,
            owner_id,
            entrypoint,
            roles,
            install_scope,
            capabilities,
            grading_mode,
            grading_rubric_file,
            grading_max_score,
            approval_status,
            review_notes,
            reviewed_at,
            validation_issues,
            manifest_json,
            artifact_root,
            artifact_digest,
            imported_at
        `,
          args: [approvalStatus, reviewNotes, id],
          camelCase: true,
        });

        return mapPackageVersionRow(updatedResult.rows[0]);
      },
    );
  });
}

async function withClient<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    return await run(client);
  } finally {
    client.release();
  }
}

async function withTransaction<T>(
  client: PoolClient,
  name: string,
  run: (transaction: ReturnType<PoolClient["createTransaction"]>) => Promise<T>,
): Promise<T> {
  const transaction = client.createTransaction(name, {
    isolation_level: "serializable",
  });

  await transaction.begin();

  try {
    const result = await run(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // If the driver already closed the transaction, keep the original error.
    }

    throw error;
  }
}

function sortPackageVersions(
  records: PackageVersionRecord[],
): PackageVersionRecord[] {
  return [...records].sort((left, right) => {
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

function mapOptionalPackageVersion(
  row: PackageVersionRow | undefined,
): PackageVersionRecord | null {
  if (!row) {
    return null;
  }

  return mapPackageVersionRow(row);
}

function mapPackageVersionRow(
  row: PackageVersionRow | undefined,
): PackageVersionRecord {
  if (!row) {
    throw new Error("Expected a package version row.");
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
    entrypoint: row.entrypoint,
    roles: row.roles,
    installScope: row.installScope,
    capabilities: row.capabilities,
    grading: {
      mode: row.gradingMode,
      rubricFile: row.gradingRubricFile,
      maxScore: row.gradingMaxScore,
    },
    approvalStatus: row.approvalStatus,
    reviewNotes: row.reviewNotes,
    reviewedAt: normalizeOptionalTimestamp(row.reviewedAt),
    validationIssues: row.validationIssues ?? [],
    manifestJson: row.manifestJson,
    artifact: {
      snapshotRoot: row.artifactRoot,
      manifestPath: `${row.artifactRoot}/manifest.json`,
      entrypointPath: `${row.artifactRoot}${row.entrypoint}`,
      digest: row.artifactDigest,
    },
    importedAt: normalizeTimestamp(row.importedAt),
  };
}

function mapOptionalDeployment(
  row: DeploymentRow | undefined,
): DeploymentRecord | null {
  if (!row) {
    return null;
  }

  return mapDeploymentRow(row);
}

function mapDeploymentRow(row: DeploymentRow | undefined): DeploymentRecord {
  if (!row) {
    throw new Error("Expected a deployment row.");
  }

  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    appId: row.appId,
    enabledPackageVersionId: row.enabledPackageVersionId,
    enabledPackageVersion: row.enabledPackageVersion,
    updatedAt: normalizeTimestamp(row.updatedAt),
  };
}

function normalizeTimestamp(value: Date | string | null): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === null) {
    throw new Error("Expected a timestamp value.");
  }

  return value;
}

function normalizeOptionalTimestamp(
  value: Date | string | null,
): string | null {
  if (value === null) {
    return null;
  }

  return normalizeTimestamp(value);
}

function isUniqueViolation(error: unknown): error is PostgresError {
  return error instanceof Error &&
    error.name === "PostgresError" &&
    "fields" in error &&
    typeof (error as { fields?: { code?: string } }).fields?.code ===
      "string" &&
    (error as { fields: { code: string } }).fields.code === "23505";
}
