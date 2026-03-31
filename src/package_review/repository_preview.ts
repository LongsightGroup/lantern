import type { Pool } from "@db/postgres";
import { withClient, withTransaction } from "./repository_core.ts";
import {
  mapOptionalPreviewSession,
  mapPreviewEvidenceRow,
  mapPreviewSessionRow,
} from "./repository_mappers_review.ts";
import {
  PACKAGE_VERSION_SELECT,
  PREVIEW_EVIDENCE_SELECT,
  PREVIEW_SESSION_SELECT,
} from "./repository_query_fragments.ts";
import type {
  PackageVersionRow,
  PreviewEvidenceRow,
  PreviewSessionRow,
} from "./repository_row_types.ts";
import { isUniqueViolation } from "./repository_value_support.ts";
import type { PackageReviewRepository } from "./repository.ts";

export function createPreviewRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  | "createPreviewSession"
  | "getPreviewSessionById"
  | "getLatestPreviewSessionByPackageVersion"
  | "appendPreviewEvidence"
  | "listPreviewEvidence"
> {
  return {
    async createPreviewSession(record) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          "create_preview_session",
          async (transaction) => {
            const packageVersionResult = await transaction.queryObject<
              PackageVersionRow
            >({
              text: `
                ${PACKAGE_VERSION_SELECT}
                WHERE id = $1
                FOR UPDATE
              `,
              args: [record.packageVersionId],
              camelCase: true,
            });
            const packageVersionRow = packageVersionResult.rows[0];

            if (!packageVersionRow) {
              throw new Error(
                `Package version id ${record.packageVersionId} was not found.`,
              );
            }

            try {
              const insertResult = await transaction.queryObject<
                PreviewSessionRow
              >({
                text: `
                  INSERT INTO preview_sessions (
                    session_id,
                    package_version_id,
                    app_id,
                    package_version,
                    package_title,
                    capabilities,
                    snapshot_root,
                    entrypoint_path,
                    launch_user_id,
                    launch_user_role,
                    launch_course_id,
                    launch_assignment_id,
                    launch_activity_id,
                    fake_attempt_id,
                    fake_score_maximum,
                    fixture_data,
                    created_at
                  ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9,
                    $10, $11, $12, $13, $14, $15, $16::jsonb, $17
                  )
                  RETURNING
                    session_id,
                    package_version_id,
                    app_id,
                    package_version,
                    package_title,
                    capabilities,
                    snapshot_root,
                    entrypoint_path,
                    launch_user_id,
                    launch_user_role,
                    launch_course_id,
                    launch_assignment_id,
                    launch_activity_id,
                    fake_attempt_id,
                    fake_score_maximum,
                    fixture_data,
                    created_at
                `,
                args: [
                  record.sessionId,
                  record.packageVersionId,
                  record.appId,
                  record.packageVersion,
                  record.packageTitle,
                  record.capabilities,
                  record.snapshotRoot,
                  record.entrypointPath,
                  record.launch.userId,
                  record.launch.userRole,
                  record.launch.courseId,
                  record.launch.assignmentId,
                  record.launch.activityId,
                  record.fakeAttemptId,
                  record.fakeScoreMaximum,
                  JSON.stringify(record.fixtureData),
                  record.createdAt,
                ],
                camelCase: true,
              });

              return mapPreviewSessionRow(insertResult.rows[0]);
            } catch (error) {
              if (isUniqueViolation(error)) {
                throw new Error(
                  `Preview session ${record.sessionId} already exists and cannot be replaced.`,
                );
              }

              throw error;
            }
          },
        );
      });
    },

    async getPreviewSessionById(sessionId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<PreviewSessionRow>({
          text: `${PREVIEW_SESSION_SELECT} WHERE session_id = $1`,
          args: [sessionId],
          camelCase: true,
        });

        return mapOptionalPreviewSession(result.rows[0]);
      });
    },

    async getLatestPreviewSessionByPackageVersion(packageVersionId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<PreviewSessionRow>({
          text: `
            ${PREVIEW_SESSION_SELECT}
            WHERE package_version_id = $1
            ORDER BY created_at DESC
            LIMIT 1
          `,
          args: [packageVersionId],
          camelCase: true,
        });

        return mapOptionalPreviewSession(result.rows[0]);
      });
    },

    async appendPreviewEvidence(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          "append_preview_evidence",
          async (transaction) => {
            const sessionResult = await transaction.queryObject<
              { sessionId: string }
            >({
              text: `
                SELECT session_id
                FROM preview_sessions
                WHERE session_id = $1
                FOR UPDATE
              `,
              args: [input.previewSessionId],
              camelCase: true,
            });

            if (!sessionResult.rows[0]) {
              throw new Error(
                `Preview session ${input.previewSessionId} was not found.`,
              );
            }

            const sequenceResult = await transaction.queryObject<
              { nextSequence: number }
            >({
              text: `
                SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
                FROM preview_evidence
                WHERE preview_session_id = $1
              `,
              args: [input.previewSessionId],
              camelCase: true,
            });
            const nextSequence = sequenceResult.rows[0]?.nextSequence ?? 1;
            const insertResult = await transaction.queryObject<
              PreviewEvidenceRow
            >({
              text: `
                INSERT INTO preview_evidence (
                  preview_session_id,
                  sequence,
                  event_type,
                  capability,
                  summary,
                  detail,
                  occurred_at
                ) VALUES (
                  $1, $2, $3, $4, $5, $6::jsonb, $7
                )
                RETURNING
                  id,
                  preview_session_id,
                  sequence,
                  event_type,
                  capability,
                  summary,
                  detail,
                  occurred_at
              `,
              args: [
                input.previewSessionId,
                nextSequence,
                input.eventType,
                input.capability,
                input.summary,
                JSON.stringify(input.detail),
                input.occurredAt,
              ],
              camelCase: true,
            });

            return mapPreviewEvidenceRow(insertResult.rows[0]);
          },
        );
      });
    },

    async listPreviewEvidence(previewSessionId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<PreviewEvidenceRow>({
          text: `
            ${PREVIEW_EVIDENCE_SELECT}
            WHERE preview_session_id = $1
            ORDER BY sequence ASC
          `,
          args: [previewSessionId],
          camelCase: true,
        });

        return result.rows.map(mapPreviewEvidenceRow);
      });
    },
  };
}
