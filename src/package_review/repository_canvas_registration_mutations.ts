import type { Pool } from "@db/postgres";
import { withClient, withTransaction } from "./repository_core.ts";
import { mapDeploymentRow } from "./repository_mappers_package.ts";
import { DEPLOYMENT_SELECT } from "./repository_query_fragments.ts";
import type { DeploymentRow } from "./repository_row_types.ts";
import type { PackageReviewRepository } from "./repository.ts";

export function createCanvasRegistrationMutationMethods(
  pool: Pool,
): Pick<PackageReviewRepository, "saveCanvasRegistration"> {
  return {
    async saveCanvasRegistration(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          "save_canvas_registration",
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

            if (existingDeployment && existingDeployment.lmsType !== "canvas") {
              throw new Error(
                `Deployment ${input.slug} is already bound as ${existingDeployment.lmsType} and cannot change to canvas.`,
              );
            }

            const existingAppSlotResult = await transaction.queryObject<
              DeploymentRow
            >({
              text: `
                ${DEPLOYMENT_SELECT}
                WHERE deployments.app_id = $1
                  AND deployments.lms_type = 'canvas'
                  AND deployments.slug <> $2
              `,
              args: [input.appId, input.slug],
              camelCase: true,
            });

            if (existingAppSlotResult.rows[0]) {
              throw new Error(
                `App ${input.appId} already has a canvas deployment.`,
              );
            }

            const conflictingPendingRegistration = await transaction
              .queryObject<DeploymentRow>({
                text: `
                  ${DEPLOYMENT_SELECT}
                  WHERE deployments.lms_type = 'canvas'
                    AND deployments.issuer = $1
                    AND deployments.client_id = $2
                    AND deployments.deployment_id IS NULL
                    AND deployments.slug <> $3
                `,
                args: [input.issuer, input.clientId, input.slug],
                camelCase: true,
              });

            if (conflictingPendingRegistration.rows[0]) {
              throw new Error(
                `Canvas registration ${input.clientId} is already reserved for another deployment.`,
              );
            }

            await transaction.queryArray(
              `
                INSERT INTO deployments (
                  slug,
                  label,
                  app_id,
                  lms_type,
                  canvas_environment,
                  issuer,
                  client_id,
                  deployment_id
                ) VALUES ($1, $2, $3, 'canvas', $4, $5, $6, NULL)
                ON CONFLICT (slug) DO UPDATE SET
                  label = EXCLUDED.label,
                  app_id = EXCLUDED.app_id,
                  lms_type = EXCLUDED.lms_type,
                  canvas_environment = EXCLUDED.canvas_environment,
                  issuer = EXCLUDED.issuer,
                  client_id = EXCLUDED.client_id,
                  deployment_id = NULL,
                  authorization_endpoint = NULL,
                  access_token_url = NULL,
                  jwks_url = NULL,
                  updated_at = now()
              `,
              [
                input.slug,
                input.label,
                input.appId,
                input.canvasEnvironment,
                input.issuer,
                input.clientId,
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
  };
}
