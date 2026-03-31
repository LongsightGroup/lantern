import type { Pool } from "@db/postgres";
import { withClient } from "./repository_core.ts";
import { mapOptionalRuntimeSession } from "./repository_mappers_sessions.ts";
import { RUNTIME_SESSION_SELECT } from "./repository_query_fragments.ts";
import type { RuntimeSessionRow } from "./repository_row_types.ts";
import type { PackageReviewRepository } from "./repository.ts";

export function createRuntimeLookupRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  "getRuntimeSessionById" | "getLatestRuntimeSessionByDeploymentId"
> {
  return {
    async getRuntimeSessionById(sessionId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<RuntimeSessionRow>({
          text: `${RUNTIME_SESSION_SELECT} WHERE session_id = $1`,
          args: [sessionId],
          camelCase: true,
        });

        return mapOptionalRuntimeSession(result.rows[0]);
      });
    },

    async getLatestRuntimeSessionByDeploymentId(deploymentRecordId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<RuntimeSessionRow>({
          text: `
            ${RUNTIME_SESSION_SELECT}
            WHERE deployment_record_id = $1
            ORDER BY created_at DESC
            LIMIT 1
          `,
          args: [deploymentRecordId],
          camelCase: true,
        });

        return mapOptionalRuntimeSession(result.rows[0]);
      });
    },
  };
}
