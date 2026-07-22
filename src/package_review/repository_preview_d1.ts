import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects, runD1, runD1Batch } from '../db/d1.ts';
import {
  expectD1JsonRecord,
  expectD1NullableString,
  expectD1Number,
  expectD1String,
  expectD1StringArray,
  expectD1StringLiteral,
  parseD1JsonField,
} from '../db/d1_row.ts';
import type { Capability } from '../../sdk/app-sdk.ts';
import {
  mapOptionalPreviewSession,
  mapPreviewEvidenceRow,
  mapPreviewSessionRow,
} from './repository_mappers_review.ts';
import type { PreviewEvidenceRow, PreviewSessionRow } from './repository_row_types.ts';
import type { PackageReviewRepository } from './repository.ts';
import type { PreviewFixtureData } from './types.ts';

export function createD1PreviewRepositoryMethods(
  db: D1Database,
): Pick<
  PackageReviewRepository,
  | 'createPreviewSession'
  | 'getPreviewSessionById'
  | 'getLatestPreviewSessionByPackageVersion'
  | 'appendPreviewEvidence'
  | 'listPreviewEvidence'
> {
  return {
    async createPreviewSession(record) {
      const packageVersion = await queryD1First<{ id: number }>(
        db,
        `
          SELECT id
          FROM package_versions
          WHERE id = ?
        `,
        [record.packageVersionId],
      );

      if (packageVersion === null) {
        throw new Error(`Package version id ${record.packageVersionId} was not found.`);
      }

      try {
        await runD1(
          db,
          `
            INSERT INTO preview_sessions (
              session_id,
              package_version_id,
              app_id,
              package_version,
              package_title,
              origin,
              content_path,
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            record.sessionId,
            record.packageVersionId,
            record.appId,
            record.packageVersion,
            record.packageTitle,
            record.origin,
            record.contentPath,
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
            record.fixtureData,
            record.createdAt,
          ],
        );
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          throw new Error(
            `Preview session ${record.sessionId} already exists and cannot be replaced.`,
          );
        }

        throw error;
      }

      return await requirePreviewSession(db, record.sessionId);
    },

    async getPreviewSessionById(sessionId) {
      const row = await queryD1First<D1PreviewSessionRow>(
        db,
        `${D1_PREVIEW_SESSION_SELECT} WHERE session_id = ?`,
        [sessionId],
      );

      return mapOptionalPreviewSession(row === null ? undefined : mapD1PreviewSessionFields(row));
    },

    async getLatestPreviewSessionByPackageVersion(packageVersionId, origin) {
      const row = await queryD1First<D1PreviewSessionRow>(
        db,
        `
          ${D1_PREVIEW_SESSION_SELECT}
          WHERE package_version_id = ?
          ${origin === undefined ? '' : 'AND origin = ?'}
          ORDER BY created_at DESC
          LIMIT 1
        `,
        origin === undefined ? [packageVersionId] : [packageVersionId, origin],
      );

      return mapOptionalPreviewSession(row === null ? undefined : mapD1PreviewSessionFields(row));
    },

    async appendPreviewEvidence(input) {
      const results = await runD1Batch<D1PreviewEvidenceRow>(
        db,
        [
          {
            sql: `
              INSERT INTO preview_evidence (
                preview_session_id,
                sequence,
                event_type,
                capability,
                summary,
                detail,
                occurred_at
              )
              SELECT
                preview_sessions.session_id,
                preview_sessions.next_evidence_sequence,
                ?,
                ?,
                ?,
                ?,
                ?
              FROM preview_sessions
              WHERE preview_sessions.session_id = ?
              RETURNING
                id,
                preview_session_id AS previewSessionId,
                sequence,
                event_type AS eventType,
                capability,
                summary,
                detail,
                occurred_at AS occurredAt
            `,
            parameters: [
              input.eventType,
              input.capability,
              input.summary,
              input.detail,
              input.occurredAt,
              input.previewSessionId,
            ],
          },
          {
            sql: `
              UPDATE preview_sessions
              SET next_evidence_sequence = next_evidence_sequence + 1
              WHERE session_id = ?
            `,
            parameters: [input.previewSessionId],
          },
        ],
      );
      const row = results[0]?.results?.[0] ?? null;

      if (row === null) {
        throw new Error(`Preview session ${input.previewSessionId} was not found.`);
      }

      return mapPreviewEvidenceRow(mapD1PreviewEvidenceFields(row));
    },

    async listPreviewEvidence(previewSessionId) {
      const rows = await queryD1Objects<D1PreviewEvidenceRow>(
        db,
        `
          ${D1_PREVIEW_EVIDENCE_SELECT}
          WHERE preview_session_id = ?
          ORDER BY sequence ASC
        `,
        [previewSessionId],
      );

      return rows.map((row) => mapPreviewEvidenceRow(mapD1PreviewEvidenceFields(row)));
    },
  };
}

const D1_PREVIEW_SESSION_SELECT = `
  SELECT
    session_id AS sessionId,
    package_version_id AS packageVersionId,
    app_id AS appId,
    package_version AS packageVersion,
    package_title AS packageTitle,
    origin,
    content_path AS contentPath,
    capabilities,
    snapshot_root AS snapshotRoot,
    entrypoint_path AS entrypointPath,
    launch_user_id AS launchUserId,
    launch_user_role AS launchUserRole,
    launch_course_id AS launchCourseId,
    launch_assignment_id AS launchAssignmentId,
    launch_activity_id AS launchActivityId,
    fake_attempt_id AS fakeAttemptId,
    fake_score_maximum AS fakeScoreMaximum,
    fixture_data AS fixtureData,
    created_at AS createdAt
  FROM preview_sessions
`;

const D1_PREVIEW_EVIDENCE_SELECT = `
  SELECT
    id,
    preview_session_id AS previewSessionId,
    sequence,
    event_type AS eventType,
    capability,
    summary,
    detail,
    occurred_at AS occurredAt
  FROM preview_evidence
`;

interface D1PreviewSessionRow extends Record<string, unknown> {
  sessionId: unknown;
  packageVersionId: unknown;
  appId: unknown;
  packageVersion: unknown;
  packageTitle: unknown;
  origin: unknown;
  contentPath: unknown;
  capabilities: unknown;
  snapshotRoot: unknown;
  entrypointPath: unknown;
  launchUserId: unknown;
  launchUserRole: unknown;
  launchCourseId: unknown;
  launchAssignmentId: unknown;
  launchActivityId: unknown;
  fakeAttemptId: unknown;
  fakeScoreMaximum: unknown;
  fixtureData: unknown;
  createdAt: unknown;
}

interface D1PreviewEvidenceRow extends Record<string, unknown> {
  id: unknown;
  previewSessionId: unknown;
  sequence: unknown;
  eventType: unknown;
  capability: unknown;
  summary: unknown;
  detail: unknown;
  occurredAt: unknown;
}

async function requirePreviewSession(db: D1Database, sessionId: string) {
  const row = await queryD1First<D1PreviewSessionRow>(
    db,
    `${D1_PREVIEW_SESSION_SELECT} WHERE session_id = ?`,
    [sessionId],
  );

  if (row === null) {
    throw new Error(`Preview session ${sessionId} was not found.`);
  }

  return mapPreviewSessionRow(mapD1PreviewSessionFields(row));
}

function mapD1PreviewSessionFields(row: D1PreviewSessionRow): PreviewSessionRow {
  return {
    sessionId: expectD1String(row.sessionId, 'sessionId'),
    packageVersionId: expectD1Number(row.packageVersionId, 'packageVersionId'),
    appId: expectD1String(row.appId, 'appId'),
    packageVersion: expectD1String(row.packageVersion, 'packageVersion'),
    packageTitle: expectD1String(row.packageTitle, 'packageTitle'),
    origin: expectD1StringLiteral(row.origin, 'origin', [
      'adminTestLaunch',
      'adminAuthoringDraft',
    ]),
    contentPath: expectD1String(row.contentPath, 'contentPath'),
    capabilities: parseD1JsonField(
      row.capabilities,
      'capabilities',
      parseCapabilityArray,
    ),
    snapshotRoot: expectD1String(row.snapshotRoot, 'snapshotRoot'),
    entrypointPath: expectD1String(row.entrypointPath, 'entrypointPath'),
    launchUserId: expectD1String(row.launchUserId, 'launchUserId'),
    launchUserRole: expectD1StringLiteral(row.launchUserRole, 'launchUserRole', [
      'learner',
      'instructor',
    ]),
    launchCourseId: expectD1String(row.launchCourseId, 'launchCourseId'),
    launchAssignmentId: expectD1NullableString(row.launchAssignmentId, 'launchAssignmentId'),
    launchActivityId: expectD1String(row.launchActivityId, 'launchActivityId'),
    fakeAttemptId: expectD1String(row.fakeAttemptId, 'fakeAttemptId'),
    fakeScoreMaximum: expectD1Number(row.fakeScoreMaximum, 'fakeScoreMaximum'),
    fixtureData: parseD1JsonField(row.fixtureData, 'fixtureData', parsePreviewFixtureData),
    createdAt: expectD1String(row.createdAt, 'createdAt'),
  };
}

function mapD1PreviewEvidenceFields(row: D1PreviewEvidenceRow): PreviewEvidenceRow {
  return {
    id: expectD1Number(row.id, 'id'),
    previewSessionId: expectD1String(row.previewSessionId, 'previewSessionId'),
    sequence: expectD1Number(row.sequence, 'sequence'),
    eventType: expectD1String(row.eventType, 'eventType'),
    capability: parseNullableCapability(row.capability, 'capability'),
    summary: expectD1String(row.summary, 'summary'),
    detail: parseD1JsonField(row.detail, 'detail', expectD1JsonRecord),
    occurredAt: expectD1String(row.occurredAt, 'occurredAt'),
  };
}

function isD1UniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

function parseCapabilityArray(value: unknown, fieldName: string): Capability[] {
  return expectD1StringArray(value, fieldName).map((capability, index) =>
    expectD1StringLiteral(capability, `${fieldName}[${index}]`, [
      'read_launch_context',
      'read_activity_content',
      'submit_attempt_event',
      'submit_evidence_artifact',
      'finalize_attempt',
      'read_local_state',
      'write_local_state',
    ])
  );
}

function parseNullableCapability(value: unknown, fieldName: string): Capability | null {
  if (value === null) {
    return null;
  }

  return expectD1StringLiteral(
    value,
    fieldName,
    [
      'read_launch_context',
      'read_activity_content',
      'submit_attempt_event',
      'submit_evidence_artifact',
      'finalize_attempt',
      'read_local_state',
      'write_local_state',
    ] as const,
  );
}

function parsePreviewFixtureData(value: unknown, fieldName: string): PreviewFixtureData {
  const record = expectD1JsonRecord(value, fieldName);
  const launch = expectD1JsonRecord(record.launch, `${fieldName}.launch`);

  return {
    launch: {
      user_role: expectD1StringLiteral(launch.user_role, `${fieldName}.launch.user_role`, [
        'learner',
        'instructor',
      ]),
      course_id: expectD1String(launch.course_id, `${fieldName}.launch.course_id`),
      assignment_id: expectD1NullableString(
        launch.assignment_id,
        `${fieldName}.launch.assignment_id`,
      ),
      activity_id: expectD1String(launch.activity_id, `${fieldName}.launch.activity_id`),
    },
    attempt_id: expectD1String(record.attempt_id, `${fieldName}.attempt_id`),
    local_state: record.local_state === null
      ? null
      : expectD1JsonRecord(record.local_state, `${fieldName}.local_state`),
  };
}
