import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects, runD1 } from '../db/d1.ts';
import {
  mapOptionalPreviewSession,
  mapPreviewEvidenceRow,
  mapPreviewSessionRow,
} from './repository_mappers_review.ts';
import type { PreviewEvidenceRow, PreviewSessionRow } from './repository_row_types.ts';
import type { PackageReviewRepository } from './repository.ts';

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
              deep_linking_session_id,
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            record.sessionId,
            record.packageVersionId,
            record.appId,
            record.packageVersion,
            record.packageTitle,
            record.origin,
            record.contentPath,
            record.deepLinkingSessionId,
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
      const session = await queryD1First<{ sessionId: string }>(
        db,
        `
          SELECT session_id AS sessionId
          FROM preview_sessions
          WHERE session_id = ?
        `,
        [input.previewSessionId],
      );

      if (session === null) {
        throw new Error(`Preview session ${input.previewSessionId} was not found.`);
      }

      const sequenceRow = await queryD1First<{ nextSequence: number }>(
        db,
        `
          SELECT COALESCE(MAX(sequence), 0) + 1 AS nextSequence
          FROM preview_evidence
          WHERE preview_session_id = ?
        `,
        [input.previewSessionId],
      );
      const nextSequence = sequenceRow?.nextSequence ?? 1;

      await runD1(
        db,
        `
          INSERT INTO preview_evidence (
            preview_session_id,
            sequence,
            event_type,
            capability,
            summary,
            detail,
            occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          input.previewSessionId,
          nextSequence,
          input.eventType,
          input.capability,
          input.summary,
          input.detail,
          input.occurredAt,
        ],
      );

      return await requirePreviewEvidence(db, input.previewSessionId, nextSequence);
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
    deep_linking_session_id AS deepLinkingSessionId,
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
  deepLinkingSessionId: unknown;
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

async function requirePreviewEvidence(db: D1Database, previewSessionId: string, sequence: number) {
  const row = await queryD1First<D1PreviewEvidenceRow>(
    db,
    `
      ${D1_PREVIEW_EVIDENCE_SELECT}
      WHERE preview_session_id = ?
        AND sequence = ?
    `,
    [previewSessionId, sequence],
  );

  if (row === null) {
    throw new Error(`Preview evidence ${previewSessionId}#${sequence} was not found.`);
  }

  return mapPreviewEvidenceRow(mapD1PreviewEvidenceFields(row));
}

function mapD1PreviewSessionFields(row: D1PreviewSessionRow): PreviewSessionRow {
  return {
    sessionId: expectString(row.sessionId, 'sessionId'),
    packageVersionId: expectNumber(row.packageVersionId, 'packageVersionId'),
    appId: expectString(row.appId, 'appId'),
    packageVersion: expectString(row.packageVersion, 'packageVersion'),
    packageTitle: expectString(row.packageTitle, 'packageTitle'),
    origin: expectStringLiteral(row.origin, 'origin', [
      'adminTestLaunch',
      'deepLinkingAuthoring',
      'adminAuthoringDraft',
    ]),
    contentPath: expectString(row.contentPath, 'contentPath'),
    deepLinkingSessionId: expectNullableString(row.deepLinkingSessionId, 'deepLinkingSessionId'),
    capabilities: parseJsonField(
      row.capabilities,
      'capabilities',
    ) as PreviewSessionRow['capabilities'],
    snapshotRoot: expectString(row.snapshotRoot, 'snapshotRoot'),
    entrypointPath: expectString(row.entrypointPath, 'entrypointPath'),
    launchUserId: expectString(row.launchUserId, 'launchUserId'),
    launchUserRole: expectStringLiteral(row.launchUserRole, 'launchUserRole', [
      'learner',
      'instructor',
    ]),
    launchCourseId: expectString(row.launchCourseId, 'launchCourseId'),
    launchAssignmentId: expectNullableString(row.launchAssignmentId, 'launchAssignmentId'),
    launchActivityId: expectString(row.launchActivityId, 'launchActivityId'),
    fakeAttemptId: expectString(row.fakeAttemptId, 'fakeAttemptId'),
    fakeScoreMaximum: expectNumber(row.fakeScoreMaximum, 'fakeScoreMaximum'),
    fixtureData: parseJsonField(row.fixtureData, 'fixtureData') as PreviewSessionRow['fixtureData'],
    createdAt: expectString(row.createdAt, 'createdAt'),
  };
}

function mapD1PreviewEvidenceFields(row: D1PreviewEvidenceRow): PreviewEvidenceRow {
  return {
    id: expectNumber(row.id, 'id'),
    previewSessionId: expectString(row.previewSessionId, 'previewSessionId'),
    sequence: expectNumber(row.sequence, 'sequence'),
    eventType: expectString(row.eventType, 'eventType'),
    capability: expectNullableString(
      row.capability,
      'capability',
    ) as PreviewEvidenceRow['capability'],
    summary: expectString(row.summary, 'summary'),
    detail: parseJsonField(row.detail, 'detail') as PreviewEvidenceRow['detail'],
    occurredAt: expectString(row.occurredAt, 'occurredAt'),
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
