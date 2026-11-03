import {
  expectD1JsonRecord,
  expectD1NullableNumber,
  expectD1NullableString,
  expectD1Number,
  expectD1String,
  expectD1StringLiteral,
  parseD1JsonField,
} from '../db/d1_row.ts';
import type { AttemptEvidenceArtifactRow, AuditEventRow } from './repository_row_types.ts';

export interface D1AttemptEvidenceArtifactRow extends Record<string, unknown> {
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

export interface D1AuditEventRow extends Record<string, unknown> {
  id: unknown;
  eventType: unknown;
  actorType: unknown;
  actorId: unknown;
  packageVersionId: unknown;
  attemptId: unknown;
  status: unknown;
  summary: unknown;
  detail: unknown;
  occurredAt: unknown;
}

export function mapD1AttemptEvidenceArtifactRow(
  row: D1AttemptEvidenceArtifactRow,
): AttemptEvidenceArtifactRow {
  return {
    artifactId: expectD1String(row.artifactId, 'artifactId'),
    attemptId: expectD1String(row.attemptId, 'attemptId'),
    sequence: expectD1Number(row.sequence, 'sequence'),
    kind: expectD1StringLiteral(row.kind, 'kind', ['screenshot_png', 'structured_json']),
    contentType: expectD1String(row.contentType, 'contentType'),
    fileName: expectD1String(row.fileName, 'fileName'),
    storageKey: expectD1String(row.storageKey, 'storageKey'),
    byteSize: expectD1Number(row.byteSize, 'byteSize'),
    sha256: expectD1String(row.sha256, 'sha256'),
    createdAt: expectD1String(row.createdAt, 'createdAt'),
  };
}

export function mapD1AuditEventFields(row: D1AuditEventRow): AuditEventRow {
  return {
    id: expectD1Number(row.id, 'id'),
    eventType: expectD1String(row.eventType, 'eventType'),
    actorType: expectD1StringLiteral(row.actorType, 'actorType', ['user', 'system', 'platform']),
    actorId: expectD1NullableString(row.actorId, 'actorId'),
    packageVersionId: expectD1NullableNumber(row.packageVersionId, 'packageVersionId'),
    attemptId: expectD1NullableString(row.attemptId, 'attemptId'),
    status: expectD1StringLiteral(row.status, 'status', ['accepted', 'succeeded', 'failed']),
    summary: expectD1String(row.summary, 'summary'),
    detail: parseD1JsonField(row.detail, 'detail', expectD1JsonRecord),
    occurredAt: expectD1String(row.occurredAt, 'occurredAt'),
  };
}
