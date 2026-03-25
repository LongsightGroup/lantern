import type { Pool } from '@db/postgres';
import { withClient, withTransaction } from './repository_core.ts';
import { mapDeploymentRow, mapPackageVersionRow } from './repository_mappers_package.ts';
import { DEPLOYMENT_SELECT, PACKAGE_VERSION_SELECT } from './repository_query_fragments.ts';
import type { DeploymentRow, PackageVersionRow } from './repository_row_types.ts';
import { isUniqueViolation } from './repository_value_support.ts';
import type { PackageReviewRepository } from './repository.ts';

export function createDeploymentMutationRepositoryMethods(
  pool: Pool,
): Pick<PackageReviewRepository, 'saveDeploymentBinding' | 'pinDeploymentVersion'> {
  return {
    async saveDeploymentBinding(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(client, 'save_deployment_binding', async (transaction) => {
          const existingDeploymentResult = await transaction.queryObject<DeploymentRow>({
            text: `
                ${DEPLOYMENT_SELECT}
                WHERE deployments.slug = $1
                FOR UPDATE OF deployments
              `,
            args: [input.slug],
            camelCase: true,
          });
          const existingDeployment = existingDeploymentResult.rows[0];

          if (existingDeployment && existingDeployment.appId !== input.appId) {
            throw new Error(`Deployment ${input.slug} belongs to app ${existingDeployment.appId}.`);
          }

          const conflictingBindingResult = await transaction.queryObject<DeploymentRow>({
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
            const upsertResult = await transaction.queryObject<DeploymentRow>({
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
            });

            return mapDeploymentRow(upsertResult.rows[0]);
          } catch (error) {
            if (isUniqueViolation(error)) {
              throw new Error(
                `Canvas binding ${input.binding.clientId} / ${input.binding.deploymentId} already belongs to another deployment.`,
              );
            }

            throw error;
          }
        });
      });
    },

    async pinDeploymentVersion(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(client, 'pin_deployment_version', async (transaction) => {
          const packageVersionResult = await transaction.queryObject<PackageVersionRow>({
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
            throw new Error(`Package version id ${input.packageVersionId} was not found.`);
          }

          const packageVersion = mapPackageVersionRow(packageVersionRow);

          if (packageVersion.approvalStatus !== 'approved') {
            throw new Error('Only approved package versions can be enabled.');
          }

          const deploymentResult = await transaction.queryObject<DeploymentRow>({
            text: `
                ${DEPLOYMENT_SELECT}
                WHERE deployments.slug = $1
                FOR UPDATE OF deployments
              `,
            args: [input.slug],
            camelCase: true,
          });
          const existingDeployment = deploymentResult.rows[0];

          if (existingDeployment && existingDeployment.appId !== input.appId) {
            throw new Error(`Deployment ${input.slug} belongs to app ${existingDeployment.appId}.`);
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
            args: [input.slug, input.label, deploymentAppId, packageVersion.id],
            camelCase: true,
          });

          return mapDeploymentRow(upsertResult.rows[0]);
        });
      });
    },
  };
}
