import type { Pool } from '@db/postgres';
import { withClient, withTransaction } from './repository_core.ts';
import { mapOptionalPlacementAuditSnapshot } from './repository_mappers_review.ts';
import {
  mapOptionalReviewedPlacement,
  mapReviewedPlacementRow,
} from './repository_mappers_sessions.ts';
import {
  PLACEMENT_AUDIT_SNAPSHOT_SELECT,
  REVIEWED_PLACEMENT_SELECT,
} from './repository_query_fragments.ts';
import type { PlacementAuditSnapshotRow, ReviewedPlacementRow } from './repository_row_types.ts';
import { isUniqueViolation } from './repository_value_support.ts';
import type { PackageReviewRepository } from './repository.ts';

export function createReviewedPlacementRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  | 'createReviewedPlacement'
  | 'getReviewedPlacementById'
  | 'getPlacementAuditSnapshotById'
  | 'requirePlacementAuditSnapshotById'
  | 'bindReviewedPlacementResourceLink'
> {
  const methods: Pick<
    PackageReviewRepository,
    | 'createReviewedPlacement'
    | 'getReviewedPlacementById'
    | 'getPlacementAuditSnapshotById'
    | 'requirePlacementAuditSnapshotById'
    | 'bindReviewedPlacementResourceLink'
  > = {
    async createReviewedPlacement(record) {
      return await withClient(pool, async (client) => {
        try {
          const result = await client.queryObject<ReviewedPlacementRow>({
            text: `
              INSERT INTO reviewed_placements (
                placement_id,
                deployment_record_id,
                deployment_slug,
                app_id,
                context_id,
                context_title,
                package_version_id,
                package_version,
                package_title,
                activity_id,
                content_path,
                content_title,
                created_by_user_id,
                resource_link_id,
                created_at,
                bound_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14, $15, $16
              )
              RETURNING
                placement_id,
                deployment_record_id,
                deployment_slug,
                app_id,
                context_id,
                context_title,
                package_version_id,
                package_version,
                package_title,
                activity_id,
                content_path,
                content_title,
                created_by_user_id,
                resource_link_id,
                created_at,
                bound_at
            `,
            args: [
              record.placementId,
              record.deploymentRecordId,
              record.deploymentSlug,
              record.appId,
              record.contextId,
              record.contextTitle,
              record.packageVersionId,
              record.packageVersion,
              record.packageTitle,
              record.activityId,
              record.contentPath,
              record.contentTitle,
              record.createdByUserId,
              record.resourceLinkId,
              record.createdAt,
              record.boundAt,
            ],
            camelCase: true,
          });

          return mapReviewedPlacementRow(result.rows[0]);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new Error(
              `Reviewed placement ${record.placementId} already exists and cannot be replaced.`,
            );
          }

          throw error;
        }
      });
    },

    async getReviewedPlacementById(placementId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<ReviewedPlacementRow>({
          text: `${REVIEWED_PLACEMENT_SELECT} WHERE placement_id = $1`,
          args: [placementId],
          camelCase: true,
        });

        return mapOptionalReviewedPlacement(result.rows[0]);
      });
    },

    async getPlacementAuditSnapshotById(placementId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<PlacementAuditSnapshotRow>({
          text: `${PLACEMENT_AUDIT_SNAPSHOT_SELECT} WHERE reviewed_placements.placement_id = $1`,
          args: [placementId],
          camelCase: true,
        });

        return mapOptionalPlacementAuditSnapshot(result.rows[0]);
      });
    },

    async requirePlacementAuditSnapshotById(placementId) {
      const snapshot = await methods.getPlacementAuditSnapshotById(placementId);

      if (snapshot === null) {
        throw new Error(`Reviewed placement ${placementId} was not found.`);
      }

      return snapshot;
    },

    async bindReviewedPlacementResourceLink(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          'bind_reviewed_placement_resource_link',
          async (transaction) => {
            const existingResult = await transaction.queryObject<ReviewedPlacementRow>({
              text: `
                ${REVIEWED_PLACEMENT_SELECT}
                WHERE placement_id = $1
                FOR UPDATE
              `,
              args: [input.placementId],
              camelCase: true,
            });
            const existing = existingResult.rows[0];

            if (!existing) {
              throw new Error(`Reviewed placement ${input.placementId} was not found.`);
            }

            if (
              existing.resourceLinkId !== null &&
              existing.resourceLinkId !== input.resourceLinkId
            ) {
              throw new Error(
                `Reviewed placement ${input.placementId} is already bound to Canvas resource link ${existing.resourceLinkId}.`,
              );
            }

            if (existing.resourceLinkId === input.resourceLinkId) {
              return mapReviewedPlacementRow(existing);
            }

            try {
              const updated = await transaction.queryObject<ReviewedPlacementRow>({
                text: `
                  UPDATE reviewed_placements
                  SET
                    resource_link_id = $2,
                    bound_at = $3
                  WHERE placement_id = $1
                  RETURNING
                    placement_id,
                    deployment_record_id,
                    deployment_slug,
                    app_id,
                    context_id,
                    context_title,
                    package_version_id,
                    package_version,
                    package_title,
                    activity_id,
                    content_path,
                    content_title,
                    created_by_user_id,
                    resource_link_id,
                    created_at,
                    bound_at
                `,
                args: [input.placementId, input.resourceLinkId, input.boundAt],
                camelCase: true,
              });

              return mapReviewedPlacementRow(updated.rows[0]);
            } catch (error) {
              if (isUniqueViolation(error)) {
                throw new Error(
                  `Canvas resource link ${input.resourceLinkId} is already bound to another reviewed placement in deployment ${existing.deploymentSlug}.`,
                );
              }

              throw error;
            }
          },
        );
      });
    },
  };

  return methods;
}
