import type { Pool } from "@db/postgres";
import { DEFAULT_LTI_PROFILE_ID, requireLtiProfileId } from "../lti/profile.ts";
import type { PackageReviewRepository } from "./repository.ts";
import { withClient, withTransaction } from "./repository_core.ts";
import { mapDeploymentRow } from "./repository_mappers_package.ts";
import { DEPLOYMENT_SELECT } from "./repository_query_fragments.ts";
import type {
  DeploymentRow,
  LanternLtiProfileSettingsRow,
} from "./repository_row_types.ts";
import type { LanternLtiProfileSettingsRecord } from "./types.ts";
import { normalizeTimestamp } from "./repository_value_support.ts";

function mapLanternLtiProfileSettingsRow(
  row: LanternLtiProfileSettingsRow,
): LanternLtiProfileSettingsRecord {
  return {
    defaultLtiProfile: requireLtiProfileId(
      row.defaultLtiProfile,
      `Unsupported saved LTI profile ${row.defaultLtiProfile}.`,
    ),
    updatedAt: normalizeTimestamp(row.updatedAt),
  };
}

export function createLtiProfileSettingsRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  | "getLanternLtiProfileSettings"
  | "saveLanternDefaultLtiProfile"
  | "saveDeploymentLtiProfileOverride"
> {
  return {
    async getLanternLtiProfileSettings() {
      return await withClient(pool, async (client) => {
        return await ensureLanternLtiProfileSettings(client);
      });
    },

    async saveLanternDefaultLtiProfile(input) {
      const defaultLtiProfile = requireLtiProfileId(
        input.defaultLtiProfile,
      );

      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          "save_lantern_default_lti_profile",
          async (transaction) => {
            await transaction.queryObject<LanternLtiProfileSettingsRow>({
              text: `
                INSERT INTO lantern_settings (
                  singleton,
                  default_lti_profile
                ) VALUES (TRUE, $1)
                ON CONFLICT (singleton) DO UPDATE SET
                  default_lti_profile = EXCLUDED.default_lti_profile,
                  updated_at = now()
                RETURNING
                  default_lti_profile,
                  updated_at
              `,
              args: [defaultLtiProfile],
              camelCase: true,
            });

            return await ensureLanternLtiProfileSettings(transaction);
          },
        );
      });
    },

    async saveDeploymentLtiProfileOverride(input) {
      const ltiProfileOverride = input.ltiProfileOverride === null
        ? null
        : requireLtiProfileId(input.ltiProfileOverride);

      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          "save_deployment_lti_profile_override",
          async (transaction) => {
            const existingResult = await transaction.queryObject<DeploymentRow>(
              {
                text: `
                ${DEPLOYMENT_SELECT}
                WHERE deployments.id = $1
                FOR UPDATE OF deployments
              `,
                args: [input.deploymentId],
                camelCase: true,
              },
            );
            const existing = existingResult.rows[0];

            if (!existing) {
              throw new Error(
                `Deployment id ${input.deploymentId} was not found.`,
              );
            }

            await transaction.queryArray(
              `
                UPDATE deployments
                SET
                  lti_profile_override = $1,
                  updated_at = now()
                WHERE id = $2
              `,
              [ltiProfileOverride, input.deploymentId],
            );

            const savedResult = await transaction.queryObject<DeploymentRow>({
              text: `
                ${DEPLOYMENT_SELECT}
                WHERE deployments.id = $1
              `,
              args: [input.deploymentId],
              camelCase: true,
            });

            return mapDeploymentRow(savedResult.rows[0]);
          },
        );
      });
    },
  };
}

interface Queryable {
  queryObject<Row>(query: {
    text: string;
    args?: unknown[];
    camelCase?: boolean;
  }): Promise<{ rows: Row[] }>;
}

async function ensureLanternLtiProfileSettings(
  client: Queryable,
): Promise<LanternLtiProfileSettingsRecord> {
  const existingResult = await client.queryObject<LanternLtiProfileSettingsRow>(
    {
      text: `
      SELECT
        default_lti_profile,
        updated_at
      FROM lantern_settings
      WHERE singleton = TRUE
    `,
      camelCase: true,
    },
  );
  const existing = existingResult.rows[0];

  if (existing) {
    return mapLanternLtiProfileSettingsRow(existing);
  }

  const insertedResult = await client.queryObject<LanternLtiProfileSettingsRow>(
    {
      text: `
      INSERT INTO lantern_settings (
        singleton,
        default_lti_profile
      ) VALUES (TRUE, $1)
      ON CONFLICT (singleton) DO UPDATE SET
        default_lti_profile = lantern_settings.default_lti_profile
      RETURNING
        default_lti_profile,
        updated_at
    `,
      args: [DEFAULT_LTI_PROFILE_ID],
      camelCase: true,
    },
  );

  return mapLanternLtiProfileSettingsRow(insertedResult.rows[0]!);
}
