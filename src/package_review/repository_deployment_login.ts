import type { Pool } from "@db/postgres";
import { withClient, withTransaction } from "./repository_core.ts";
import {
  mapLoginStateRow,
  mapOptionalDeployment,
  mapOptionalLoginState,
} from "./repository_mappers_package.ts";
import { DEPLOYMENT_SELECT } from "./repository_query_fragments.ts";
import type { DeploymentRow, LoginStateRow } from "./repository_row_types.ts";
import { isUniqueViolation } from "./repository_value_support.ts";
import type { PackageReviewRepository } from "./repository.ts";

export function createDeploymentLoginRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  | "getDeploymentBySlug"
  | "listDeploymentsByApp"
  | "getDeploymentByBinding"
  | "getDeploymentByPlatformIdentity"
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
        const result = await client.queryObject<DeploymentRow>({
          text: `
            ${DEPLOYMENT_SELECT}
            WHERE deployments.issuer = $1
              AND deployments.client_id = $2
              AND deployments.deployment_id = $3
            ORDER BY deployments.lms_type ASC, deployments.id ASC
          `,
          args: [
            input.issuer,
            input.clientId,
            input.deploymentId,
          ],
          camelCase: true,
        });

        if (result.rows.length === 0) {
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

    async createLoginState(record) {
      return await withClient(pool, async (client) => {
        try {
          const result = await client.queryObject<LoginStateRow>({
            text: `
              INSERT INTO lti_login_states (
                lms_type,
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
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
              )
              RETURNING
                lms_type,
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
              record.lms,
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
              lms_type,
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
                  lms_type,
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
                  lms_type,
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
  };
}
