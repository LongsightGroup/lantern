import type { Pool } from "@db/postgres";
import { withClient } from "./repository_core.ts";
import { mapAuditEventRow } from "./repository_mappers_attempts.ts";
import type { AuditEventRow } from "./repository_row_types.ts";
import type { PackageReviewRepository } from "./repository.ts";

export function createAuditEventRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  | "recordAuditEvent"
  | "listAuditEventsByAttemptId"
  | "listAuditEventsByEventType"
> {
  return {
    async recordAuditEvent(record) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<AuditEventRow>({
          text: `
            INSERT INTO audit_events (
              event_type,
              actor_type,
              actor_id,
              deployment_record_id,
              package_version_id,
              attempt_id,
              line_item_binding_id,
              status,
              summary,
              detail,
              occurred_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11
            )
            RETURNING
              id,
              event_type,
              actor_type,
              actor_id,
              deployment_record_id,
              package_version_id,
              attempt_id,
              line_item_binding_id,
              status,
              summary,
              detail,
              occurred_at
          `,
          args: [
            record.eventType,
            record.actorType,
            record.actorId,
            record.deploymentRecordId,
            record.packageVersionId,
            record.attemptId,
            record.lineItemBindingId,
            record.status,
            record.summary,
            JSON.stringify(record.detail),
            record.occurredAt,
          ],
          camelCase: true,
        });

        return mapAuditEventRow(result.rows[0]);
      });
    },

    async listAuditEventsByAttemptId(attemptId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<AuditEventRow>({
          text: `
            SELECT
              id,
              event_type,
              actor_type,
              actor_id,
              deployment_record_id,
              package_version_id,
              attempt_id,
              line_item_binding_id,
              status,
              summary,
              detail,
              occurred_at
            FROM audit_events
            WHERE attempt_id = $1
            ORDER BY occurred_at ASC, id ASC
          `,
          args: [attemptId],
          camelCase: true,
        });

        return result.rows.map(mapAuditEventRow);
      });
    },

    async listAuditEventsByEventType(eventType) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<AuditEventRow>({
          text: `
            SELECT
              id,
              event_type,
              actor_type,
              actor_id,
              deployment_record_id,
              package_version_id,
              attempt_id,
              line_item_binding_id,
              status,
              summary,
              detail,
              occurred_at
            FROM audit_events
            WHERE event_type = $1
            ORDER BY occurred_at ASC, id ASC
          `,
          args: [eventType],
          camelCase: true,
        });

        return result.rows.map(mapAuditEventRow);
      });
    },
  };
}
