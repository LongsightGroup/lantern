import type { Pool, PoolClient, PostgresError } from "@db/postgres";
import { compare, parse } from "@std/semver";
import type { ImportedPackageVersion } from "./intake.ts";
import type {
  ApprovalStatus,
  DeploymentRecord,
  PackageVersionRecord,
  ValidationIssue,
} from "./types.ts";
import type {
  CanvasEnvironment,
  DeploymentBinding,
  LoginStateRecord,
  RuntimeSessionRecord,
} from "../lti/types.ts";

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
    deployments.canvas_environment,
    deployments.issuer,
    deployments.client_id,
    deployments.deployment_id,
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
  canvasEnvironment: CanvasEnvironment | null;
  issuer: string | null;
  clientId: string | null;
  deploymentId: string | null;
  updatedAt: Date | string;
}

interface LoginStateRow {
  state: string;
  canvasEnvironment: CanvasEnvironment;
  issuer: string;
  clientId: string;
  deploymentId: string;
  nonce: string;
  loginHint: string;
  targetLinkUri: string;
  ltiMessageHint: string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
  usedAt: Date | string | null;
}

interface RuntimeSessionRow {
  sessionId: string;
  sessionToken: string;
  attemptId?: string | null;
  deploymentRecordId: number;
  deploymentSlug: string;
  appId: string;
  packageVersionId: number;
  packageVersion: string;
  capabilities: RuntimeSessionRecord["capabilities"];
  snapshotRoot: string;
  entrypointPath: string;
  contentPath: string;
  launchUserRole: RuntimeSessionRecord["launch"]["userRole"];
  launchCourseId: string;
  launchAssignmentId: string | null;
  launchActivityId: string;
  createdAt: Date | string;
  expiresAt: Date | string;
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
  getDeploymentByBinding(
    binding: Pick<DeploymentBinding, "issuer" | "clientId" | "deploymentId">,
  ): Promise<DeploymentRecord | null>;
  createLoginState(record: LoginStateRecord): Promise<LoginStateRecord>;
  getLoginStateByState(state: string): Promise<LoginStateRecord | null>;
  consumeLoginState(input: {
    state: string;
    usedAt: string;
  }): Promise<LoginStateRecord>;
  createRuntimeSession(
    record: RuntimeSessionRecord,
  ): Promise<RuntimeSessionRecord>;
  getRuntimeSessionById(
    sessionId: string,
  ): Promise<RuntimeSessionRecord | null>;
  saveDeploymentBinding(input: {
    slug: string;
    label: string;
    appId: string;
    binding: DeploymentBinding;
  }): Promise<DeploymentRecord>;
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

    async getDeploymentByBinding(binding) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<DeploymentRow>({
          text: `
            ${DEPLOYMENT_SELECT}
            WHERE deployments.issuer = $1
              AND deployments.client_id = $2
              AND deployments.deployment_id = $3
          `,
          args: [binding.issuer, binding.clientId, binding.deploymentId],
          camelCase: true,
        });

