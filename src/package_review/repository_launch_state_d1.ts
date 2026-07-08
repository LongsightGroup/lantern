import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects, runD1, runD1Batch } from '../db/d1.ts';
import {
  type D1AttemptEventRow,
  type D1AttemptRow,
  type D1DynamicRegistrationStateRow,
  type D1RuntimeSessionRow,
  mapD1AttemptEventFields,
  mapD1AttemptFields,
  mapD1DynamicRegistrationStateFields,
  mapD1RuntimeSessionFields,
} from './repository_launch_state_d1_mapping.ts';
import {
  mapAttemptEventRow,
  mapAttemptRow,
  mapOptionalAttempt,
} from './repository_mappers_attempts.ts';
import {
  mapDynamicRegistrationStateRow,
  mapOptionalDynamicRegistrationState,
} from './repository_mappers_package.ts';
import { mapOptionalRuntimeSession, mapRuntimeSessionRow } from './repository_mappers_sessions.ts';
import type { PackageReviewRepository } from './repository.ts';

export function createD1LaunchStateRepositoryMethods(
  db: D1Database,
): Pick<
  PackageReviewRepository,
  | 'createDynamicRegistrationState'
  | 'getDynamicRegistrationStateByState'
  | 'consumeDynamicRegistrationState'
  | 'createRuntimeSession'
  | 'getRuntimeSessionById'
  | 'getLatestRuntimeSessionByDeploymentId'
  | 'createAttempt'
  | 'getAttemptById'
  | 'listAttemptsByApp'
  | 'appendAttemptEvent'
  | 'listAttemptEvents'
  | 'finalizeAttempt'
  | 'writeAttemptLocalState'
