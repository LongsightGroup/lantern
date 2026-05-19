import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects, runD1 } from '../db/d1.ts';
import {
  mapAttemptEvidenceArtifactRow,
  mapAuditEventRow,
  mapGradePublicationRow,
  mapLineItemBindingRow,
  mapOptionalAttemptEvidenceArtifact,
  mapOptionalGradePublication,
  mapOptionalLineItemBinding,
} from './repository_mappers_attempts.ts';
import type {
  AttemptEvidenceArtifactRow,
  AuditEventRow,
  GradePublicationRow,
  LineItemBindingRow,
} from './repository_row_types.ts';
import type { PackageReviewRepository } from './repository.ts';

export function createD1GradingRepositoryMethods(
  db: D1Database,
): Pick<
  PackageReviewRepository,
  | 'createAttemptEvidenceArtifact'
  | 'getAttemptEvidenceArtifactById'
  | 'listAttemptEvidenceArtifacts'
  | 'getLineItemBinding'
  | 'saveLineItemBinding'
  | 'getGradePublicationByAttemptId'
  | 'createGradePublication'
  | 'updateGradePublication'
  | 'recordAuditEvent'
  | 'listAuditEventsByAttemptId'
  | 'listAuditEventsByEventType'
> {
  return {
    async createAttemptEvidenceArtifact(input) {
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
          FROM attempt_evidence_artifacts
          WHERE attempt_id = ?
        `,
        [input.attemptId],
      );
      const nextSequence = sequenceRow?.nextSequence ?? 1;

      try {
        await runD1(
          db,
          `
            INSERT INTO attempt_evidence_artifacts (
              artifact_id,
              attempt_id,
              sequence,
              kind,
              content_type,
              file_name,
              storage_key,
              byte_size,
              sha256,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            input.artifactId,
            input.attemptId,
            nextSequence,
            input.kind,
            input.contentType,
            input.fileName,
            input.storageKey,
            input.byteSize,
            input.sha256,
            input.createdAt,
          ],
        );
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          throw new Error(
            `Attempt evidence artifact ${input.artifactId} already exists and cannot be replaced.`,
          );
        }

        throw error;
      }

      return await requireAttemptEvidenceArtifact(db, input.artifactId);
    },

    async getAttemptEvidenceArtifactById(artifactId) {
      const row = await queryD1First<D1AttemptEvidenceArtifactRow>(
        db,
        `${D1_ATTEMPT_EVIDENCE_ARTIFACT_SELECT} WHERE artifact_id = ?`,
        [artifactId],
      );

      return mapOptionalAttemptEvidenceArtifact(
        row === null ? undefined : mapD1AttemptEvidenceArtifactFields(row),
      );
    },

    async listAttemptEvidenceArtifacts(attemptId) {
      const rows = await queryD1Objects<D1AttemptEvidenceArtifactRow>(
        db,
        `
          ${D1_ATTEMPT_EVIDENCE_ARTIFACT_SELECT}
          WHERE attempt_id = ?
          ORDER BY sequence ASC
        `,
        [attemptId],
      );

      return rows.map((row) =>
        mapAttemptEvidenceArtifactRow(mapD1AttemptEvidenceArtifactFields(row))
      );
    },

    async getLineItemBinding(input) {
      const row = await queryD1First<D1LineItemBindingRow>(
        db,
        `
          ${D1_LINE_ITEM_BINDING_SELECT}
          WHERE deployment_record_id = ?
            AND package_version_id = ?
            AND context_id = ?
            AND resource_link_id = ?
            AND activity_id = ?
        `,
        [
          input.deploymentRecordId,
          input.packageVersionId,
          input.contextId,
          input.resourceLinkId,
          input.activityId,
        ],
      );

      return mapOptionalLineItemBinding(row === null ? undefined : mapD1LineItemBindingFields(row));
    },

    async saveLineItemBinding(record) {
      const existing = await this.getLineItemBinding({
        deploymentRecordId: record.deploymentRecordId,
        packageVersionId: record.packageVersionId,
        contextId: record.contextId,
        resourceLinkId: record.resourceLinkId,
        activityId: record.activityId,
      });

      if (existing !== null) {
        return existing;
      }

      try {
        await runD1(
          db,
          `
            INSERT INTO line_item_bindings (
              deployment_record_id,
              package_version_id,
              context_id,
              resource_link_id,
              activity_id,
              line_items_url,
              line_item_url,
              resource_id,
              tag,
              label,
              score_maximum,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            record.deploymentRecordId,
            record.packageVersionId,
            record.contextId,
            record.resourceLinkId,
            record.activityId,
            record.lineItemsUrl,
            record.lineItemUrl,
            record.resourceId,
            record.tag,
            record.label,
            record.scoreMaximum,
            record.createdAt,
            record.updatedAt,
          ],
        );
      } catch (error) {
        if (!isD1UniqueViolation(error)) {
          throw error;
        }

        const concurrent = await queryD1First<D1LineItemBindingRow>(
          db,
          `
            ${D1_LINE_ITEM_BINDING_SELECT}
            WHERE (
              deployment_record_id = ?
              AND package_version_id = ?
              AND context_id = ?
              AND resource_link_id = ?
              AND activity_id = ?
            ) OR line_item_url = ?
            LIMIT 1
          `,
          [
            record.deploymentRecordId,
            record.packageVersionId,
            record.contextId,
            record.resourceLinkId,
            record.activityId,
            record.lineItemUrl,
          ],
        );

        if (concurrent !== null) {
          return mapLineItemBindingRow(mapD1LineItemBindingFields(concurrent));
        }

        throw error;
      }

      return await requireLineItemBindingByUrl(db, record.lineItemUrl);
    },

    async getGradePublicationByAttemptId(attemptId) {
      const row = await queryD1First<D1GradePublicationRow>(
        db,
        `${D1_GRADE_PUBLICATION_SELECT} WHERE attempt_id = ?`,
        [attemptId],
      );

      return mapOptionalGradePublication(
        row === null ? undefined : mapD1GradePublicationFields(row),
      );
    },

    async createGradePublication(record) {
      try {
        await runD1(
          db,
          `
            INSERT INTO grade_publications (
              attempt_id,
              line_item_binding_id,
              line_item_url,
              platform_user_id,
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            record.attemptId,
            record.lineItemBindingId,
            record.lineItemUrl,
            record.platformUserId,
            record.scoreGiven,
            record.scoreMaximum,
            record.activityProgress,
            record.gradingProgress,
            record.status,
            record.createdAt,
            record.updatedAt,
            record.publishedAt,
            record.errorCode,
            record.errorDetail,
          ],
        );
      } catch (error) {
        if (!isD1UniqueViolation(error)) {
          throw error;
        }

        const existing = await this.getGradePublicationByAttemptId(record.attemptId);

        if (existing !== null) {
          return existing;
        }

        throw error;
      }

      return await requireGradePublicationByAttemptId(db, record.attemptId);
    },

    async updateGradePublication(input) {
      await runD1(
        db,
        `
          UPDATE grade_publications
          SET
            status = ?,
            updated_at = ?,
            published_at = ?,
            error_code = ?,
            error_detail = ?
          WHERE attempt_id = ?
        `,
        [
          input.status,
          input.updatedAt,
          input.publishedAt,
          input.errorCode,
          input.errorDetail,
          input.attemptId,
        ],
      );

      return await requireGradePublicationByAttemptId(db, input.attemptId);
    },

    async recordAuditEvent(record) {
      const row = await queryD1First<D1AuditEventRow>(
        db,
        `
          INSERT INTO audit_events (
            event_type,
            actor_type,
            actor_id,
            deployment_record_id,
            package_version_id,
            attempt_id,
            line_item_binding_id,
            status,
            summary,
            detail,
            occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING
            id,
            event_type AS eventType,
            actor_type AS actorType,
            actor_id AS actorId,
            deployment_record_id AS deploymentRecordId,
            package_version_id AS packageVersionId,
            attempt_id AS attemptId,
            line_item_binding_id AS lineItemBindingId,
            status,
            summary,
            detail,
            occurred_at AS occurredAt
        `,
        [
          record.eventType,
          record.actorType,
          record.actorId,
          record.deploymentRecordId,
          record.packageVersionId,
          record.attemptId,
          record.lineItemBindingId,
          record.status,
          record.summary,
          record.detail,
          record.occurredAt,
        ],
      );

      if (row === null) {
        throw new Error('Expected audit event row after D1 insert.');
      }

      return mapAuditEventRow(mapD1AuditEventFields(row));
    },

    async listAuditEventsByAttemptId(attemptId) {
      const rows = await queryD1Objects<D1AuditEventRow>(
        db,
        `
          ${D1_AUDIT_EVENT_SELECT}
          WHERE attempt_id = ?
          ORDER BY occurred_at ASC, id ASC
        `,
        [attemptId],
      );

      return rows.map((row) => mapAuditEventRow(mapD1AuditEventFields(row)));
    },

    async listAuditEventsByEventType(eventType) {
      const rows = await queryD1Objects<D1AuditEventRow>(
        db,
        `
          ${D1_AUDIT_EVENT_SELECT}
          WHERE event_type = ?
          ORDER BY occurred_at ASC, id ASC
        `,
        [eventType],
      );

      return rows.map((row) => mapAuditEventRow(mapD1AuditEventFields(row)));
    },
  };
}

