import type { Pool } from "@db/postgres";
import { withClient, withTransaction } from "./repository_core.ts";
import { mapPackageVersionRow } from "./repository_mappers_package.ts";
import {
  mapDeepLinkingSessionRow,
  mapOptionalDeepLinkingSession,
} from "./repository_mappers_sessions.ts";
import {
  DEEP_LINKING_SESSION_SELECT,
  PACKAGE_VERSION_SELECT,
} from "./repository_query_fragments.ts";
import type {
  DeepLinkingSessionRow,
  PackageVersionRow,
} from "./repository_row_types.ts";
import {
  buildDeepLinkingResourceOptions,
  sortPackageVersions,
} from "./repository_resource_options.ts";
import { isUniqueViolation } from "./repository_value_support.ts";
import type { PackageReviewRepository } from "./repository.ts";

export function createDeepLinkingSessionRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  | "createDeepLinkingSession"
  | "getDeepLinkingSessionById"
  | "consumeDeepLinkingSession"
  | "updateDeepLinkingSessionSelection"
  | "listDeepLinkingResourceOptions"
> {
  return {
    async createDeepLinkingSession(record) {
      return await withClient(pool, async (client) => {
        try {
          const result = await client.queryObject<DeepLinkingSessionRow>({
            text: `
              INSERT INTO deep_linking_sessions (
                session_id,
                session_token,
                deployment_record_id,
                deployment_slug,
                app_id,
                user_id,
                user_role,
                context_id,
                context_title,
                deep_link_return_url,
                data,
                placement,
                accept_types,
                accept_multiple,
                accept_presentation_document_targets,
                accept_line_item,
                selected_package_version_id,
                selected_package_version,
                selected_activity_id,
                selected_content_path,
                created_at,
                expires_at,
                used_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
              )
              RETURNING
                session_id,
                session_token,
                deployment_record_id,
                deployment_slug,
                app_id,
                user_id,
                user_role,
                context_id,
                context_title,
                deep_link_return_url,
                data,
                placement,
                accept_types,
                accept_multiple,
                accept_presentation_document_targets,
                accept_line_item,
                selected_package_version_id,
                selected_package_version,
                selected_activity_id,
                selected_content_path,
                created_at,
                expires_at,
                used_at
            `,
            args: [
              record.sessionId,
              record.sessionToken,
              record.deploymentRecordId,
              record.deploymentSlug,
              record.appId,
              record.userId,
              record.userRole,
              record.contextId,
              record.contextTitle,
              record.deepLinkReturnUrl,
              record.data,
              record.placement,
              record.acceptTypes,
              record.acceptMultiple,
              record.acceptPresentationDocumentTargets,
              record.acceptLineItem,
              record.selection?.packageVersionId ?? null,
              record.selection?.packageVersion ?? null,
              record.selection?.activityId ?? null,
              record.selection?.contentPath ?? null,
              record.createdAt,
              record.expiresAt,
              record.usedAt,
            ],
            camelCase: true,
          });

          return mapDeepLinkingSessionRow(result.rows[0]);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new Error(
              `Deep Linking session ${record.sessionId} already exists and cannot be replaced.`,
            );
          }

          throw error;
        }
      });
    },

    async getDeepLinkingSessionById(sessionId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<DeepLinkingSessionRow>({
          text: `${DEEP_LINKING_SESSION_SELECT} WHERE session_id = $1`,
          args: [sessionId],
          camelCase: true,
        });

        return mapOptionalDeepLinkingSession(result.rows[0]);
      });
    },

    async consumeDeepLinkingSession(input) {
      return await withClient(pool, async (client) => {
        return await withTransaction(
          client,
          "consume_deep_linking_session",
          async (transaction) => {
            const updated = await transaction.queryObject<
              DeepLinkingSessionRow
            >(
              {
                text: `
                  UPDATE deep_linking_sessions
                  SET used_at = $2
                  WHERE session_id = $1
                    AND used_at IS NULL
                  RETURNING
                    session_id,
                    session_token,
                    deployment_record_id,
                    deployment_slug,
                    app_id,
                    user_id,
                    user_role,
                    context_id,
                    context_title,
                    deep_link_return_url,
                    data,
                    placement,
                    accept_types,
                    accept_multiple,
                    accept_presentation_document_targets,
                    accept_line_item,
                    selected_package_version_id,
                    selected_package_version,
                    selected_activity_id,
                    selected_content_path,
                    created_at,
                    expires_at,
                    used_at
                `,
                args: [input.sessionId, input.usedAt],
                camelCase: true,
              },
            );
            const consumed = updated.rows[0];

            if (consumed) {
              return mapDeepLinkingSessionRow(consumed);
            }

            const existing = await transaction.queryObject<
              DeepLinkingSessionRow
            >(
              {
                text: `
                  SELECT
                    session_id,
                    session_token,
                    deployment_record_id,
                    deployment_slug,
                    app_id,
                    user_id,
                    user_role,
                    context_id,
                    context_title,
                    deep_link_return_url,
                    data,
                    placement,
                    accept_types,
                    accept_multiple,
                    accept_presentation_document_targets,
                    accept_line_item,
                    selected_package_version_id,
                    selected_package_version,
                    selected_activity_id,
                    selected_content_path,
                    created_at,
                    expires_at,
                    used_at
                  FROM deep_linking_sessions
                  WHERE session_id = $1
                `,
                args: [input.sessionId],
                camelCase: true,
              },
            );
            const row = existing.rows[0];

            if (!row) {
              throw new Error(
                `Deep Linking session ${input.sessionId} was not found.`,
              );
            }

            if (row.usedAt !== null) {
              throw new Error(
                `Deep Linking session ${input.sessionId} has already been used.`,
              );
            }

            throw new Error(
              `Deep Linking session ${input.sessionId} could not be consumed.`,
            );
          },
        );
      });
    },

    async updateDeepLinkingSessionSelection(input) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<DeepLinkingSessionRow>({
          text: `
            UPDATE deep_linking_sessions
            SET
              selected_package_version_id = $2,
              selected_package_version = $3,
              selected_activity_id = $4,
              selected_content_path = $5
            WHERE session_id = $1
              AND used_at IS NULL
            RETURNING
              session_id,
              session_token,
              deployment_record_id,
              deployment_slug,
              app_id,
              user_id,
              user_role,
              context_id,
              context_title,
              deep_link_return_url,
              data,
              placement,
              accept_types,
              accept_multiple,
              accept_presentation_document_targets,
              accept_line_item,
              selected_package_version_id,
              selected_package_version,
              selected_activity_id,
              selected_content_path,
              created_at,
              expires_at,
              used_at
          `,
          args: [
            input.sessionId,
            input.selection?.packageVersionId ?? null,
            input.selection?.packageVersion ?? null,
            input.selection?.activityId ?? null,
            input.selection?.contentPath ?? null,
          ],
          camelCase: true,
        });
        const updated = result.rows[0];

        if (!updated) {
          const existing = await client.queryObject<DeepLinkingSessionRow>({
            text: `${DEEP_LINKING_SESSION_SELECT} WHERE session_id = $1`,
            args: [input.sessionId],
            camelCase: true,
          });
          const row = existing.rows[0];

          if (!row) {
            throw new Error(
              `Deep Linking session ${input.sessionId} was not found.`,
            );
          }

          if (row.usedAt !== null) {
            throw new Error(
              `Deep Linking session ${input.sessionId} has already been used.`,
            );
          }

          throw new Error(
            `Deep Linking session ${input.sessionId} could not be updated.`,
          );
        }

        return mapDeepLinkingSessionRow(updated);
      });
    },

    async listDeepLinkingResourceOptions(appId) {
      return await withClient(pool, async (client) => {
        const result = await client.queryObject<PackageVersionRow>({
          text: `
            ${PACKAGE_VERSION_SELECT}
            WHERE app_id = $1
              AND install_scope = 'assignment'
              AND approval_status = 'approved'
              AND reviewed_at IS NOT NULL
          `,
          args: [appId],
          camelCase: true,
        });

        return buildDeepLinkingResourceOptions(
          sortPackageVersions(result.rows.map(mapPackageVersionRow)),
        );
      });
    },
  };
}
