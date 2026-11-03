import {
  expectD1JsonRecord,
  expectD1NullableString,
  expectD1NullableStringLiteral,
  expectD1Number,
  expectD1String,
  expectD1StringArray,
  expectD1StringLiteral,
  parseD1JsonField,
  parseD1NullableJsonField,
} from '../db/d1_row.ts';
import type { AttemptEvent, Capability, NormalizedAttemptEvent } from '../../sdk/app-sdk.ts';
import type { AttemptEventRow, AttemptRow, RuntimeSessionRow } from './repository_row_types.ts';

export interface D1RuntimeSessionRow extends Record<string, unknown> {
  sessionId: unknown;
  sessionToken: unknown;
  ltiToolSessionId: unknown;
  attemptId: unknown;
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

export interface D1AttemptRow extends Record<string, unknown> {
  id: unknown;
  attemptId: unknown;
  previewSessionId: unknown;
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

export interface D1AttemptEventRow extends Record<string, unknown> {
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

export function mapD1RuntimeSessionFields(row: D1RuntimeSessionRow): RuntimeSessionRow {
  return {
    sessionId: expectD1String(row.sessionId, 'sessionId'),
    sessionToken: expectD1String(row.sessionToken, 'sessionToken'),
    ltiToolSessionId: expectD1NullableString(row.ltiToolSessionId, 'ltiToolSessionId'),
    attemptId: expectD1NullableString(row.attemptId, 'attemptId'),
    appId: expectD1String(row.appId, 'appId'),
    packageVersionId: expectD1Number(row.packageVersionId, 'packageVersionId'),
    packageVersion: expectD1String(row.packageVersion, 'packageVersion'),
    capabilities: parseD1JsonField(row.capabilities, 'capabilities', parseCapabilityArray),
    snapshotRoot: expectD1String(row.snapshotRoot, 'snapshotRoot'),
    entrypointPath: expectD1String(row.entrypointPath, 'entrypointPath'),
    contentPath: expectD1String(row.contentPath, 'contentPath'),
    agsScope: parseD1JsonField(row.agsScope, 'agsScope', expectD1StringArray),
    agsLineitemsUrl: expectD1NullableString(row.agsLineitemsUrl, 'agsLineitemsUrl'),
    agsLineitemUrl: expectD1NullableString(row.agsLineitemUrl, 'agsLineitemUrl'),
    nrpsContextMembershipsUrl: expectD1NullableString(
      row.nrpsContextMembershipsUrl,
      'nrpsContextMembershipsUrl',
    ),
    nrpsServiceVersions: parseD1JsonField(
      row.nrpsServiceVersions,
      'nrpsServiceVersions',
      expectD1StringArray,
    ),
    launchUserRole: expectD1StringLiteral(row.launchUserRole, 'launchUserRole', [
      'learner',
      'instructor',
    ]),
    launchCourseId: expectD1String(row.launchCourseId, 'launchCourseId'),
    launchAssignmentId: expectD1NullableString(row.launchAssignmentId, 'launchAssignmentId'),
    launchActivityId: expectD1String(row.launchActivityId, 'launchActivityId'),
    previewSessionId: expectD1String(row.previewSessionId, 'previewSessionId'),
    createdAt: expectD1String(row.createdAt, 'createdAt'),
    expiresAt: expectD1String(row.expiresAt, 'expiresAt'),
  };
}

export function mapD1AttemptFields(row: D1AttemptRow): AttemptRow {
  return {
    id: expectD1Number(row.id, 'id'),
    attemptId: expectD1String(row.attemptId, 'attemptId'),
    previewSessionId: expectD1String(row.previewSessionId, 'previewSessionId'),
    appId: expectD1String(row.appId, 'appId'),
    packageVersionId: expectD1Number(row.packageVersionId, 'packageVersionId'),
    packageVersion: expectD1String(row.packageVersion, 'packageVersion'),
    userId: expectD1String(row.userId, 'userId'),
    userDisplayName: expectD1NullableString(row.userDisplayName, 'userDisplayName'),
    userEmail: expectD1NullableString(row.userEmail, 'userEmail'),
    userLogin: expectD1NullableString(row.userLogin, 'userLogin'),
    userRole: expectD1StringLiteral(row.userRole, 'userRole', ['learner', 'instructor']),
    contextId: expectD1String(row.contextId, 'contextId'),
    resourceLinkId: expectD1String(row.resourceLinkId, 'resourceLinkId'),
    activityId: expectD1String(row.activityId, 'activityId'),
    status: expectD1StringLiteral(row.status, 'status', ['in_progress', 'completed', 'abandoned']),
    completionState: expectD1NullableStringLiteral(row.completionState, 'completionState', [
      'completed',
      'abandoned',
    ]),
    localState: parseD1NullableJsonField(row.localState, 'localState', expectD1JsonRecord),
    startedAt: expectD1String(row.startedAt, 'startedAt'),
    finalizedAt: expectD1NullableString(row.finalizedAt, 'finalizedAt'),
  };
}

export function mapD1AttemptEventFields(row: D1AttemptEventRow): AttemptEventRow {
  return {
    id: expectD1Number(row.id, 'id'),
    attemptId: expectD1String(row.attemptId, 'attemptId'),
    sequence: expectD1Number(row.sequence, 'sequence'),
    eventType: expectD1String(row.eventType, 'eventType') as AttemptEventRow['eventType'],
    learningVerb: expectD1StringLiteral(row.learningVerb, 'learningVerb', [
      'answered',
      'progressed',
      'completed',
    ]),
    objectId: expectD1String(row.objectId, 'objectId'),
    objectType: expectD1StringLiteral(row.objectType, 'objectType', [
      'question',
      'checkpoint',
      'activity',
    ]),
    result: parseD1JsonField(row.result, 'result', parseAttemptEventResult),
    event: parseD1JsonField(row.event, 'event', parseAttemptEvent),
    receivedAt: expectD1String(row.receivedAt, 'receivedAt'),
  };
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
    ]),
  );
}

