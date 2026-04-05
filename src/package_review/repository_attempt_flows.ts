import type { Pool } from "@db/postgres";
import { withClient, withTransaction } from "./repository_core.ts";
import {
  mapAttemptEventRow,
  mapAttemptRow,
} from "./repository_mappers_attempts.ts";
import type { AttemptEventRow, AttemptRow } from "./repository_row_types.ts";
import { isUniqueViolation } from "./repository_value_support.ts";
import type { PackageReviewRepository } from "./repository.ts";

export function createAttemptFlowRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  | "createAttempt"
  | "appendAttemptEvent"
  | "finalizeAttempt"
  | "writeAttemptLocalState"
> {
  return {
    async createAttempt(record) {
      return await withClient(pool, async (client) => {
        try {
          const result = await client.queryObject<AttemptRow>({
            text: `
              INSERT INTO attempts (
                attempt_id,
                deployment_record_id,
                deployment_slug,
                app_id,
                package_version_id,
                package_version,
                user_id,
                user_display_name,
                user_email,
                user_login,
                user_role,
                context_id,
                resource_link_id,
                activity_id,
                status,
                completion_state,
                local_state,
                started_at,
                finalized_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19
              )
              RETURNING
                id,
                attempt_id,
                deployment_record_id,
                deployment_slug,
                app_id,
                package_version_id,
                package_version,
                user_id,
                user_display_name,
                user_email,
                user_login,
                user_role,
                context_id,
                resource_link_id,
                activity_id,
                status,
                completion_state,
                local_state,
                started_at,
                finalized_at
            `,
            args: [
              record.attemptId,
              record.deploymentRecordId,
              record.deploymentSlug,
              record.appId,
              record.packageVersionId,
              record.packageVersion,
              record.userId,
              record.userDisplayName,
              record.userEmail,
              record.userLogin,
              record.userRole,
              record.contextId,
              record.resourceLinkId,
              record.activityId,
              record.status,
              record.completionState,
              record.localState === null
                ? null
                : JSON.stringify(record.localState),
              record.startedAt,
              record.finalizedAt,
            ],
            camelCase: true,
          });

          return mapAttemptRow(result.rows[0]);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new Error(
              `Attempt ${record.attemptId} already exists and cannot be replaced.`,
            );
          }

          throw error;
        }
      });
    },

    async appendAttemptEvent(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          "append_attempt_event",
          async (transaction) => {
            const attemptResult = await transaction.queryObject<
              { attemptId: string }
            >({
              text: `
                SELECT attempt_id
                FROM attempts
                WHERE attempt_id = $1
                FOR UPDATE
              `,
              args: [input.attemptId],
              camelCase: true,
            });

            if (!attemptResult.rows[0]) {
              throw new Error(`Attempt ${input.attemptId} was not found.`);
            }

            const sequenceResult = await transaction.queryObject<
              { nextSequence: number }
            >({
              text: `
                SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
                FROM attempt_events
                WHERE attempt_id = $1
              `,
              args: [input.attemptId],
              camelCase: true,
            });
            const nextSequence = sequenceResult.rows[0]?.nextSequence ?? 1;
            const result = await transaction.queryObject<AttemptEventRow>({
              text: `
                INSERT INTO attempt_events (
                  attempt_id,
                  sequence,
                  event_type,
                  event,
                  received_at
                ) VALUES (
                  $1, $2, $3, $4::jsonb, $5
                )
                RETURNING
                  id,
                  attempt_id,
                  sequence,
                  event_type,
                  event,
                  received_at
              `,
              args: [
                input.attemptId,
                nextSequence,
                input.event.type,
                JSON.stringify(input.event),
                input.receivedAt,
              ],
              camelCase: true,
            });

            return mapAttemptEventRow(result.rows[0]);
          },
        );
      });
    },

    async writeAttemptLocalState(input) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<AttemptRow>({
          text: `
            UPDATE attempts
            SET
              local_state = $2::jsonb
            WHERE attempt_id = $1
            RETURNING
              id,
              attempt_id,
              deployment_record_id,
              deployment_slug,
              app_id,
              package_version_id,
              package_version,
              user_id,
              user_display_name,
              user_email,
              user_login,
              user_role,
              context_id,
              resource_link_id,
              activity_id,
              status,
              completion_state,
              local_state,
              started_at,
              finalized_at
          `,
          args: [
            input.attemptId,
            input.localState === null ? null : JSON.stringify(input.localState),
          ],
          camelCase: true,
        });
        const updated = result.rows[0];

        if (!updated) {
          throw new Error(`Attempt ${input.attemptId} was not found.`);
        }

        return mapAttemptRow(updated);
      });
    },

    async finalizeAttempt(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          "finalize_attempt",
          async (transaction) => {
            const existingResult = await transaction.queryObject<AttemptRow>({
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
                  user_display_name,
                  user_email,
                  user_login,
                  user_role,
                  context_id,
                  resource_link_id,
                  activity_id,
                  status,
                  completion_state,
                  local_state,
                  started_at,
                  finalized_at
                FROM attempts
                WHERE attempt_id = $1
                FOR UPDATE
              `,
              args: [input.attemptId],
              camelCase: true,
            });
            const existing = existingResult.rows[0];

            if (!existing) {
              throw new Error(`Attempt ${input.attemptId} was not found.`);
            }

            if (existing.finalizedAt !== null) {
              return mapAttemptRow(existing);
            }

            const updatedResult = await transaction.queryObject<AttemptRow>({
              text: `
                UPDATE attempts
                SET
                  status = $2,
                  completion_state = $3,
                  finalized_at = $4
                WHERE attempt_id = $1
                RETURNING
                  id,
                  attempt_id,
                  deployment_record_id,
                  deployment_slug,
                  app_id,
                  package_version_id,
                  package_version,
                  user_id,
                  user_display_name,
                  user_email,
                  user_login,
                  user_role,
                  context_id,
                  resource_link_id,
                  activity_id,
                  status,
                  completion_state,
                  local_state,
                  started_at,
                  finalized_at
              `,
              args: [
                input.attemptId,
                input.status,
                input.completionState,
                input.finalizedAt,
              ],
              camelCase: true,
            });

            return mapAttemptRow(updatedResult.rows[0]);
          },
        );
      });
    },
  };
}
