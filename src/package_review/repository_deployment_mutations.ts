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

export function createDeploymentMutationRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  "saveDeploymentBinding" | "pinDeploymentVersion"
> {
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
                  formatBindingLabel(input.binding.lms)
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
                  moodle_authentication_request_url,
                  moodle_access_token_url,
                  moodle_jwks_url,
                  sakai_oidc_authentication_url,
                  sakai_access_token_url,
                  sakai_jwks_url
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                ON CONFLICT (slug) DO UPDATE SET
                  label = EXCLUDED.label,
                  app_id = EXCLUDED.app_id,
                  lms_type = EXCLUDED.lms_type,
                  canvas_environment = EXCLUDED.canvas_environment,
                  issuer = EXCLUDED.issuer,
                  client_id = EXCLUDED.client_id,
                  deployment_id = EXCLUDED.deployment_id,
                  moodle_authentication_request_url = EXCLUDED.moodle_authentication_request_url,
                  moodle_access_token_url = EXCLUDED.moodle_access_token_url,
                  moodle_jwks_url = EXCLUDED.moodle_jwks_url,
                  sakai_oidc_authentication_url = EXCLUDED.sakai_oidc_authentication_url,
                  sakai_access_token_url = EXCLUDED.sakai_access_token_url,
                  sakai_jwks_url = EXCLUDED.sakai_jwks_url,
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
                  columns.moodleAuthenticationRequestUrl,
                  columns.moodleAccessTokenUrl,
                  columns.moodleJwksUrl,
                  columns.sakaiOidcAuthenticationUrl,
                  columns.sakaiAccessTokenUrl,
                  columns.sakaiJwksUrl,
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
              existingDeployment && existingDeployment.appId !== input.appId
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

            await transaction.queryArray(
              `
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
            `,
              [input.slug, input.label, deploymentAppId, packageVersion.id],
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

function bindingColumns(
  binding: Parameters<
    PackageReviewRepository["saveDeploymentBinding"]
  >[0]["binding"],
): {
  canvasEnvironment: DeploymentRow["canvasEnvironment"];
  moodleAuthenticationRequestUrl:
    DeploymentRow["moodleAuthenticationRequestUrl"];
  moodleAccessTokenUrl: DeploymentRow["moodleAccessTokenUrl"];
  moodleJwksUrl: DeploymentRow["moodleJwksUrl"];
  sakaiOidcAuthenticationUrl: DeploymentRow["sakaiOidcAuthenticationUrl"];
  sakaiAccessTokenUrl: DeploymentRow["sakaiAccessTokenUrl"];
  sakaiJwksUrl: DeploymentRow["sakaiJwksUrl"];
} {
  switch (binding.lms) {
    case "canvas":
      return {
        canvasEnvironment: binding.canvasEnvironment,
        moodleAuthenticationRequestUrl: null,
        moodleAccessTokenUrl: null,
        moodleJwksUrl: null,
        sakaiOidcAuthenticationUrl: null,
        sakaiAccessTokenUrl: null,
        sakaiJwksUrl: null,
      };
    case "moodle":
      return {
        canvasEnvironment: null,
        moodleAuthenticationRequestUrl: binding.authenticationRequestUrl,
        moodleAccessTokenUrl: binding.accessTokenUrl,
        moodleJwksUrl: binding.jwksUrl,
        sakaiOidcAuthenticationUrl: null,
        sakaiAccessTokenUrl: null,
        sakaiJwksUrl: null,
      };
    case "sakai":
      return {
        canvasEnvironment: null,
        moodleAuthenticationRequestUrl: null,
        moodleAccessTokenUrl: null,
        moodleJwksUrl: null,
        sakaiOidcAuthenticationUrl: binding.oidcAuthenticationUrl,
        sakaiAccessTokenUrl: binding.accessTokenUrl,
        sakaiJwksUrl: binding.jwksUrl,
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
      formatBindingLabel(input.binding.lms)
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