function parseAttemptEventResult(
  value: unknown,
  fieldName: string,
): NormalizedAttemptEvent['result'] {
  const record = expectD1JsonRecord(value, fieldName);

  if ('completionState' in record) {
    return {
      completionState: expectD1StringLiteral(
        record.completionState,
        `${fieldName}.completionState`,
        ['completed'],
      ),
    };
  }

  if ('value' in record) {
    return {
      value: expectD1Number(record.value, `${fieldName}.value`),
    };
  }

  const response = parseAttemptResponse(record.response, `${fieldName}.response`);

  return {
    response,
    success: parseNullableBoolean(record.success, `${fieldName}.success`),
    scoreGiven: parseNullableNumber(record.scoreGiven, `${fieldName}.scoreGiven`),
    scoreMaximum: parseNullableNumber(record.scoreMaximum, `${fieldName}.scoreMaximum`),
  };
}

function parseAttemptEvent(value: unknown, fieldName: string): AttemptEvent {
  const record = expectD1JsonRecord(value, fieldName);
  const type = expectD1StringLiteral(record.type, `${fieldName}.type`, [
    'answer',
    'progress',
    'complete',
  ]);

  if (type === 'answer') {
    const event: AttemptEvent = {
      type,
      questionId: expectD1String(record.questionId, `${fieldName}.questionId`),
      answer: parseAttemptResponse(record.answer, `${fieldName}.answer`),
      timestamp: expectD1String(record.timestamp, `${fieldName}.timestamp`),
    };
    const correct = parseOptionalBoolean(record.correct, `${fieldName}.correct`);
    const scoreGiven = parseOptionalNumber(record.scoreGiven, `${fieldName}.scoreGiven`);
    const scoreMaximum = parseOptionalNumber(record.scoreMaximum, `${fieldName}.scoreMaximum`);

    return {
      ...event,
      ...(correct === undefined ? {} : { correct }),
      ...(scoreGiven === undefined ? {} : { scoreGiven }),
      ...(scoreMaximum === undefined ? {} : { scoreMaximum }),
    };
  }

  if (type === 'progress') {
    return {
      type,
      checkpoint: expectD1String(record.checkpoint, `${fieldName}.checkpoint`),
      value: expectD1Number(record.value, `${fieldName}.value`),
      timestamp: expectD1String(record.timestamp, `${fieldName}.timestamp`),
    };
  }

  return {
    type,
    timestamp: expectD1String(record.timestamp, `${fieldName}.timestamp`),
  };
}

function parseAttemptResponse(value: unknown, fieldName: string): string | string[] {
  if (typeof value === 'string') {
    return value;
  }

  return expectD1StringArray(value, fieldName);
}

function parseNullableBoolean(value: unknown, fieldName: string): boolean | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'boolean') {
    throw new TypeError(`Expected D1 ${fieldName} JSON to be boolean or null.`);
  }

  return value;
}

function parseOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new TypeError(`Expected D1 ${fieldName} JSON to be boolean when present.`);
  }

  return value;
}

function parseNullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  return expectD1Number(value, fieldName);
}

function parseOptionalNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectD1Number(value, fieldName);
}
