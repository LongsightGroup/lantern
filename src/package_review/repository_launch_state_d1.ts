import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects, runD1 } from '../db/d1.ts';
import {
  mapAttemptEventRow,
  mapAttemptRow,
  mapOptionalAttempt,
} from './repository_mappers_attempts.ts';
import { mapLoginStateRow, mapOptionalLoginState } from './repository_mappers_package.ts';
import {
  mapDynamicRegistrationStateRow,
  mapOptionalDynamicRegistrationState,
} from './repository_mappers_package.ts';
import { mapOptionalRuntimeSession, mapRuntimeSessionRow } from './repository_mappers_sessions.ts';
import type {
  AttemptEventRow,
  AttemptRow,
  DynamicRegistrationStateRow,
  LoginStateRow,
  RuntimeSessionRow,
} from './repository_row_types.ts';
import type { PackageReviewRepository } from './repository.ts';

export function createD1LaunchStateRepositoryMethods(
  db: D1Database,
): Pick<
  PackageReviewRepository,
  | 'createLoginState'
  | 'getLoginStateByState'
  | 'consumeLoginState'
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
    async createLoginState(record) {
      try {
        await runD1(
          db,
          `
            INSERT INTO lti_login_states (
              lms_type,
              state,
              canvas_environment,
              issuer,
              client_id,
              deployment_id,
              nonce,
              login_hint,
              target_link_uri,
              lti_message_hint,
              created_at,
              expires_at,
              used_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            record.lms,
            record.state,
            record.canvasEnvironment,
            record.issuer,
            record.clientId,
            record.deploymentId,
            record.nonce,
            record.loginHint,
            record.targetLinkUri,
            record.ltiMessageHint,
            record.createdAt,
            record.expiresAt,
            record.usedAt,
          ],
        );
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          throw new Error(`Login state ${record.state} already exists and cannot be reused.`);
        }

        throw error;
      }

      return await requireLoginState(db, record.state);
    },

    async getLoginStateByState(state) {
      const row = await queryD1First<D1LoginStateRow>(
        db,
        `${D1_LOGIN_STATE_SELECT} WHERE state = ?`,
        [state],
      );

      return mapOptionalLoginState(row === null ? undefined : mapD1LoginStateFields(row));
    },

    async consumeLoginState(input) {
      await runD1(
        db,
        `
          UPDATE lti_login_states
          SET used_at = ?
          WHERE state = ?
            AND used_at IS NULL
        `,
        [input.usedAt, input.state],
      );

      const existing = await requireLoginState(db, input.state);

      if (existing.usedAt === input.usedAt) {
        return existing;
      }

      if (existing.usedAt !== null) {
        throw new Error(`Login state ${input.state} has already been used.`);
      }

      throw new Error(`Login state ${input.state} could not be consumed.`);
    },

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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
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
      const attempt = await queryD1First<{ attemptId: string }>(
        db,
        `
          SELECT attempt_id AS attemptId
          FROM attempts
          WHERE attempt_id = ?
        `,
        [input.attemptId],
      );

      if (attempt === null) {
        throw new Error(`Attempt ${input.attemptId} was not found.`);
      }

      const sequenceRow = await queryD1First<{ nextSequence: number }>(
        db,
        `
          SELECT COALESCE(MAX(sequence), 0) + 1 AS nextSequence
          FROM attempt_events
          WHERE attempt_id = ?
        `,
        [input.attemptId],
      );
      const nextSequence = sequenceRow?.nextSequence ?? 1;

      await runD1(
        db,
        `
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          input.attemptId,
          nextSequence,
          input.event.type,
          input.normalizedEvent.learningVerb,
          input.normalizedEvent.objectId,
          input.normalizedEvent.objectType,
          input.normalizedEvent.result,
          input.event,
          input.receivedAt,
        ],
      );

      return await requireAttemptEvent(db, input.attemptId, nextSequence);
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

const D1_LOGIN_STATE_SELECT = `
  SELECT
    lms_type AS lmsType,
    state,
    canvas_environment AS canvasEnvironment,
    issuer,
    client_id AS clientId,
    deployment_id AS deploymentId,
    nonce,
    login_hint AS loginHint,
    target_link_uri AS targetLinkUri,
    lti_message_hint AS ltiMessageHint,
    created_at AS createdAt,
    expires_at AS expiresAt,
    used_at AS usedAt
  FROM lti_login_states
`;

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

interface D1LoginStateRow extends Record<string, unknown> {
  lmsType: unknown;
  state: unknown;
  canvasEnvironment: unknown;
  issuer: unknown;
  clientId: unknown;
  deploymentId: unknown;
  nonce: unknown;
  loginHint: unknown;
  targetLinkUri: unknown;
  ltiMessageHint: unknown;
  createdAt: unknown;
  expiresAt: unknown;
  usedAt: unknown;
}

interface D1DynamicRegistrationStateRow extends Record<string, unknown> {
  state: unknown;
  appId: unknown;
  lmsType: unknown;
  createdAt: unknown;
  expiresAt: unknown;
  usedAt: unknown;
}

interface D1RuntimeSessionRow extends Record<string, unknown> {
  sessionId: unknown;
  sessionToken: unknown;
  attemptId: unknown;
  deploymentRecordId: unknown;
  deploymentSlug: unknown;
  appId: unknown;
  packageVersionId: unknown;
  packageVersion: unknown;
  capabilities: unknown;
  snapshotRoot: unknown;
  entrypointPath: unknown;
  contentPath: unknown;
  agsScope: unknown;
  agsLineitemsUrl: unknown;
  agsLineitemUrl: unknown;
  nrpsContextMembershipsUrl: unknown;
  nrpsServiceVersions: unknown;
  launchUserRole: unknown;
  launchCourseId: unknown;
  launchAssignmentId: unknown;
  launchActivityId: unknown;
  previewSessionId: unknown;
  createdAt: unknown;
  expiresAt: unknown;
}

interface D1AttemptRow extends Record<string, unknown> {
  id: unknown;
  attemptId: unknown;
  deploymentRecordId: unknown;
  deploymentSlug: unknown;
  appId: unknown;
  packageVersionId: unknown;
  packageVersion: unknown;
  userId: unknown;
  userDisplayName: unknown;
  userEmail: unknown;
  userLogin: unknown;
  userRole: unknown;
  contextId: unknown;
  resourceLinkId: unknown;
  activityId: unknown;
  status: unknown;
  completionState: unknown;
  localState: unknown;
  startedAt: unknown;
  finalizedAt: unknown;
}

interface D1AttemptEventRow extends Record<string, unknown> {
  id: unknown;
  attemptId: unknown;
  sequence: unknown;
  eventType: unknown;
  learningVerb: unknown;
  objectId: unknown;
  objectType: unknown;
  result: unknown;
  event: unknown;
  receivedAt: unknown;
}

async function requireLoginState(db: D1Database, state: string) {
  const row = await queryD1First<D1LoginStateRow>(db, `${D1_LOGIN_STATE_SELECT} WHERE state = ?`, [
    state,
  ]);

  if (row === null) {
    throw new Error(`Login state ${state} was not found.`);
  }

  return mapLoginStateRow(mapD1LoginStateFields(row));
}

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

async function requireAttemptEvent(db: D1Database, attemptId: string, sequence: number) {
  const row = await queryD1First<D1AttemptEventRow>(
    db,
    `
      ${D1_ATTEMPT_EVENT_SELECT}
      WHERE attempt_id = ?
        AND sequence = ?
    `,
    [attemptId, sequence],
  );

  if (row === null) {
    throw new Error(`Attempt event ${attemptId}#${sequence} was not found.`);
  }

  return mapAttemptEventRow(mapD1AttemptEventFields(row));
}

function mapD1LoginStateFields(row: D1LoginStateRow): LoginStateRow {
  return {
    lmsType: expectStringLiteral(row.lmsType, 'lmsType', ['canvas', 'moodle', 'sakai']),
    state: expectString(row.state, 'state'),
    canvasEnvironment: expectNullableStringLiteral(row.canvasEnvironment, 'canvasEnvironment', [
      'production',
      'beta',
      'test',
    ]),
    issuer: expectString(row.issuer, 'issuer'),
    clientId: expectString(row.clientId, 'clientId'),
    deploymentId: expectString(row.deploymentId, 'deploymentId'),
    nonce: expectString(row.nonce, 'nonce'),
    loginHint: expectString(row.loginHint, 'loginHint'),
    targetLinkUri: expectString(row.targetLinkUri, 'targetLinkUri'),
    ltiMessageHint: expectNullableString(row.ltiMessageHint, 'ltiMessageHint'),
    createdAt: expectString(row.createdAt, 'createdAt'),
    expiresAt: expectString(row.expiresAt, 'expiresAt'),
    usedAt: expectNullableString(row.usedAt, 'usedAt'),
  };
}

function mapD1DynamicRegistrationStateFields(
  row: D1DynamicRegistrationStateRow,
): DynamicRegistrationStateRow {
  return {
    state: expectString(row.state, 'state'),
    appId: expectString(row.appId, 'appId'),
    lmsType: expectStringLiteral(row.lmsType, 'lmsType', ['canvas', 'moodle', 'sakai']),
    createdAt: expectString(row.createdAt, 'createdAt'),
    expiresAt: expectString(row.expiresAt, 'expiresAt'),
    usedAt: expectNullableString(row.usedAt, 'usedAt'),
  };
}

function mapD1RuntimeSessionFields(row: D1RuntimeSessionRow): RuntimeSessionRow {
  return {
    sessionId: expectString(row.sessionId, 'sessionId'),
    sessionToken: expectString(row.sessionToken, 'sessionToken'),
    attemptId: expectNullableString(row.attemptId, 'attemptId'),
    deploymentRecordId: expectNumber(row.deploymentRecordId, 'deploymentRecordId'),
    deploymentSlug: expectString(row.deploymentSlug, 'deploymentSlug'),
    appId: expectString(row.appId, 'appId'),
    packageVersionId: expectNumber(row.packageVersionId, 'packageVersionId'),
    packageVersion: expectString(row.packageVersion, 'packageVersion'),
    capabilities: parseJsonField(
      row.capabilities,
      'capabilities',
    ) as RuntimeSessionRow['capabilities'],
    snapshotRoot: expectString(row.snapshotRoot, 'snapshotRoot'),
    entrypointPath: expectString(row.entrypointPath, 'entrypointPath'),
    contentPath: expectString(row.contentPath, 'contentPath'),
    agsScope: parseJsonField(row.agsScope, 'agsScope') as RuntimeSessionRow['agsScope'],
    agsLineitemsUrl: expectNullableString(row.agsLineitemsUrl, 'agsLineitemsUrl'),
    agsLineitemUrl: expectNullableString(row.agsLineitemUrl, 'agsLineitemUrl'),
    nrpsContextMembershipsUrl: expectNullableString(
      row.nrpsContextMembershipsUrl,
      'nrpsContextMembershipsUrl',
    ),
    nrpsServiceVersions: parseJsonField(
      row.nrpsServiceVersions,
      'nrpsServiceVersions',
    ) as RuntimeSessionRow['nrpsServiceVersions'],
    launchUserRole: expectStringLiteral(row.launchUserRole, 'launchUserRole', [
      'learner',
      'instructor',
    ]),
    launchCourseId: expectString(row.launchCourseId, 'launchCourseId'),
    launchAssignmentId: expectNullableString(row.launchAssignmentId, 'launchAssignmentId'),
    launchActivityId: expectString(row.launchActivityId, 'launchActivityId'),
    previewSessionId: expectNullableString(row.previewSessionId, 'previewSessionId'),
    createdAt: expectString(row.createdAt, 'createdAt'),
    expiresAt: expectString(row.expiresAt, 'expiresAt'),
  };
}

function mapD1AttemptFields(row: D1AttemptRow): AttemptRow {
  return {
    id: expectNumber(row.id, 'id'),
    attemptId: expectString(row.attemptId, 'attemptId'),
    deploymentRecordId: expectNumber(row.deploymentRecordId, 'deploymentRecordId'),
    deploymentSlug: expectString(row.deploymentSlug, 'deploymentSlug'),
    appId: expectString(row.appId, 'appId'),
    packageVersionId: expectNumber(row.packageVersionId, 'packageVersionId'),
    packageVersion: expectString(row.packageVersion, 'packageVersion'),
    userId: expectString(row.userId, 'userId'),
    userDisplayName: expectNullableString(row.userDisplayName, 'userDisplayName'),
    userEmail: expectNullableString(row.userEmail, 'userEmail'),
    userLogin: expectNullableString(row.userLogin, 'userLogin'),
    userRole: expectStringLiteral(row.userRole, 'userRole', ['learner', 'instructor']),
    contextId: expectString(row.contextId, 'contextId'),
    resourceLinkId: expectString(row.resourceLinkId, 'resourceLinkId'),
    activityId: expectString(row.activityId, 'activityId'),
    status: expectStringLiteral(row.status, 'status', ['in_progress', 'completed', 'abandoned']),
    completionState: expectNullableStringLiteral(row.completionState, 'completionState', [
      'completed',
      'abandoned',
    ]),
    localState: parseNullableJsonField(row.localState, 'localState') as AttemptRow['localState'],
    startedAt: expectString(row.startedAt, 'startedAt'),
    finalizedAt: expectNullableString(row.finalizedAt, 'finalizedAt'),
  };
}

function mapD1AttemptEventFields(row: D1AttemptEventRow): AttemptEventRow {
  return {
    id: expectNumber(row.id, 'id'),
    attemptId: expectString(row.attemptId, 'attemptId'),
    sequence: expectNumber(row.sequence, 'sequence'),
    eventType: expectString(row.eventType, 'eventType') as AttemptEventRow['eventType'],
    learningVerb: expectStringLiteral(row.learningVerb, 'learningVerb', [
      'answered',
      'progressed',
      'completed',
    ]),
    objectId: expectString(row.objectId, 'objectId'),
    objectType: expectStringLiteral(row.objectType, 'objectType', [
      'question',
      'checkpoint',
      'activity',
    ]),
    result: parseJsonField(row.result, 'result') as AttemptEventRow['result'],
    event: parseJsonField(row.event, 'event') as AttemptEventRow['event'],
    receivedAt: expectString(row.receivedAt, 'receivedAt'),
  };
}

function isD1UniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

function parseJsonField(value: unknown, fieldName: string): unknown {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected D1 ${fieldName} to be JSON text.`);
  }

  return JSON.parse(value);
}

function parseNullableJsonField(value: unknown, fieldName: string): unknown | null {
  if (value === null) {
    return null;
  }

  return parseJsonField(value, fieldName);
}

function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected D1 ${fieldName} to be text.`);
  }

  return value;
}

function expectNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  return expectString(value, fieldName);
}

function expectNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number') {
    throw new TypeError(`Expected D1 ${fieldName} to be numeric.`);
  }

  return value;
}

function expectStringLiteral<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`Unexpected D1 ${fieldName} value.`);
  }

  return value as T;
}

function expectNullableStringLiteral<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T | null {
  if (value === null) {
    return null;
  }

  return expectStringLiteral(value, fieldName, allowed);
}
