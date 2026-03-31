import type { Pool } from "@db/postgres";
import { withClient, withTransaction } from "./repository_core.ts";
import { mapDeploymentRow } from "./repository_mappers_package.ts";
import { DEPLOYMENT_SELECT } from "./repository_query_fragments.ts";
import type { DeploymentRow } from "./repository_row_types.ts";
import { isUniqueViolation } from "./repository_value_support.ts";
import type { PackageReviewRepository } from "./repository.ts";

interface QueryObjectResult<Row> {
  rows: Row[];
}

interface QueryableTransaction {
  queryObject<Row>(query: {
    text: string;
    args?: unknown[];
    camelCase?: boolean;
  }): Promise<QueryObjectResult<Row>>;
}

export function createDeploymentBindingMutationMethods(
  pool: Pool,
): Pick<PackageReviewRepository, "saveDeploymentBinding"> {
  return {
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

            if (
              existingDeployment &&
              existingDeployment.lmsType !== input.binding.lms
            ) {
              throw new Error(
                `Deployment ${input.slug} is already bound as ${existingDeployment.lmsType} and cannot change to ${input.binding.lms}.`,
              );
            }

            const existingAppSlotResult = await transaction.queryObject<
              DeploymentRow
            >({
              text: `
                ${DEPLOYMENT_SELECT}
                WHERE deployments.app_id = $1
                  AND deployments.lms_type = $2
                  AND deployments.slug <> $3
              `,
              args: [input.appId, input.binding.lms, input.slug],
              camelCase: true,
            });

            if (existingAppSlotResult.rows[0]) {
              throw new Error(
                `App ${input.appId} already has a ${input.binding.lms} deployment.`,
              );
            }

            const conflictingBindingResult = await transaction.queryObject<
              DeploymentRow
            >({
              text: `
                ${DEPLOYMENT_SELECT}
                WHERE deployments.lms_type = $1
                  AND deployments.issuer = $2
                  AND deployments.client_id = $3
                  AND deployments.deployment_id = $4
                  AND deployments.slug <> $5
              `,
              args: [
                input.binding.lms,
                input.binding.issuer,
                input.binding.clientId,
                input.binding.deploymentId,
                input.slug,
              ],
              camelCase: true,
            });

            if (conflictingBindingResult.rows[0]) {
              throw new Error(
                `${
                  formatBindingLabel(
                    input.binding.lms,
                  )
                } ${input.binding.clientId} / ${input.binding.deploymentId} already belongs to another deployment.`,
              );
            }

            const columns = bindingColumns(input.binding);

            try {
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
                  deployment_id,
                  authorization_endpoint,
                  access_token_url,
                  jwks_url
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (slug) DO UPDATE SET
                  label = EXCLUDED.label,
                  app_id = EXCLUDED.app_id,
                  lms_type = EXCLUDED.lms_type,
                  canvas_environment = EXCLUDED.canvas_environment,
                  issuer = EXCLUDED.issuer,
                  client_id = EXCLUDED.client_id,
                  deployment_id = EXCLUDED.deployment_id,
                  authorization_endpoint = EXCLUDED.authorization_endpoint,
                  access_token_url = EXCLUDED.access_token_url,
                  jwks_url = EXCLUDED.jwks_url,
                  updated_at = now()
              `,
                [
                  input.slug,
                  input.label,
                  input.appId,
                  input.binding.lms,
                  columns.canvasEnvironment,
                  input.binding.issuer,
                  input.binding.clientId,
                  input.binding.deploymentId,
                  columns.authorizationEndpoint,
                  columns.accessTokenUrl,
                  columns.jwksUrl,
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
            } catch (error) {
              if (isUniqueViolation(error)) {
                throw await resolveSaveDeploymentBindingConflict(
                  transaction,
                  input,
                );
              }

              throw error;
            }
          },
        );
      });
    },
  };
}

function bindingColumns(
  binding: Parameters<
    PackageReviewRepository["saveDeploymentBinding"]
  >[0]["binding"],
): {
  canvasEnvironment: DeploymentRow["canvasEnvironment"];
  authorizationEndpoint: DeploymentRow["authorizationEndpoint"];
  accessTokenUrl: DeploymentRow["accessTokenUrl"];
  jwksUrl: DeploymentRow["jwksUrl"];
} {
  switch (binding.lms) {
    case "canvas":
      return {
        canvasEnvironment: binding.canvasEnvironment,
        authorizationEndpoint: null,
        accessTokenUrl: null,
        jwksUrl: null,
      };
    case "moodle":
    case "sakai":
      return {
        canvasEnvironment: null,
        authorizationEndpoint: binding.authorizationEndpoint,
        accessTokenUrl: binding.accessTokenUrl,
        jwksUrl: binding.jwksUrl,
      };
  }
}

async function resolveSaveDeploymentBindingConflict(
  transaction: QueryableTransaction,
  input: Parameters<PackageReviewRepository["saveDeploymentBinding"]>[0],
): Promise<Error> {
  const appSlotConflict = await transaction.queryObject<{ slug: string }>({
    text: `
      SELECT slug
      FROM deployments
      WHERE app_id = $1
        AND lms_type = $2
        AND slug <> $3
      LIMIT 1
    `,
    args: [input.appId, input.binding.lms, input.slug],
    camelCase: true,
  });

  if (appSlotConflict.rows[0]) {
    return new Error(
      `App ${input.appId} already has a ${input.binding.lms} deployment.`,
    );
  }

  return new Error(
    `${
      formatBindingLabel(
        input.binding.lms,
      )
    } ${input.binding.clientId} / ${input.binding.deploymentId} already belongs to another deployment.`,
  );
}

function formatBindingLabel(
  lms: Parameters<
    PackageReviewRepository["saveDeploymentBinding"]
  >[0]["binding"]["lms"],
): string {
  return `${lms[0]?.toUpperCase() ?? ""}${lms.slice(1)} binding`;
}
