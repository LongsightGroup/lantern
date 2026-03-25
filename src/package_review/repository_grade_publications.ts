import type { Pool } from '@db/postgres';
import { withClient } from './repository_core.ts';
import {
  mapGradePublicationRow,
  mapOptionalGradePublication,
} from './repository_mappers_attempts.ts';
import { GRADE_PUBLICATION_SELECT } from './repository_query_fragments.ts';
import type { GradePublicationRow } from './repository_row_types.ts';
import { isUniqueViolation } from './repository_value_support.ts';
import type { PackageReviewRepository } from './repository.ts';

export function createGradePublicationRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  'getGradePublicationByAttemptId' | 'createGradePublication' | 'updateGradePublication'
> {
  return {
    async getGradePublicationByAttemptId(attemptId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<GradePublicationRow>({
          text: `${GRADE_PUBLICATION_SELECT} WHERE attempt_id = $1`,
          args: [attemptId],
          camelCase: true,
        });

        return mapOptionalGradePublication(result.rows[0]);
      });
    },

    async createGradePublication(record) {
      return await withClient(pool, async (client) => {
        try {
          const result = await client.queryObject<GradePublicationRow>({
            text: `
              INSERT INTO grade_publications (
                attempt_id,
                line_item_binding_id,
                line_item_url,
                canvas_user_id,
                score_given,
                score_maximum,
                activity_progress,
                grading_progress,
                status,
                created_at,
                updated_at,
                published_at,
                error_code,
                error_detail
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb
              )
              RETURNING
                id,
                attempt_id,
                line_item_binding_id,
                line_item_url,
                canvas_user_id,
                score_given,
                score_maximum,
                activity_progress,
                grading_progress,
                status,
                created_at,
                updated_at,
                published_at,
                error_code,
                error_detail
            `,
            args: [
              record.attemptId,
              record.lineItemBindingId,
              record.lineItemUrl,
              record.canvasUserId,
              record.scoreGiven,
              record.scoreMaximum,
              record.activityProgress,
              record.gradingProgress,
              record.status,
              record.createdAt,
              record.updatedAt,
              record.publishedAt,
              record.errorCode,
              record.errorDetail === null ? null : JSON.stringify(record.errorDetail),
            ],
            camelCase: true,
          });

          return mapGradePublicationRow(result.rows[0]);
        } catch (error) {
          if (!isUniqueViolation(error)) {
            throw error;
          }

          const existingResult = await client.queryObject<GradePublicationRow>({
            text: `${GRADE_PUBLICATION_SELECT} WHERE attempt_id = $1`,
            args: [record.attemptId],
            camelCase: true,
          });
          const existing = mapOptionalGradePublication(existingResult.rows[0]);

          if (!existing) {
            throw error;
          }

          return existing;
        }
      });
    },

    async updateGradePublication(input) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<GradePublicationRow>({
          text: `
            UPDATE grade_publications
            SET
              status = $2,
              updated_at = $3,
              published_at = $4,
              error_code = $5,
              error_detail = $6::jsonb
            WHERE attempt_id = $1
            RETURNING
              id,
              attempt_id,
              line_item_binding_id,
              line_item_url,
              canvas_user_id,
              score_given,
              score_maximum,
              activity_progress,
              grading_progress,
              status,
              created_at,
              updated_at,
              published_at,
              error_code,
              error_detail
          `,
          args: [
            input.attemptId,
            input.status,
            input.updatedAt,
            input.publishedAt,
            input.errorCode,
            input.errorDetail === null ? null : JSON.stringify(input.errorDetail),
          ],
          camelCase: true,
        });

        return mapGradePublicationRow(result.rows[0]);
      });
    },
  };
}
