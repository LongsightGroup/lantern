import type { Pool } from "@db/postgres";
import { withClient, withTransaction } from "./repository_core.ts";
import {
  mapDeploymentRow,
  mapPackageVersionRow,
} from "./repository_mappers_package.ts";
import {
  DEPLOYMENT_SELECT,
  PACKAGE_VERSION_SELECT,
} from "./repository_query_fragments.ts";
import type {
  DeploymentRow,
  PackageVersionRow,
} from "./repository_row_types.ts";
import type { PackageReviewRepository } from "./repository.ts";
import { createDeploymentBindingMutationMethods } from "./repository_deployment_binding_mutations.ts";
import { createCanvasRegistrationMutationMethods } from "./repository_canvas_registration_mutations.ts";

export function createDeploymentMutationRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  "saveDeploymentBinding" | "saveCanvasRegistration" | "pinDeploymentVersion"
> {
  return {
    async pinDeploymentVersion(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          "pin_deployment_version",
          async (transaction) => {
            const lmsType = input.lmsType ?? "canvas";
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
              existingDeployment && existingDeployment.appId !== input.appId
            ) {
              throw new Error(
                `Deployment ${input.slug} belongs to app ${existingDeployment.appId}.`,
              );
            }

            if (existingDeployment && existingDeployment.lmsType !== lmsType) {
              throw new Error(
                `Deployment ${input.slug} is already reserved as ${existingDeployment.lmsType} and cannot change to ${lmsType}.`,
              );
            }

            const deploymentAppId = existingDeployment?.appId ?? input.appId;

            if (packageVersion.appId !== deploymentAppId) {
              throw new Error(
                `Package version ${packageVersion.appId}@${packageVersion.version} does not belong to deployment app ${deploymentAppId}.`,
              );
            }

            await transaction.queryArray(
              `
              INSERT INTO deployments (
                slug,
                label,
                app_id,
                lms_type,
                enabled_package_version_id
              ) VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (slug) DO UPDATE SET
                label = EXCLUDED.label,
                lms_type = EXCLUDED.lms_type,
                enabled_package_version_id = EXCLUDED.enabled_package_version_id,
                updated_at = now()
            `,
              [
                input.slug,
                input.label,
                deploymentAppId,
                lmsType,
                packageVersion.id,
              ],
            );

            const savedDeploymentResult = await transaction.queryObject<
              DeploymentRow
            >({
              text: `
              ${DEPLOYMENT_SELECT}
              WHERE deployments.slug = $1
            `,
              args: [input.slug],
              camelCase: true,
            });

            return mapDeploymentRow(savedDeploymentResult.rows[0]);
          },
        );
      });
    },
    ...createDeploymentBindingMutationMethods(pool),
    ...createCanvasRegistrationMutationMethods(pool),
  };
}
