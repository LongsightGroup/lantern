import type { Pool } from '@db/postgres';
import { withClient, withTransaction } from './repository_core.ts';
import {
  mapCanvasLineItemBindingRow,
  mapOptionalLineItemBinding,
} from './repository_mappers_attempts.ts';
import { LINE_ITEM_BINDING_SELECT } from './repository_query_fragments.ts';
import type { CanvasLineItemBindingRow } from './repository_row_types.ts';
import { isUniqueViolation } from './repository_value_support.ts';
import type { PackageReviewRepository } from './repository.ts';

export function createLineItemRepositoryMethods(
  pool: Pool,
): Pick<PackageReviewRepository, 'getLineItemBinding' | 'saveLineItemBinding'> {
  return {
    async getLineItemBinding(input) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<CanvasLineItemBindingRow>({
          text: `
            ${LINE_ITEM_BINDING_SELECT}
            WHERE deployment_record_id = $1
              AND package_version_id = $2
              AND context_id = $3
              AND resource_link_id = $4
              AND activity_id = $5
          `,
          args: [
            input.deploymentRecordId,
            input.packageVersionId,
            input.contextId,
            input.resourceLinkId,
            input.activityId,
          ],
          camelCase: true,
        });

        return mapOptionalLineItemBinding(result.rows[0]);
      });
    },

    async saveLineItemBinding(record) {
      return await withClient(pool, async (client) => {
        return await withTransaction(client, 'save_line_item_binding', async (transaction) => {
          const existingResult = await transaction.queryObject<CanvasLineItemBindingRow>({
            text: `
                ${LINE_ITEM_BINDING_SELECT}
                WHERE deployment_record_id = $1
                  AND package_version_id = $2
                  AND context_id = $3
                  AND resource_link_id = $4
                  AND activity_id = $5
                FOR UPDATE
              `,
            args: [
              record.deploymentRecordId,
              record.packageVersionId,
              record.contextId,
              record.resourceLinkId,
              record.activityId,
            ],
            camelCase: true,
          });

          if (existingResult.rows[0]) {
            return mapCanvasLineItemBindingRow(existingResult.rows[0]);
          }

          try {
            const insertResult = await transaction.queryObject<CanvasLineItemBindingRow>({
              text: `
                  INSERT INTO canvas_line_item_bindings (
                    deployment_record_id,
                    package_version_id,
                    context_id,
                    resource_link_id,
                    activity_id,
                    line_items_url,
                    line_item_url,
                    resource_id,
                    tag,
                    label,
                    score_maximum,
                    created_at,
                    updated_at
                  ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
                  )
                  RETURNING
                    id,
                    deployment_record_id,
                    package_version_id,
                    context_id,
                    resource_link_id,
                    activity_id,
                    line_items_url,
                    line_item_url,
                    resource_id,
                    tag,
                    label,
                    score_maximum,
                    created_at,
                    updated_at
                `,
              args: [
                record.deploymentRecordId,
                record.packageVersionId,
                record.contextId,
                record.resourceLinkId,
                record.activityId,
                record.lineItemsUrl,
                record.lineItemUrl,
                record.resourceId,
                record.tag,
                record.label,
                record.scoreMaximum,
                record.createdAt,
                record.updatedAt,
              ],
              camelCase: true,
            });

            return mapCanvasLineItemBindingRow(insertResult.rows[0]);
          } catch (error) {
            if (!isUniqueViolation(error)) {
              throw error;
            }

            const retryResult = await transaction.queryObject<CanvasLineItemBindingRow>({
              text: `
                  ${LINE_ITEM_BINDING_SELECT}
                  WHERE (
                    deployment_record_id = $1
                    AND package_version_id = $2
                    AND context_id = $3
                    AND resource_link_id = $4
                    AND activity_id = $5
                  ) OR line_item_url = $6
                  LIMIT 1
                `,
              args: [
                record.deploymentRecordId,
                record.packageVersionId,
                record.contextId,
                record.resourceLinkId,
                record.activityId,
                record.lineItemUrl,
              ],
              camelCase: true,
            });

            if (retryResult.rows[0]) {
              return mapCanvasLineItemBindingRow(retryResult.rows[0]);
            }

            throw error;
          }
        });
      });
    },
  };
}