const D1_ATTEMPT_EVIDENCE_ARTIFACT_SELECT = `
  SELECT
    artifact_id AS artifactId,
    attempt_id AS attemptId,
    sequence,
    kind,
    content_type AS contentType,
    file_name AS fileName,
    storage_key AS storageKey,
    byte_size AS byteSize,
    sha256,
    created_at AS createdAt
  FROM attempt_evidence_artifacts
`;

const D1_LINE_ITEM_BINDING_SELECT = `
  SELECT
    id,
    deployment_record_id AS deploymentRecordId,
    package_version_id AS packageVersionId,
    context_id AS contextId,
    resource_link_id AS resourceLinkId,
    activity_id AS activityId,
    line_items_url AS lineItemsUrl,
    line_item_url AS lineItemUrl,
    resource_id AS resourceId,
    tag,
    label,
    score_maximum AS scoreMaximum,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM line_item_bindings
`;

const D1_GRADE_PUBLICATION_SELECT = `
  SELECT
    id,
    attempt_id AS attemptId,
    line_item_binding_id AS lineItemBindingId,
    line_item_url AS lineItemUrl,
    platform_user_id AS platformUserId,
    score_given AS scoreGiven,
    score_maximum AS scoreMaximum,
    activity_progress AS activityProgress,
    grading_progress AS gradingProgress,
    status,
    created_at AS createdAt,
    updated_at AS updatedAt,
    published_at AS publishedAt,
    error_code AS errorCode,
    error_detail AS errorDetail
  FROM grade_publications
`;

