import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects, runD1, runD1Batch } from '../db/d1.ts';
import {
  mapAttemptEvidenceArtifactRow,
  mapAuditEventRow,
  mapGradePublicationRow,
  mapLineItemBindingRow,
  mapOptionalAttemptEvidenceArtifact,
  mapOptionalGradePublication,
  mapOptionalLineItemBinding,
} from './repository_mappers_attempts.ts';
import {
  type D1AttemptEvidenceArtifactRow,
  type D1AuditEventRow,
  type D1GradePublicationRow,
  type D1LineItemBindingRow,
  mapD1AttemptEvidenceArtifactRow,
  mapD1AuditEventFields,
  mapD1GradePublicationFields,
  mapD1LineItemBindingFields,
} from './repository_grading_d1_mapping.ts';
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
      try {
        const results = await runD1Batch<D1AttemptEvidenceArtifactRow>(
          db,
          [
            {
              sql: `
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
                )
                SELECT
                  ?,
                  attempts.attempt_id,
                  attempts.next_evidence_artifact_sequence,
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
              `,
              parameters: [
                input.artifactId,
                input.kind,
                input.contentType,
                input.fileName,
                input.storageKey,
                input.byteSize,
                input.sha256,
                input.createdAt,
                input.attemptId,
              ],
            },
            {
              sql: `
                UPDATE attempts
                SET next_evidence_artifact_sequence = next_evidence_artifact_sequence + 1
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

        return mapAttemptEvidenceArtifactRow(mapD1AttemptEvidenceArtifactRow(row));
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          throw new Error(
            `Attempt evidence artifact ${input.artifactId} already exists and cannot be replaced.`,
          );
        }

        throw error;
      }
    },

    async getAttemptEvidenceArtifactById(artifactId) {
      const row = await queryD1First<D1AttemptEvidenceArtifactRow>(
        db,
        `${D1_ATTEMPT_EVIDENCE_ARTIFACT_SELECT} WHERE artifact_id = ?`,
        [artifactId],
      );

      return mapOptionalAttemptEvidenceArtifact(
        row === null ? undefined : mapD1AttemptEvidenceArtifactRow(row),
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

      return rows.map((row) => mapAttemptEvidenceArtifactRow(mapD1AttemptEvidenceArtifactRow(row)));
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

function isD1UniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}
