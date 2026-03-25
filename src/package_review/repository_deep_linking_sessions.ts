import type { Pool } from '@db/postgres';
import { withClient } from './repository_core.ts';
import { mapPackageVersionRow } from './repository_mappers_package.ts';
import {
  mapDeepLinkingSessionRow,
  mapOptionalDeepLinkingSession,
} from './repository_mappers_sessions.ts';
import {
  DEEP_LINKING_SESSION_SELECT,
  PACKAGE_VERSION_SELECT,
} from './repository_query_fragments.ts';
import type { DeepLinkingSessionRow, PackageVersionRow } from './repository_row_types.ts';
import {
  buildDeepLinkingResourceOptions,
  sortPackageVersions,
} from './repository_resource_options.ts';
import { isUniqueViolation } from './repository_value_support.ts';
import type { PackageReviewRepository } from './repository.ts';

export function createDeepLinkingSessionRepositoryMethods(
  pool: Pool,
): Pick<
  PackageReviewRepository,
  | 'createDeepLinkingSession'
  | 'getDeepLinkingSessionById'
  | 'updateDeepLinkingSessionSelection'
  | 'listDeepLinkingResourceOptions'
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
                expires_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
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
                expires_at
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
              expires_at
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
          throw new Error(`Deep Linking session ${input.sessionId} was not found.`);
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