const D1_AUDIT_EVENT_SELECT = `
  SELECT
    id,
    event_type AS eventType,
    actor_type AS actorType,
    actor_id AS actorId,
    deployment_record_id AS deploymentRecordId,
    package_version_id AS packageVersionId,
    attempt_id AS attemptId,
    line_item_binding_id AS lineItemBindingId,
    status,
    summary,
    detail,
    occurred_at AS occurredAt
  FROM audit_events
`;

interface D1AttemptEvidenceArtifactRow extends Record<string, unknown> {
  artifactId: unknown;
  attemptId: unknown;
  sequence: unknown;
  kind: unknown;
  contentType: unknown;
  fileName: unknown;
  storageKey: unknown;
  byteSize: unknown;
  sha256: unknown;
  createdAt: unknown;
}

interface D1LineItemBindingRow extends Record<string, unknown> {
  id: unknown;
  deploymentRecordId: unknown;
  packageVersionId: unknown;
  contextId: unknown;
  resourceLinkId: unknown;
  activityId: unknown;
  lineItemsUrl: unknown;
  lineItemUrl: unknown;
  resourceId: unknown;
  tag: unknown;
  label: unknown;
  scoreMaximum: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

interface D1GradePublicationRow extends Record<string, unknown> {
  id: unknown;
  attemptId: unknown;
  lineItemBindingId: unknown;
  lineItemUrl: unknown;
  platformUserId: unknown;
  scoreGiven: unknown;
  scoreMaximum: unknown;
  activityProgress: unknown;
  gradingProgress: unknown;
  status: unknown;
  createdAt: unknown;
  updatedAt: unknown;
  publishedAt: unknown;
  errorCode: unknown;
  errorDetail: unknown;
}

interface D1AuditEventRow extends Record<string, unknown> {
  id: unknown;
  eventType: unknown;
  actorType: unknown;
  actorId: unknown;
  deploymentRecordId: unknown;
  packageVersionId: unknown;
  attemptId: unknown;
  lineItemBindingId: unknown;
  status: unknown;
  summary: unknown;
  detail: unknown;
  occurredAt: unknown;
}

async function requireAttemptEvidenceArtifact(db: D1Database, artifactId: string) {
  const row = await queryD1First<D1AttemptEvidenceArtifactRow>(
    db,
    `${D1_ATTEMPT_EVIDENCE_ARTIFACT_SELECT} WHERE artifact_id = ?`,
    [artifactId],
  );

  if (row === null) {
    throw new Error(`Attempt evidence artifact ${artifactId} was not found.`);
  }

  return mapAttemptEvidenceArtifactRow(mapD1AttemptEvidenceArtifactFields(row));
}

async function requireLineItemBindingByUrl(db: D1Database, lineItemUrl: string) {
  const row = await queryD1First<D1LineItemBindingRow>(
    db,
    `${D1_LINE_ITEM_BINDING_SELECT} WHERE line_item_url = ?`,
    [lineItemUrl],
  );

  if (row === null) {
    throw new Error(`Line item binding ${lineItemUrl} was not found.`);
  }

  return mapLineItemBindingRow(mapD1LineItemBindingFields(row));
}

async function requireGradePublicationByAttemptId(db: D1Database, attemptId: string) {
  const row = await queryD1First<D1GradePublicationRow>(
    db,
    `${D1_GRADE_PUBLICATION_SELECT} WHERE attempt_id = ?`,
    [attemptId],
  );

  if (row === null) {
    throw new Error(`Grade publication for attempt ${attemptId} was not found.`);
  }

  return mapGradePublicationRow(mapD1GradePublicationFields(row));
}

function mapD1AttemptEvidenceArtifactFields(
  row: D1AttemptEvidenceArtifactRow,
): AttemptEvidenceArtifactRow {
  return {
    artifactId: expectString(row.artifactId, 'artifactId'),
    attemptId: expectString(row.attemptId, 'attemptId'),
    sequence: expectNumber(row.sequence, 'sequence'),
    kind: expectStringLiteral(row.kind, 'kind', ['screenshot_png', 'structured_json']),
    contentType: expectString(row.contentType, 'contentType'),
    fileName: expectString(row.fileName, 'fileName'),
    storageKey: expectString(row.storageKey, 'storageKey'),
    byteSize: expectNumber(row.byteSize, 'byteSize'),
    sha256: expectString(row.sha256, 'sha256'),
    createdAt: expectString(row.createdAt, 'createdAt'),
  };
}

function mapD1LineItemBindingFields(row: D1LineItemBindingRow): LineItemBindingRow {
  return {
    id: expectNumber(row.id, 'id'),
    deploymentRecordId: expectNumber(row.deploymentRecordId, 'deploymentRecordId'),
    packageVersionId: expectNumber(row.packageVersionId, 'packageVersionId'),
    contextId: expectString(row.contextId, 'contextId'),
    resourceLinkId: expectString(row.resourceLinkId, 'resourceLinkId'),
    activityId: expectString(row.activityId, 'activityId'),
    lineItemsUrl: expectString(row.lineItemsUrl, 'lineItemsUrl'),
    lineItemUrl: expectString(row.lineItemUrl, 'lineItemUrl'),
    resourceId: expectString(row.resourceId, 'resourceId'),
    tag: expectString(row.tag, 'tag'),
    label: expectString(row.label, 'label'),
    scoreMaximum: expectNumber(row.scoreMaximum, 'scoreMaximum'),
    createdAt: expectString(row.createdAt, 'createdAt'),
    updatedAt: expectString(row.updatedAt, 'updatedAt'),
  };
}

function mapD1GradePublicationFields(row: D1GradePublicationRow): GradePublicationRow {
  return {
    id: expectNumber(row.id, 'id'),
    attemptId: expectString(row.attemptId, 'attemptId'),
    lineItemBindingId: expectNumber(row.lineItemBindingId, 'lineItemBindingId'),
    lineItemUrl: expectString(row.lineItemUrl, 'lineItemUrl'),
    platformUserId: expectString(row.platformUserId, 'platformUserId'),
    scoreGiven: expectNumber(row.scoreGiven, 'scoreGiven'),
    scoreMaximum: expectNumber(row.scoreMaximum, 'scoreMaximum'),
    activityProgress: expectStringLiteral(row.activityProgress, 'activityProgress', [
      'Completed',
      'InProgress',
      'Initialized',
    ]),
    gradingProgress: expectStringLiteral(row.gradingProgress, 'gradingProgress', [
      'Pending',
      'PendingManual',
      'FullyGraded',
      'Failed',
    ]),
    status: expectStringLiteral(row.status, 'status', ['pending', 'published', 'failed']),
    createdAt: expectString(row.createdAt, 'createdAt'),
    updatedAt: expectString(row.updatedAt, 'updatedAt'),
    publishedAt: expectNullableString(row.publishedAt, 'publishedAt'),
    errorCode: expectNullableString(row.errorCode, 'errorCode'),
    errorDetail: parseNullableJsonField(row.errorDetail, 'errorDetail') as
      | Record<
        string,
        unknown
      >
      | null,
  };
}

function mapD1AuditEventFields(row: D1AuditEventRow): AuditEventRow {
  return {
    id: expectNumber(row.id, 'id'),
    eventType: expectString(row.eventType, 'eventType'),
    actorType: expectStringLiteral(row.actorType, 'actorType', ['user', 'system', 'platform']),
    actorId: expectNullableString(row.actorId, 'actorId'),
    deploymentRecordId: expectNullableNumber(row.deploymentRecordId, 'deploymentRecordId'),
    packageVersionId: expectNullableNumber(row.packageVersionId, 'packageVersionId'),
    attemptId: expectNullableString(row.attemptId, 'attemptId'),
    lineItemBindingId: expectNullableNumber(row.lineItemBindingId, 'lineItemBindingId'),
    status: expectStringLiteral(row.status, 'status', ['accepted', 'succeeded', 'failed']),
    summary: expectString(row.summary, 'summary'),
    detail: parseJsonField(row.detail, 'detail') as Record<string, unknown>,
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

function expectNullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  return expectNumber(value, fieldName);
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
