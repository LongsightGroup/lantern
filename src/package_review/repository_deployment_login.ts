import type { Pool } from "@db/postgres";
import { withClient, withTransaction } from "./repository_core.ts";
import {
  mapDeploymentRow,
  mapOptionalDeployment,
} from "./repository_mappers_package.ts";
import { DEPLOYMENT_SELECT } from "./repository_query_fragments.ts";
import type { DeploymentRow } from "./repository_row_types.ts";
import type { PackageReviewRepository } from "./repository.ts";
import { createLoginStateRepositoryMethods } from "./repository_login_state_methods.ts";

export function createDeploymentLoginRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  | "getDeploymentBySlug"
  | "listDeploymentsByApp"
  | "getDeploymentByBinding"
  | "getDeploymentByPlatformIdentity"
  | "completePendingCanvasBinding"
  | "createLoginState"
  | "getLoginStateByState"
  | "consumeLoginState"
> {
  return {
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

    async listDeploymentsByApp(appId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<DeploymentRow>({
          text: `
            ${DEPLOYMENT_SELECT}
            WHERE deployments.app_id = $1
              AND deployments.lms_type <> 'preview'
            ORDER BY deployments.lms_type ASC, deployments.slug ASC
          `,
          args: [appId],
          camelCase: true,
        });

        return result.rows.map((row) => mapOptionalDeployment(row)).filter((
          row,
        ) => row !== null);
      });
    },

    async getDeploymentByBinding(binding) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<DeploymentRow>({
          text: `
            ${DEPLOYMENT_SELECT}
            WHERE deployments.lms_type = $1
              AND deployments.issuer = $2
              AND deployments.client_id = $3
              AND deployments.deployment_id = $4
          `,
          args: [
            binding.lms,
            binding.issuer,
            binding.clientId,
            binding.deploymentId,
          ],
          camelCase: true,
        });

        return mapOptionalDeployment(result.rows[0]);
      });
    },

    async getDeploymentByPlatformIdentity(input) {
      return await withClient(pool, async (client) => {
        if (input.clientId === null) {
          const result = await client.queryObject<DeploymentRow>({
            text: `
              ${DEPLOYMENT_SELECT}
              WHERE deployments.issuer = $1
                AND deployments.deployment_id = $2
              ORDER BY deployments.lms_type ASC, deployments.id ASC
            `,
            args: [input.issuer, input.deploymentId],
            camelCase: true,
          });

          if (result.rows.length === 0) {
            return null;
          }

          if (result.rows.length > 1) {
            throw new Error(
              `Multiple deployments matched issuer ${input.issuer} with deployment ${input.deploymentId}. Platform must send client_id or duplicate LMS bindings must be resolved before login can continue.`,
            );
          }

          return mapOptionalDeployment(result.rows[0]);
        }

        const result = await client.queryObject<DeploymentRow>({
          text: `
            ${DEPLOYMENT_SELECT}
            WHERE deployments.issuer = $1
              AND deployments.client_id = $2
              AND deployments.deployment_id = $3
            ORDER BY deployments.lms_type ASC, deployments.id ASC
          `,
          args: [input.issuer, input.clientId, input.deploymentId],
          camelCase: true,
        });

        if (result.rows.length === 0) {
          const canvasMismatch = await client.queryObject<DeploymentRow>({
            text: `
              ${DEPLOYMENT_SELECT}
              WHERE deployments.lms_type = 'canvas'
                AND deployments.issuer = $1
                AND deployments.client_id = $2
              ORDER BY deployments.id ASC
            `,
            args: [input.issuer, input.clientId],
            camelCase: true,
          });
          const savedCanvas = canvasMismatch.rows[0];

          if (
            canvasMismatch.rows.length === 1 &&
            savedCanvas !== undefined &&
            savedCanvas.deploymentId !== null &&
            savedCanvas.deploymentId !== input.deploymentId
          ) {
            throw new Error(
              `Canvas sent deployment ${input.deploymentId} for issuer ${input.issuer} and client ${input.clientId}, but Lantern saved deployment ${savedCanvas.deploymentId}. Update the saved Canvas binding or relaunch from the correct Canvas placement.`,
            );
          }

          return null;
        }

        if (result.rows.length > 1) {
          throw new Error(
            `Multiple deployments matched issuer ${input.issuer} with client ${input.clientId} and deployment ${input.deploymentId}. Resolve the duplicate LMS bindings before login can continue.`,
          );
        }

        return mapOptionalDeployment(result.rows[0]);
      });
    },

    async completePendingCanvasBinding(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          "complete_pending_canvas_binding",
          async (transaction) => {
            const exactMatch = await transaction.queryObject<DeploymentRow>({
              text: `
                ${DEPLOYMENT_SELECT}
                WHERE deployments.lms_type = 'canvas'
                  AND deployments.issuer = $1
                  AND deployments.client_id = $2
                  AND deployments.deployment_id = $3
                ORDER BY deployments.id ASC
              `,
              args: [input.issuer, input.clientId, input.deploymentId],
              camelCase: true,
            });

            if (exactMatch.rows[0]) {
              return mapDeploymentRow(exactMatch.rows[0]);
            }

            const pendingResult = await transaction.queryObject<DeploymentRow>({
              text: `
                ${DEPLOYMENT_SELECT}
                WHERE deployments.lms_type = 'canvas'
                  AND deployments.issuer = $1
                  AND deployments.client_id = $2
                  AND deployments.deployment_id IS NULL
                ORDER BY deployments.id ASC
                FOR UPDATE OF deployments
              `,
              args: [input.issuer, input.clientId],
              camelCase: true,
            });

            if (pendingResult.rows.length === 0) {
              return null;
            }

            if (pendingResult.rows.length > 1) {
              throw new Error(
                `Multiple Canvas registrations matched issuer ${input.issuer} with client ${input.clientId}. Resolve the duplicate Canvas registrations before login can continue.`,
              );
            }

            await transaction.queryArray(
              `
                UPDATE deployments
                SET deployment_id = $2,
                    updated_at = now()
                WHERE id = $1
              `,
              [pendingResult.rows[0]?.id, input.deploymentId],
            );

            const updated = await transaction.queryObject<DeploymentRow>({
              text: `
                ${DEPLOYMENT_SELECT}
                WHERE deployments.id = $1
              `,
              args: [pendingResult.rows[0]?.id],
              camelCase: true,
            });

            return mapOptionalDeployment(updated.rows[0]);
          },
        );
      });
    },
    ...createLoginStateRepositoryMethods(pool),
  };
}
