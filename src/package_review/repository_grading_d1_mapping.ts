import {
  expectD1JsonRecord,
  expectD1NullableNumber,
  expectD1NullableString,
  expectD1Number,
  expectD1String,
  expectD1StringLiteral,
  parseD1JsonField,
  parseD1NullableJsonField,
} from '../db/d1_row.ts';
import type {
  AttemptEvidenceArtifactRow,
  AuditEventRow,
  GradePublicationRow,
  LineItemBindingRow,
} from './repository_row_types.ts';

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

export interface D1LineItemBindingRow extends Record<string, unknown> {
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

export interface D1GradePublicationRow extends Record<string, unknown> {
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

export interface D1AuditEventRow extends Record<string, unknown> {
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

export function mapD1LineItemBindingFields(row: D1LineItemBindingRow): LineItemBindingRow {
  return {
    id: expectD1Number(row.id, 'id'),
    deploymentRecordId: expectD1Number(row.deploymentRecordId, 'deploymentRecordId'),
    packageVersionId: expectD1Number(row.packageVersionId, 'packageVersionId'),
    contextId: expectD1String(row.contextId, 'contextId'),
    resourceLinkId: expectD1String(row.resourceLinkId, 'resourceLinkId'),
    activityId: expectD1String(row.activityId, 'activityId'),
    lineItemsUrl: expectD1String(row.lineItemsUrl, 'lineItemsUrl'),
    lineItemUrl: expectD1String(row.lineItemUrl, 'lineItemUrl'),
    resourceId: expectD1String(row.resourceId, 'resourceId'),
    tag: expectD1String(row.tag, 'tag'),
    label: expectD1String(row.label, 'label'),
    scoreMaximum: expectD1Number(row.scoreMaximum, 'scoreMaximum'),
    createdAt: expectD1String(row.createdAt, 'createdAt'),
    updatedAt: expectD1String(row.updatedAt, 'updatedAt'),
  };
}

export function mapD1GradePublicationFields(row: D1GradePublicationRow): GradePublicationRow {
  return {
    id: expectD1Number(row.id, 'id'),
    attemptId: expectD1String(row.attemptId, 'attemptId'),
    lineItemBindingId: expectD1Number(row.lineItemBindingId, 'lineItemBindingId'),
    lineItemUrl: expectD1String(row.lineItemUrl, 'lineItemUrl'),
    platformUserId: expectD1String(row.platformUserId, 'platformUserId'),
    scoreGiven: expectD1Number(row.scoreGiven, 'scoreGiven'),
    scoreMaximum: expectD1Number(row.scoreMaximum, 'scoreMaximum'),
    activityProgress: expectD1StringLiteral(row.activityProgress, 'activityProgress', [
      'Completed',
      'InProgress',
      'Initialized',
    ]),
    gradingProgress: expectD1StringLiteral(row.gradingProgress, 'gradingProgress', [
      'Pending',
      'PendingManual',
      'FullyGraded',
      'Failed',
    ]),
    status: expectD1StringLiteral(row.status, 'status', ['pending', 'published', 'failed']),
    createdAt: expectD1String(row.createdAt, 'createdAt'),
    updatedAt: expectD1String(row.updatedAt, 'updatedAt'),
    publishedAt: expectD1NullableString(row.publishedAt, 'publishedAt'),
    errorCode: expectD1NullableString(row.errorCode, 'errorCode'),
    errorDetail: parseD1NullableJsonField(row.errorDetail, 'errorDetail', expectD1JsonRecord),
  };
}

export function mapD1AuditEventFields(row: D1AuditEventRow): AuditEventRow {
  return {
    id: expectD1Number(row.id, 'id'),
    eventType: expectD1String(row.eventType, 'eventType'),
    actorType: expectD1StringLiteral(row.actorType, 'actorType', ['user', 'system', 'platform']),
    actorId: expectD1NullableString(row.actorId, 'actorId'),
    deploymentRecordId: expectD1NullableNumber(row.deploymentRecordId, 'deploymentRecordId'),
    packageVersionId: expectD1NullableNumber(row.packageVersionId, 'packageVersionId'),
    attemptId: expectD1NullableString(row.attemptId, 'attemptId'),
    lineItemBindingId: expectD1NullableNumber(row.lineItemBindingId, 'lineItemBindingId'),
    status: expectD1StringLiteral(row.status, 'status', ['accepted', 'succeeded', 'failed']),
    summary: expectD1String(row.summary, 'summary'),
    detail: parseD1JsonField(row.detail, 'detail', expectD1JsonRecord),
    occurredAt: expectD1String(row.occurredAt, 'occurredAt'),
  };
}
