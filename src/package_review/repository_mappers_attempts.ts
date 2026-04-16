import type {
  AttemptEventRecord,
  AttemptEvidenceArtifactRecord,
  AttemptRecord,
  AuditEventRecord,
  GradePublicationRecord,
  LineItemBindingRecord,
} from './types.ts';
import type {
  AttemptEventRow,
  AttemptEvidenceArtifactRow,
  AttemptRow,
  AuditEventRow,
  GradePublicationRow,
  LineItemBindingRow,
} from './repository_row_types.ts';
import {
  normalizeNumeric,
  normalizeOptionalTimestamp,
  normalizeTimestamp,
} from './repository_value_support.ts';

export function mapOptionalAttempt(row: AttemptRow | undefined): AttemptRecord | null {
  if (!row) {
    return null;
  }

  return mapAttemptRow(row);
}

export function mapAttemptRow(row: AttemptRow | undefined): AttemptRecord {
  if (!row) {
    throw new Error('Expected an attempt row.');
  }

  return {
    id: row.id,
    attemptId: row.attemptId,
    deploymentRecordId: row.deploymentRecordId,
    deploymentSlug: row.deploymentSlug,
    appId: row.appId,
    packageVersionId: row.packageVersionId,
    packageVersion: row.packageVersion,
    userId: row.userId,
    userDisplayName: row.userDisplayName,
    userEmail: row.userEmail,
    userLogin: row.userLogin,
    userRole: row.userRole,
    contextId: row.contextId,
    resourceLinkId: row.resourceLinkId,
    activityId: row.activityId,
    status: row.status,
    completionState: row.completionState,
    localState: row.localState,
    startedAt: normalizeTimestamp(row.startedAt),
    finalizedAt: normalizeOptionalTimestamp(row.finalizedAt),
  };
}

export function mapAttemptEventRow(row: AttemptEventRow | undefined): AttemptEventRecord {
  if (!row) {
    throw new Error('Expected an attempt event row.');
  }

  return {
    id: row.id,
    attemptId: row.attemptId,
    sequence: row.sequence,
    eventType: row.eventType,
    event: row.event,
    receivedAt: normalizeTimestamp(row.receivedAt),
  };
}

export function mapOptionalAttemptEvidenceArtifact(
  row: AttemptEvidenceArtifactRow | undefined,
): AttemptEvidenceArtifactRecord | null {
  if (!row) {
    return null;
  }

  return mapAttemptEvidenceArtifactRow(row);
}

export function mapAttemptEvidenceArtifactRow(
  row: AttemptEvidenceArtifactRow | undefined,
): AttemptEvidenceArtifactRecord {
  if (!row) {
    throw new Error('Expected an attempt evidence artifact row.');
  }

  return {
    artifactId: row.artifactId,
    attemptId: row.attemptId,
    sequence: row.sequence,
    kind: row.kind,
    contentType: row.contentType,
    fileName: row.fileName,
    storageKey: row.storageKey,
    byteSize: normalizeNumeric(row.byteSize),
    sha256: row.sha256,
    createdAt: normalizeTimestamp(row.createdAt),
  };
}

export function mapOptionalLineItemBinding(
  row: LineItemBindingRow | undefined,
): LineItemBindingRecord | null {
  if (!row) {
    return null;
  }

  return mapLineItemBindingRow(row);
}

export function mapLineItemBindingRow(row: LineItemBindingRow | undefined): LineItemBindingRecord {
  if (!row) {
    throw new Error('Expected a line item binding row.');
  }

  return {
    id: row.id,
    deploymentRecordId: row.deploymentRecordId,
    packageVersionId: row.packageVersionId,
    contextId: row.contextId,
    resourceLinkId: row.resourceLinkId,
    activityId: row.activityId,
    lineItemsUrl: row.lineItemsUrl,
    lineItemUrl: row.lineItemUrl,
    resourceId: row.resourceId,
    tag: row.tag,
    label: row.label,
    scoreMaximum: row.scoreMaximum,
    createdAt: normalizeTimestamp(row.createdAt),
    updatedAt: normalizeTimestamp(row.updatedAt),
  };
}

export function mapOptionalGradePublication(
  row: GradePublicationRow | undefined,
): GradePublicationRecord | null {
  if (!row) {
    return null;
  }

  return mapGradePublicationRow(row);
}

export function mapGradePublicationRow(
  row: GradePublicationRow | undefined,
): GradePublicationRecord {
  if (!row) {
    throw new Error('Expected a grade publication row.');
  }

  return {
    id: row.id,
    attemptId: row.attemptId,
    lineItemBindingId: row.lineItemBindingId,
    lineItemUrl: row.lineItemUrl,
    platformUserId: row.platformUserId,
    scoreGiven: normalizeNumeric(row.scoreGiven),
    scoreMaximum: normalizeNumeric(row.scoreMaximum),
    activityProgress: row.activityProgress,
    gradingProgress: row.gradingProgress,
    status: row.status,
    createdAt: normalizeTimestamp(row.createdAt),
    updatedAt: normalizeTimestamp(row.updatedAt),
    publishedAt: normalizeOptionalTimestamp(row.publishedAt),
    errorCode: row.errorCode,
    errorDetail: row.errorDetail,
  };
}

export function mapAuditEventRow(row: AuditEventRow | undefined): AuditEventRecord {
  if (!row) {
    throw new Error('Expected an audit event row.');
  }

  return {
    id: row.id,
    eventType: row.eventType,
    actorType: row.actorType,
    actorId: row.actorId,
    deploymentRecordId: row.deploymentRecordId,
    packageVersionId: row.packageVersionId,
    attemptId: row.attemptId,
    lineItemBindingId: row.lineItemBindingId,
    status: row.status,
    summary: row.summary,
    detail: row.detail,
    occurredAt: normalizeTimestamp(row.occurredAt),
  };
}