> {
  return {
    async createDynamicRegistrationState(record) {
      try {
        await runD1(
          db,
          `
            INSERT INTO dynamic_registration_states (
              state,
              app_id,
              lms_type,
              created_at,
              expires_at,
              used_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            record.state,
            record.appId,
            record.lms,
            record.createdAt,
            record.expiresAt,
            record.usedAt,
          ],
        );
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          throw new Error(
            `Dynamic registration state ${record.state} already exists and cannot be reused.`,
          );
        }

        throw error;
      }

      return await requireDynamicRegistrationState(db, record.state);
    },

    async getDynamicRegistrationStateByState(state) {
      const row = await queryD1First<D1DynamicRegistrationStateRow>(
        db,
        `${D1_DYNAMIC_REGISTRATION_STATE_SELECT} WHERE state = ?`,
        [state],
      );

      return mapOptionalDynamicRegistrationState(
        row === null ? undefined : mapD1DynamicRegistrationStateFields(row),
      );
    },

    async consumeDynamicRegistrationState(input) {
      await runD1(
        db,
        `
          UPDATE dynamic_registration_states
          SET used_at = ?
          WHERE state = ?
            AND used_at IS NULL
        `,
        [input.usedAt, input.state],
      );

      const existing = await requireDynamicRegistrationState(db, input.state);

      if (existing.usedAt === input.usedAt) {
        return existing;
      }

      if (existing.usedAt !== null) {
        throw new Error(`Dynamic registration state ${input.state} has already been used.`);
      }

      throw new Error(`Dynamic registration state ${input.state} could not be consumed.`);
    },

    async createRuntimeSession(record) {
      try {
        await runD1(
          db,
          `
            INSERT INTO runtime_sessions (
              session_id,
              session_token,
              lti_tool_session_id,
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
              preview_session_id,
              created_at,
              expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            record.sessionId,
            record.sessionToken,
            record.ltiToolSessionId,
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
            record.preview?.previewSessionId ?? null,
            record.createdAt,
            record.expiresAt,
          ],
        );
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          throw new Error(
            `Runtime session ${record.sessionId} already exists and cannot be replaced.`,
          );
        }

        throw error;
      }

      return await requireRuntimeSession(db, record.sessionId);
    },

    async getRuntimeSessionById(sessionId) {
      const row = await queryD1First<D1RuntimeSessionRow>(
        db,
        `${D1_RUNTIME_SESSION_SELECT} WHERE session_id = ?`,
        [sessionId],
      );

      return mapOptionalRuntimeSession(row === null ? undefined : mapD1RuntimeSessionFields(row));
    },

    async getLatestRuntimeSessionByDeploymentId(deploymentRecordId) {
      const row = await queryD1First<D1RuntimeSessionRow>(
        db,
        `
          ${D1_RUNTIME_SESSION_SELECT}
          WHERE deployment_record_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [deploymentRecordId],
      );

      return mapOptionalRuntimeSession(row === null ? undefined : mapD1RuntimeSessionFields(row));
    },

    async createAttempt(record) {
      try {
        await runD1(
          db,
          `
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
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
            record.localState,
            record.startedAt,
            record.finalizedAt,
          ],
        );
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          throw new Error(`Attempt ${record.attemptId} already exists and cannot be replaced.`);
        }

        throw error;
      }

      return await requireAttempt(db, record.attemptId);
    },

    async getAttemptById(attemptId) {
      const row = await queryD1First<D1AttemptRow>(
        db,
        `${D1_ATTEMPT_SELECT} WHERE attempt_id = ?`,
        [attemptId],
      );

      return mapOptionalAttempt(row === null ? undefined : mapD1AttemptFields(row));
    },

    async listAttemptsByApp(appId) {
      const rows = await queryD1Objects<D1AttemptRow>(
        db,
        `
          ${D1_ATTEMPT_SELECT}
          LEFT JOIN deployments
            ON deployments.id = attempts.deployment_record_id
          WHERE attempts.app_id = ?
            AND COALESCE(deployments.lms_type, 'canvas') <> 'preview'
          ORDER BY attempts.started_at DESC, attempts.id DESC
        `,
        [appId],
      );

      return rows.map((row) => mapAttemptRow(mapD1AttemptFields(row)));
    },

    async appendAttemptEvent(input) {
      const results = await runD1Batch<D1AttemptEventRow>(
        db,
        [
          {
            sql: `
              INSERT INTO attempt_events (
                attempt_id,
                sequence,
                event_type,
                learning_verb,
                object_id,
                object_type,
                result,
                event,
                received_at
              )
              SELECT
                attempts.attempt_id,
                attempts.next_attempt_event_sequence,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?
              FROM attempts
              WHERE attempts.attempt_id = ?
              RETURNING
                id,
                attempt_id AS attemptId,
                sequence,
                event_type AS eventType,
                learning_verb AS learningVerb,
                object_id AS objectId,
                object_type AS objectType,
                result,
                event,
                received_at AS receivedAt
            `,
            parameters: [
              input.event.type,
              input.normalizedEvent.learningVerb,
              input.normalizedEvent.objectId,
              input.normalizedEvent.objectType,
              input.normalizedEvent.result,
              input.event,
              input.receivedAt,
              input.attemptId,
            ],
          },
          {
            sql: `
              UPDATE attempts
              SET next_attempt_event_sequence = next_attempt_event_sequence + 1
              WHERE attempt_id = ?
            `,
            parameters: [input.attemptId],
          },
        ],
      );
      const row = results[0]?.results?.[0] ?? null;

      if (row === null) {
        throw new Error(`Attempt ${input.attemptId} was not found.`);
      }

      return mapAttemptEventRow(mapD1AttemptEventFields(row));
    },

    async listAttemptEvents(attemptId) {
      const rows = await queryD1Objects<D1AttemptEventRow>(
        db,
        `
          ${D1_ATTEMPT_EVENT_SELECT}
          WHERE attempt_id = ?
          ORDER BY sequence ASC
        `,
        [attemptId],
      );

      return rows.map((row) => mapAttemptEventRow(mapD1AttemptEventFields(row)));
    },

    async writeAttemptLocalState(input) {
      await runD1(
        db,
        `
          UPDATE attempts
          SET local_state = ?
          WHERE attempt_id = ?
        `,
        [input.localState, input.attemptId],
      );

      return await requireAttempt(db, input.attemptId);
    },

    async finalizeAttempt(input) {
      const existing = await requireAttempt(db, input.attemptId);

      if (existing.finalizedAt !== null) {
        return existing;
      }

      await runD1(
        db,
        `
          UPDATE attempts
          SET status = ?,
              completion_state = ?,
              finalized_at = ?
          WHERE attempt_id = ?
        `,
        [input.status, input.completionState, input.finalizedAt, input.attemptId],
      );

      return await requireAttempt(db, input.attemptId);
    },
  };
}

