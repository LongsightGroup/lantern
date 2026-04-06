import type { Pool } from "@db/postgres";
import type { ImportedPackageVersion } from "./intake.ts";
import { reviewPackageVersion, withClient } from "./repository_core.ts";
import {
  mapOptionalPackageVersion,
  mapPackageVersionRow,
} from "./repository_mappers_package.ts";
import { PACKAGE_VERSION_SELECT } from "./repository_query_fragments.ts";
import type { PackageVersionRow } from "./repository_row_types.ts";
import { sortPackageVersions } from "./repository_resource_options.ts";
import { isUniqueViolation } from "./repository_value_support.ts";
import type { PackageReviewRepository } from "./repository.ts";

export function createPackageVersionRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  | "registerPackageVersion"
  | "listPackageVersions"
  | "listPackageVersionsByApp"
  | "getPackageVersionById"
  | "getPackageVersionByAppVersion"
  | "approvePackageVersion"
  | "rejectPackageVersion"
> {
  return {
    async registerPackageVersion(input: ImportedPackageVersion) {
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
                accessibility_review,
                reviewed_at,
                validation_issues,
                manifest_json,
                artifact_root,
                artifact_digest,
                runtime_contract,
                runtime_contract_signature
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, 'pending', NULL, NULL, NULL, $14::jsonb, $15::jsonb, $16, $17, $18::jsonb, $19
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
                accessibility_review,
                reviewed_at,
                validation_issues,
                manifest_json,
                artifact_root,
                artifact_digest,
                runtime_contract,
                runtime_contract_signature,
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
              JSON.stringify(input.runtimeContract),
              input.runtimeContractSignature,
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
        input.accessibilityReview,
      );
    },

    async rejectPackageVersion(input) {
      return await reviewPackageVersion(
        pool,
        input.id,
        "rejected",
        input.reviewNotes,
        input.accessibilityReview,
      );
    },
  };
}
