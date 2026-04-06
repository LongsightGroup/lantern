import type { Pool } from '@db/postgres';
import { withClient } from './repository_core.ts';
import { mapRuntimeSessionRow } from './repository_mappers_sessions.ts';
import type { RuntimeSessionRow } from './repository_row_types.ts';
import { isUniqueViolation } from './repository_value_support.ts';
import type { PackageReviewRepository } from './repository.ts';

export function createRuntimeSessionRepositoryMethods(
  pool: Pool,
): Pick<PackageReviewRepository, 'createRuntimeSession'> {
  return {
    async createRuntimeSession(record) {
      return await withClient(pool, async (client) => {
        try {
          const result = await client.queryObject<RuntimeSessionRow>({
            text: `
              INSERT INTO runtime_sessions (
                session_id,
                session_token,
                attempt_id,
                deployment_record_id,
                deployment_slug,
                app_id,
                package_version_id,
                package_version,
                capabilities,
                snapshot_root,
                entrypoint_path,
                content_path,
                ags_scope,
                ags_lineitems_url,
                ags_lineitem_url,
                nrps_context_memberships_url,
                nrps_service_versions,
                launch_user_role,
                launch_course_id,
                launch_assignment_id,
                launch_activity_id,
                created_at,
                expires_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14, $15, $16,
                $17, $18, $19, $20, $21, $22, $23
              )
              RETURNING
                session_id,
                session_token,
                attempt_id,
                deployment_record_id,
                deployment_slug,
                app_id,
                package_version_id,
                package_version,
                capabilities,
                snapshot_root,
                entrypoint_path,
                content_path,
                ags_scope,
                ags_lineitems_url,
                ags_lineitem_url,
                nrps_context_memberships_url,
                nrps_service_versions,
                launch_user_role,
                launch_course_id,
                launch_assignment_id,
                launch_activity_id,
                created_at,
                expires_at
            `,
            args: [
              record.sessionId,
              record.sessionToken,
              record.attemptId,
              record.deploymentRecordId,
              record.deploymentSlug,
              record.appId,
              record.packageVersionId,
              record.packageVersion,
              record.capabilities,
              record.snapshotRoot,
              record.entrypointPath,
              record.contentPath,
              record.services.ags?.scope ?? [],
              record.services.ags?.lineitemsUrl ?? null,
              record.services.ags?.lineitemUrl ?? null,
              record.services.nrps?.contextMembershipsUrl ?? null,
              record.services.nrps?.serviceVersions ?? [],
              record.launch.userRole,
              record.launch.courseId,
              record.launch.assignmentId ?? null,
              record.launch.activityId,
              record.createdAt,
              record.expiresAt,
            ],
            camelCase: true,
          });

          return mapRuntimeSessionRow(result.rows[0]);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new Error(
              `Runtime session ${record.sessionId} already exists and cannot be replaced.`,
            );
          }

          throw error;
        }
      });
    },
  };
}
