import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects, runD1Batch } from '../db/d1.ts';
import {
  mapAttemptEvidenceArtifactRow,
  mapAuditEventRow,
  mapOptionalAttemptEvidenceArtifact,
} from './repository_mappers_attempts.ts';
import {
  type D1AttemptEvidenceArtifactRow,
  type D1AuditEventRow,
  mapD1AttemptEvidenceArtifactRow,
  mapD1AuditEventFields,
} from './repository_activity_d1_mapping.ts';
import type { PackageReviewRepository } from './repository.ts';

export function createD1ActivityRepositoryMethods(
  db: D1Database,
): Pick<
  PackageReviewRepository,
  | 'createAttemptEvidenceArtifact'
  | 'getAttemptEvidenceArtifactById'
  | 'listAttemptEvidenceArtifacts'
  | 'recordAuditEvent'
  | 'listAuditEventsByAttemptId'
  | 'listAuditEventsByEventType'
> {
  return {
    async createAttemptEvidenceArtifact(input) {
      try {
        const results = await runD1Batch<D1AttemptEvidenceArtifactRow>(db, [
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
        ]);
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

    async recordAuditEvent(record) {
      const row = await queryD1First<D1AuditEventRow>(
        db,
        `
          INSERT INTO audit_events (
            event_type,
            actor_type,
            actor_id,
            package_version_id,
            attempt_id,
            status,
            summary,
            detail,
            occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING
            id,
            event_type AS eventType,
            actor_type AS actorType,
            actor_id AS actorId,
            package_version_id AS packageVersionId,
            attempt_id AS attemptId,
            status,
            summary,
            detail,
            occurred_at AS occurredAt
        `,
        [
          record.eventType,
          record.actorType,
          record.actorId,
          record.packageVersionId,
          record.attemptId,
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

const D1_AUDIT_EVENT_SELECT = `
  SELECT
    id,
    event_type AS eventType,
    actor_type AS actorType,
    actor_id AS actorId,
    package_version_id AS packageVersionId,
    attempt_id AS attemptId,
    status,
    summary,
    detail,
    occurred_at AS occurredAt
  FROM audit_events
`;

function isD1UniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}
