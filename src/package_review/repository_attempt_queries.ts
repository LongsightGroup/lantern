import type { Pool } from '@db/postgres';
import { withClient } from './repository_core.ts';
import { mapAttemptEventRow, mapOptionalAttempt } from './repository_mappers_attempts.ts';
import type { AttemptEventRow, AttemptRow } from './repository_row_types.ts';
import type { PackageReviewRepository } from './repository.ts';

export function createAttemptQueryRepositoryMethods(
  pool: Pool,
): Pick<PackageReviewRepository, 'getAttemptById' | 'listAttemptEvents'> {
  return {
    async getAttemptById(attemptId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<AttemptRow>({
          text: `
            SELECT
              id,
              attempt_id,
              deployment_record_id,
              deployment_slug,
              app_id,
              package_version_id,
              package_version,
              user_id,
              user_role,
              context_id,
              resource_link_id,
              activity_id,
              status,
              completion_state,
              started_at,
              finalized_at
            FROM attempts
            WHERE attempt_id = $1
          `,
          args: [attemptId],
          camelCase: true,
        });

        return mapOptionalAttempt(result.rows[0]);
      });
    },

    async listAttemptEvents(attemptId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<AttemptEventRow>({
          text: `
            SELECT
              id,
              attempt_id,
              sequence,
              event_type,
              event,
              received_at
            FROM attempt_events
            WHERE attempt_id = $1
            ORDER BY sequence ASC
          `,
          args: [attemptId],
          camelCase: true,
        });

        return result.rows.map(mapAttemptEventRow);
      });
    },
  };
}