        return mapOptionalDeployment(result.rows[0]);
      });
    },

    async createLoginState(record) {
      return await withClient(pool, async (client) => {
        try {
          const result = await client.queryObject<LoginStateRow>({
            text: `
              INSERT INTO lti_login_states (
                state,
                canvas_environment,
                issuer,
                client_id,
                deployment_id,
                nonce,
                login_hint,
                target_link_uri,
                lti_message_hint,
                created_at,
                expires_at,
                used_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
              )
              RETURNING
                state,
                canvas_environment,
                issuer,
                client_id,
                deployment_id,
                nonce,
                login_hint,
                target_link_uri,
                lti_message_hint,
                created_at,
                expires_at,
                used_at
            `,
            args: [
              record.state,
              record.canvasEnvironment,
              record.issuer,
              record.clientId,
              record.deploymentId,
              record.nonce,
              record.loginHint,
              record.targetLinkUri,
              record.ltiMessageHint,
              record.createdAt,
              record.expiresAt,
              record.usedAt,
            ],
            camelCase: true,
          });

          return mapLoginStateRow(result.rows[0]);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new Error(
              `Login state ${record.state} already exists and cannot be reused.`,
            );
          }

          throw error;
        }
      });
    },

    async getLoginStateByState(state) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<LoginStateRow>({
          text: `
            SELECT
              state,
              canvas_environment,
              issuer,
              client_id,
              deployment_id,
              nonce,
              login_hint,
              target_link_uri,
              lti_message_hint,
              created_at,
              expires_at,
              used_at
            FROM lti_login_states
            WHERE state = $1
          `,
          args: [state],
          camelCase: true,
        });

        return mapOptionalLoginState(result.rows[0]);
      });
    },

    async consumeLoginState(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          "consume_login_state",
          async (transaction) => {
            const updated = await transaction.queryObject<LoginStateRow>({
              text: `
                UPDATE lti_login_states
                SET used_at = $2
                WHERE state = $1
                  AND used_at IS NULL
                RETURNING
                  state,
                  canvas_environment,
                  issuer,
                  client_id,
                  deployment_id,
                  nonce,
                  login_hint,
                  target_link_uri,
                  lti_message_hint,
                  created_at,
                  expires_at,
                  used_at
              `,
              args: [input.state, input.usedAt],
              camelCase: true,
            });

            const consumed = updated.rows[0];

            if (consumed) {
              return mapLoginStateRow(consumed);
            }

            const existing = await transaction.queryObject<LoginStateRow>({
              text: `
                SELECT
                  state,
                  canvas_environment,
                  issuer,
                  client_id,
                  deployment_id,
                  nonce,
                  login_hint,
                  target_link_uri,
                  lti_message_hint,
                  created_at,
                  expires_at,
                  used_at
                FROM lti_login_states
                WHERE state = $1
              `,
              args: [input.state],
              camelCase: true,
            });
            const row = existing.rows[0];

            if (!row) {
              throw new Error(`Login state ${input.state} was not found.`);
            }

            if (row.usedAt !== null) {
              throw new Error(
                `Login state ${input.state} has already been used.`,
              );
            }

            throw new Error(
              `Login state ${input.state} could not be consumed.`,
            );
          },
        );
      });
    },

    async createRuntimeSession(record) {
      return await withClient(pool, async (client) => {
        try {
          const result = await client.queryObject<RuntimeSessionRow>({
            text: `
              INSERT INTO runtime_sessions (
                session_id,
                session_token,
                deployment_record_id,
                deployment_slug,
                app_id,
                package_version_id,
                package_version,
                capabilities,
                snapshot_root,
                entrypoint_path,
                content_path,
                launch_user_role,
                launch_course_id,
                launch_assignment_id,
                launch_activity_id,
                created_at,
                expires_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14, $15, $16, $17
              )
              RETURNING
                session_id,
                session_token,
                deployment_record_id,
                deployment_slug,
                app_id,
                package_version_id,
                package_version,
                capabilities,
                snapshot_root,
                entrypoint_path,
                content_path,
                launch_user_role,
                launch_course_id,
                launch_assignment_id,
                launch_activity_id,
                created_at,
                expires_at
            `,
            args: [
              record.sessionId,
              record.sessionToken,
              record.deploymentRecordId,
              record.deploymentSlug,
              record.appId,
              record.packageVersionId,
              record.packageVersion,
              record.capabilities,
              record.snapshotRoot,
              record.entrypointPath,
              record.contentPath,
              record.launch.userRole,
              record.launch.courseId,
              record.launch.assignmentId ?? null,
              record.launch.activityId,
              record.createdAt,
              record.expiresAt,
            ],
            camelCase: true,
          });

          return mapRuntimeSessionRow(result.rows[0]);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new Error(
              `Runtime session ${record.sessionId} already exists and cannot be replaced.`,
            );
          }

          throw error;
        }
      });
    },

    async getRuntimeSessionById(sessionId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<RuntimeSessionRow>({
          text: `
            SELECT
              session_id,
              session_token,
              deployment_record_id,
              deployment_slug,
              app_id,
              package_version_id,
              package_version,
              capabilities,
              snapshot_root,
              entrypoint_path,
              content_path,
              launch_user_role,
              launch_course_id,
              launch_assignment_id,
              launch_activity_id,
              created_at,
              expires_at
            FROM runtime_sessions
            WHERE session_id = $1
          `,
          args: [sessionId],
          camelCase: true,
        });

        return mapOptionalRuntimeSession(result.rows[0]);
      });
    },

    async saveDeploymentBinding(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          "save_deployment_binding",
          async (transaction) => {
            const existingDeploymentResult = await transaction.queryObject<
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
            const existingDeployment = existingDeploymentResult.rows[0];

            if (
              existingDeployment && existingDeployment.appId !== input.appId
            ) {
              throw new Error(
                `Deployment ${input.slug} belongs to app ${existingDeployment.appId}.`,
              );
            }

            const conflictingBindingResult = await transaction.queryObject<
              DeploymentRow
            >({
              text: `
                ${DEPLOYMENT_SELECT}
                WHERE deployments.issuer = $1
                  AND deployments.client_id = $2
                  AND deployments.deployment_id = $3
                  AND deployments.slug <> $4
              `,
              args: [
                input.binding.issuer,
                input.binding.clientId,
                input.binding.deploymentId,
                input.slug,
              ],
              camelCase: true,
            });

            if (conflictingBindingResult.rows[0]) {
              throw new Error(
                `Canvas binding ${input.binding.clientId} / ${input.binding.deploymentId} already belongs to another deployment.`,
              );
            }

            try {
              const upsertResult = await transaction.queryObject<DeploymentRow>(
                {
                  text: `
                  INSERT INTO deployments (
                    slug,
                    label,
                    app_id,
                    canvas_environment,
                    issuer,
                    client_id,
                    deployment_id
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                  ON CONFLICT (slug) DO UPDATE SET
                    label = EXCLUDED.label,
                    app_id = EXCLUDED.app_id,
                    canvas_environment = EXCLUDED.canvas_environment,
                    issuer = EXCLUDED.issuer,
                    client_id = EXCLUDED.client_id,
                    deployment_id = EXCLUDED.deployment_id,
                    updated_at = now()
                  RETURNING
                    deployments.id,
                    deployments.slug,
                    deployments.label,
                    deployments.app_id,
                    deployments.enabled_package_version_id,
                    deployments.canvas_environment,
                    deployments.issuer,
                    deployments.client_id,
                    deployments.deployment_id,
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
                    input.appId,
                    input.binding.canvasEnvironment,
                    input.binding.issuer,
                    input.binding.clientId,
                    input.binding.deploymentId,
                  ],
                  camelCase: true,
                },
              );

              return mapDeploymentRow(upsertResult.rows[0]);
            } catch (error) {
              if (isUniqueViolation(error)) {
                throw new Error(
                  `Canvas binding ${input.binding.clientId} / ${input.binding.deploymentId} already belongs to another deployment.`,
                );
              }

              throw error;
            }
          },
        );
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
                  deployments.canvas_environment,
                  deployments.issuer,
                  deployments.client_id,
                  deployments.deployment_id,
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
    binding: mapDeploymentBinding(row),
    updatedAt: normalizeTimestamp(row.updatedAt),
  };
}

function mapDeploymentBinding(row: DeploymentRow): DeploymentBinding | null {
  if (
    row.canvasEnvironment === null ||
    row.issuer === null ||
    row.clientId === null ||
    row.deploymentId === null
  ) {
    return null;
  }

  return {
    canvasEnvironment: row.canvasEnvironment,
    issuer: row.issuer,
    clientId: row.clientId,
    deploymentId: row.deploymentId,
  };
}

function mapOptionalLoginState(
  row: LoginStateRow | undefined,
): LoginStateRecord | null {
  if (!row) {
    return null;
  }

  return mapLoginStateRow(row);
}

function mapLoginStateRow(row: LoginStateRow | undefined): LoginStateRecord {
  if (!row) {
    throw new Error("Expected a login state row.");
  }

  return {
    state: row.state,
    canvasEnvironment: row.canvasEnvironment,
    issuer: row.issuer,
    clientId: row.clientId,
    deploymentId: row.deploymentId,
    nonce: row.nonce,
    loginHint: row.loginHint,
    targetLinkUri: row.targetLinkUri,
    ltiMessageHint: row.ltiMessageHint,
    createdAt: normalizeTimestamp(row.createdAt),
    expiresAt: normalizeTimestamp(row.expiresAt),
    usedAt: normalizeOptionalTimestamp(row.usedAt),
  };
}

function mapOptionalRuntimeSession(
  row: RuntimeSessionRow | undefined,
): RuntimeSessionRecord | null {
  if (!row) {
    return null;
  }

  return mapRuntimeSessionRow(row);
}

function mapRuntimeSessionRow(
  row: RuntimeSessionRow | undefined,
): RuntimeSessionRecord {
  if (!row) {
    throw new Error("Expected a runtime session row.");
  }

  return {
    sessionId: row.sessionId,
    sessionToken: row.sessionToken,
    attemptId: row.attemptId ?? row.sessionId,
    deploymentRecordId: row.deploymentRecordId,
    deploymentSlug: row.deploymentSlug,
    appId: row.appId,
    packageVersionId: row.packageVersionId,
    packageVersion: row.packageVersion,
    capabilities: row.capabilities,
    snapshotRoot: row.snapshotRoot,
    entrypointPath: row.entrypointPath,
    contentPath: row.contentPath,
    services: {
      ags: null,
      nrps: null,
    },
    launch: {
      userRole: row.launchUserRole,
      courseId: row.launchCourseId,
      ...(row.launchAssignmentId === null
        ? {}
        : { assignmentId: row.launchAssignmentId }),
      activityId: row.launchActivityId,
    },
    createdAt: normalizeTimestamp(row.createdAt),
    expiresAt: normalizeTimestamp(row.expiresAt),
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