const D1_DYNAMIC_REGISTRATION_STATE_SELECT = `
  SELECT
    state,
    app_id AS appId,
    lms_type AS lmsType,
    created_at AS createdAt,
    expires_at AS expiresAt,
    used_at AS usedAt
  FROM dynamic_registration_states
`;

const D1_RUNTIME_SESSION_SELECT = `
  SELECT
    session_id AS sessionId,
    session_token AS sessionToken,
    lti_tool_session_id AS ltiToolSessionId,
    attempt_id AS attemptId,
    deployment_record_id AS deploymentRecordId,
    deployment_slug AS deploymentSlug,
    app_id AS appId,
    package_version_id AS packageVersionId,
    package_version AS packageVersion,
    capabilities,
    snapshot_root AS snapshotRoot,
    entrypoint_path AS entrypointPath,
    content_path AS contentPath,
    ags_scope AS agsScope,
    ags_lineitems_url AS agsLineitemsUrl,
    ags_lineitem_url AS agsLineitemUrl,
    nrps_context_memberships_url AS nrpsContextMembershipsUrl,
    nrps_service_versions AS nrpsServiceVersions,
    launch_user_role AS launchUserRole,
    launch_course_id AS launchCourseId,
    launch_assignment_id AS launchAssignmentId,
    launch_activity_id AS launchActivityId,
    preview_session_id AS previewSessionId,
    created_at AS createdAt,
    expires_at AS expiresAt
  FROM runtime_sessions
`;

const D1_ATTEMPT_SELECT = `
  SELECT
    attempts.id,
    attempts.attempt_id AS attemptId,
    attempts.deployment_record_id AS deploymentRecordId,
    attempts.deployment_slug AS deploymentSlug,
    attempts.app_id AS appId,
    attempts.package_version_id AS packageVersionId,
    attempts.package_version AS packageVersion,
    attempts.user_id AS userId,
    attempts.user_display_name AS userDisplayName,
    attempts.user_email AS userEmail,
    attempts.user_login AS userLogin,
    attempts.user_role AS userRole,
    attempts.context_id AS contextId,
    attempts.resource_link_id AS resourceLinkId,
    attempts.activity_id AS activityId,
    attempts.status,
    attempts.completion_state AS completionState,
    attempts.local_state AS localState,
    attempts.started_at AS startedAt,
    attempts.finalized_at AS finalizedAt
  FROM attempts
`;

const D1_ATTEMPT_EVENT_SELECT = `
  SELECT
    id,
    attempt_id AS attemptId,
    sequence,
    event_type AS eventType,
    learning_verb AS learningVerb,
    object_id AS objectId,
    object_type AS objectType,
    result,
    event,
    received_at AS receivedAt
  FROM attempt_events
`;

async function requireDynamicRegistrationState(db: D1Database, state: string) {
  const row = await queryD1First<D1DynamicRegistrationStateRow>(
    db,
    `${D1_DYNAMIC_REGISTRATION_STATE_SELECT} WHERE state = ?`,
    [state],
  );

  if (row === null) {
    throw new Error(`Dynamic registration state ${state} was not found.`);
  }

  return mapDynamicRegistrationStateRow(mapD1DynamicRegistrationStateFields(row));
}

async function requireRuntimeSession(db: D1Database, sessionId: string) {
  const row = await queryD1First<D1RuntimeSessionRow>(
    db,
    `${D1_RUNTIME_SESSION_SELECT} WHERE session_id = ?`,
    [sessionId],
  );

  if (row === null) {
    throw new Error(`Runtime session ${sessionId} was not found.`);
  }

  return mapRuntimeSessionRow(mapD1RuntimeSessionFields(row));
}

async function requireAttempt(db: D1Database, attemptId: string) {
  const row = await queryD1First<D1AttemptRow>(db, `${D1_ATTEMPT_SELECT} WHERE attempt_id = ?`, [
    attemptId,
  ]);

  if (row === null) {
    throw new Error(`Attempt ${attemptId} was not found.`);
  }

  return mapAttemptRow(mapD1AttemptFields(row));
}

function isD1UniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}
