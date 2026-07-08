import {
  expectD1JsonRecord,
  expectD1NullableNumber,
  expectD1NullableString,
  expectD1NullableStringLiteral,
  expectD1Number,
  expectD1String,
  expectD1StringArray,
  expectD1StringLiteral,
  parseD1JsonField,
  parseD1NullableJsonField,
} from '../db/d1_row.ts';
export {
  type D1AttemptEvidenceArtifactRow,
  mapD1AttemptEvidenceArtifactRow,
} from '../package_review/repository_grading_d1_mapping.ts';
import type {
  ActivitySnapshotRow,
  CertificationWorkflowStatusRow,
  DiagnosticRow,
  GradePublicationSnapshotRow,
  InternalBrokerVerificationRow,
  InventoryQueryRow,
  LatestOfficialCertificationEvidenceRow,
  OfficialBrokerVerificationRow,
  RecentLaunchRow,
  RetryLookupRow,
} from './repository_types.ts';

export interface D1InventoryQueryRow {
  deploymentId: unknown;
  deploymentSlug: unknown;
  deploymentLabel: unknown;
  appId: unknown;
  appTitle: unknown;
  ownerId: unknown;
  enabledPackageVersionId: unknown;
  enabledPackageVersion: unknown;
  approvalStatus: unknown;
  reviewedAt: unknown;
  bindingLmsType: unknown;
  installEvidenceStatus: unknown;
  installEvidenceSummary: unknown;
  installEvidenceDetail: unknown;
  installEvidenceOccurredAt: unknown;
  internalBrokerVerificationScope: unknown;
  internalBrokerVerificationSource: unknown;
  internalBrokerVerificationStatus: unknown;
  internalBrokerVerificationSummary: unknown;
  internalBrokerVerificationDetailUrl: unknown;
  internalBrokerVerificationCheckedAt: unknown;
  officialBrokerVerificationScope: unknown;
  officialBrokerVerificationStatus: unknown;
  officialBrokerVerificationCertificationState: unknown;
  officialBrokerVerificationDetailUrl: unknown;
  officialBrokerVerificationCheckedAt: unknown;
  bindingCanvasEnvironment: unknown;
  bindingIssuer: unknown;
  bindingClientId: unknown;
  bindingDeploymentId: unknown;
  bindingAuthorizationEndpoint: unknown;
  bindingAccessTokenUrl: unknown;
  bindingJwksUrl: unknown;
  updatedAt: unknown;
  lastLaunchAt: unknown;
  lastLaunchStatus: unknown;
  lastNrpsReadAt: unknown;
  lastNrpsReadStatus: unknown;
  lastGradePublishAt: unknown;
  lastGradePublishStatus: unknown;
  totalLaunches: unknown;
  attemptsStarted: unknown;
  attemptsCompleted: unknown;
  gradePublishesSucceeded: unknown;
  gradePublishesFailed: unknown;
  recentActiveUsers: unknown;
  usageLastLaunchAt: unknown;
  measuredAt: unknown;
}

export interface D1ActivitySnapshotRow {
  eventType: unknown;
  status: unknown;
  summary: unknown;
  attemptId: unknown;
  detail: unknown;
  occurredAt: unknown;
}

export interface D1RecentLaunchRow {
  summary: unknown;
  actorId: unknown;
  userId: unknown;
  userDisplayName: unknown;
  userEmail: unknown;
  userLogin: unknown;
  attemptId: unknown;
  detail: unknown;
  occurredAt: unknown;
}

export interface D1GradePublicationSnapshotRow {
  attemptId: unknown;
  status: unknown;
  lineItemUrl: unknown;
  platformUserId: unknown;
  scoreGiven: unknown;
  scoreMaximum: unknown;
  activityProgress: unknown;
  gradingProgress: unknown;
  publishedAt: unknown;
  updatedAt: unknown;
  errorCode: unknown;
  errorDetail: unknown;
}

export interface D1DiagnosticRow {
  id: unknown;
  eventType: unknown;
  actorType: unknown;
  status: unknown;
  deploymentRecordId: unknown;
  attemptId: unknown;
  summary: unknown;
  detail: unknown;
  occurredAt: unknown;
}

export interface D1InternalBrokerVerificationRow {
  scope: unknown;
  source: unknown;
  status: unknown;
  summary: unknown;
  detailUrl: unknown;
  checkedAt: unknown;
}

export interface D1OfficialBrokerVerificationRow {
  scope: unknown;
  status: unknown;
  certificationState: unknown;
  detailUrl: unknown;
  checkedAt: unknown;
}

export interface D1CertificationWorkflowStatusRow {
  workflowKey: unknown;
  deploymentRecordId: unknown;
  deploymentLabel: unknown;
  status: unknown;
  summary: unknown;
  detailUrl: unknown;
  checkedAt: unknown;
}

export interface D1LatestOfficialCertificationEvidenceRow {
  workflowKey: unknown;
  status: unknown;
  certificationState: unknown;
  summary: unknown;
  detailUrl: unknown;
  checkedAt: unknown;
}

export interface D1RetryLookupRow {
  attemptId: unknown;
  deploymentRecordId: unknown;
  deploymentSlug: unknown;
  publicationStatus: unknown;
  lineItemUrl: unknown;
  platformUserId: unknown;
  scoreGiven: unknown;
  scoreMaximum: unknown;
  activityProgress: unknown;
  gradingProgress: unknown;
  publishedAt: unknown;
  updatedAt: unknown;
  errorCode: unknown;
  errorDetail: unknown;
  bindingCanvasEnvironment: unknown;
  bindingIssuer: unknown;
  bindingClientId: unknown;
  bindingDeploymentId: unknown;
  sessionId: unknown;
  runtimeLtiToolSessionId: unknown;
  runtimeAttemptId: unknown;
  runtimeDeploymentRecordId: unknown;
  runtimeDeploymentSlug: unknown;
  runtimeAppId: unknown;
  runtimePackageVersionId: unknown;
  runtimePackageVersion: unknown;
  runtimeAgsScope: unknown;
  runtimeAgsLineitemsUrl: unknown;
  runtimeAgsLineitemUrl: unknown;
  runtimeNrpsContextMembershipsUrl: unknown;
  runtimeNrpsServiceVersions: unknown;
  runtimeCreatedAt: unknown;
  runtimeExpiresAt: unknown;
}
export function mapD1InventoryRow(row: D1InventoryQueryRow): InventoryQueryRow {
  return {
    deploymentId: expectD1Number(row.deploymentId, 'deploymentId'),
    deploymentSlug: expectD1String(row.deploymentSlug, 'deploymentSlug'),
    deploymentLabel: expectD1String(row.deploymentLabel, 'deploymentLabel'),
    appId: expectD1String(row.appId, 'appId'),
    appTitle: expectD1String(row.appTitle, 'appTitle'),
    ownerId: expectD1NullableString(row.ownerId, 'ownerId'),
    enabledPackageVersionId: expectD1NullableNumber(
      row.enabledPackageVersionId,
      'enabledPackageVersionId',
    ),
    enabledPackageVersion: expectD1NullableString(
      row.enabledPackageVersion,
      'enabledPackageVersion',
    ),
    approvalStatus: expectD1NullableStringLiteral(row.approvalStatus, 'approvalStatus', [
      'pending',
      'approved',
      'rejected',
    ]),
    reviewedAt: expectD1NullableString(row.reviewedAt, 'reviewedAt'),
    bindingLmsType: expectD1NullableStringLiteral(row.bindingLmsType, 'bindingLmsType', [
      'canvas',
      'moodle',
      'sakai',
    ]),
    installEvidenceStatus: expectD1NullableStringLiteral(
      row.installEvidenceStatus,
      'installEvidenceStatus',
      ['accepted', 'succeeded', 'failed'],
    ),
    installEvidenceSummary: expectD1NullableString(
      row.installEvidenceSummary,
      'installEvidenceSummary',
    ),
    installEvidenceDetail: parseD1NullableJsonField(
      row.installEvidenceDetail,
      'installEvidenceDetail',
      expectD1JsonRecord,
    ),
    installEvidenceOccurredAt: expectD1NullableString(
      row.installEvidenceOccurredAt,
      'installEvidenceOccurredAt',
    ),
    internalBrokerVerificationScope: expectNullableSupportedPath(
      row.internalBrokerVerificationScope,
      'internalBrokerVerificationScope',
    ),
    internalBrokerVerificationSource: expectD1NullableStringLiteral(
      row.internalBrokerVerificationSource,
      'internalBrokerVerificationSource',
      ['manual', 'ci', '1edtech'],
    ),
    internalBrokerVerificationStatus: expectD1NullableStringLiteral(
      row.internalBrokerVerificationStatus,
      'internalBrokerVerificationStatus',
      ['passed', 'failed', 'notRun'],
    ),
    internalBrokerVerificationSummary: expectD1NullableString(
      row.internalBrokerVerificationSummary,
      'internalBrokerVerificationSummary',
    ),
    internalBrokerVerificationDetailUrl: expectD1NullableString(
      row.internalBrokerVerificationDetailUrl,
      'internalBrokerVerificationDetailUrl',
    ),
    internalBrokerVerificationCheckedAt: expectD1NullableString(
      row.internalBrokerVerificationCheckedAt,
      'internalBrokerVerificationCheckedAt',
    ),
    officialBrokerVerificationScope: expectNullableSupportedPath(
      row.officialBrokerVerificationScope,
      'officialBrokerVerificationScope',
    ),
    officialBrokerVerificationStatus: expectD1NullableStringLiteral(
      row.officialBrokerVerificationStatus,
      'officialBrokerVerificationStatus',
      ['passed', 'failed', 'notRun', 'notCertified'],
    ),
    officialBrokerVerificationCertificationState: expectD1NullableStringLiteral(
      row.officialBrokerVerificationCertificationState,
      'officialBrokerVerificationCertificationState',
      ['ltiAdvantageCertified', 'ltiAdvantageComplete'],
    ),
    officialBrokerVerificationDetailUrl: expectD1NullableString(
      row.officialBrokerVerificationDetailUrl,
      'officialBrokerVerificationDetailUrl',
    ),
    officialBrokerVerificationCheckedAt: expectD1NullableString(
      row.officialBrokerVerificationCheckedAt,
      'officialBrokerVerificationCheckedAt',
    ),
    bindingCanvasEnvironment: expectD1NullableString(
      row.bindingCanvasEnvironment,
      'bindingCanvasEnvironment',
    ),
    bindingIssuer: expectD1NullableString(row.bindingIssuer, 'bindingIssuer'),
    bindingClientId: expectD1NullableString(row.bindingClientId, 'bindingClientId'),
    bindingDeploymentId: expectD1NullableString(row.bindingDeploymentId, 'bindingDeploymentId'),
    bindingAuthorizationEndpoint: expectD1NullableString(
      row.bindingAuthorizationEndpoint,
      'bindingAuthorizationEndpoint',
    ),
    bindingAccessTokenUrl: expectD1NullableString(
      row.bindingAccessTokenUrl,
      'bindingAccessTokenUrl',
    ),
    bindingJwksUrl: expectD1NullableString(row.bindingJwksUrl, 'bindingJwksUrl'),
    updatedAt: expectD1String(row.updatedAt, 'updatedAt'),
    lastLaunchAt: expectD1NullableString(row.lastLaunchAt, 'lastLaunchAt'),
    lastLaunchStatus: expectD1NullableStringLiteral(row.lastLaunchStatus, 'lastLaunchStatus', [
      'succeeded',
      'failed',
      'pending',
    ]),
    lastNrpsReadAt: expectD1NullableString(row.lastNrpsReadAt, 'lastNrpsReadAt'),
    lastNrpsReadStatus: expectD1NullableStringLiteral(
      row.lastNrpsReadStatus,
      'lastNrpsReadStatus',
      [
        'succeeded',
        'failed',
        'pending',
      ],
    ),
    lastGradePublishAt: expectD1NullableString(row.lastGradePublishAt, 'lastGradePublishAt'),
    lastGradePublishStatus: expectD1NullableStringLiteral(
      row.lastGradePublishStatus,
      'lastGradePublishStatus',
      ['pending', 'published', 'failed'],
    ),
    totalLaunches: expectD1Number(row.totalLaunches, 'totalLaunches'),
    attemptsStarted: expectD1Number(row.attemptsStarted, 'attemptsStarted'),
    attemptsCompleted: expectD1Number(row.attemptsCompleted, 'attemptsCompleted'),
    gradePublishesSucceeded: expectD1Number(row.gradePublishesSucceeded, 'gradePublishesSucceeded'),
    gradePublishesFailed: expectD1Number(row.gradePublishesFailed, 'gradePublishesFailed'),
    recentActiveUsers: expectD1Number(row.recentActiveUsers, 'recentActiveUsers'),
    usageLastLaunchAt: expectD1NullableString(row.usageLastLaunchAt, 'usageLastLaunchAt'),
    measuredAt: expectD1String(row.measuredAt, 'measuredAt'),
  };
}

export function mapD1ActivitySnapshotRow(row: D1ActivitySnapshotRow): ActivitySnapshotRow {
  return {
    eventType: expectD1String(row.eventType, 'eventType'),
    status: expectD1StringLiteral(row.status, 'status', ['accepted', 'succeeded', 'failed']),
    summary: expectD1String(row.summary, 'summary'),
    attemptId: expectD1NullableString(row.attemptId, 'attemptId'),
    detail: parseD1JsonField(row.detail, 'detail', expectD1JsonRecord),
    occurredAt: expectD1String(row.occurredAt, 'occurredAt'),
  };
}

export function mapD1RecentLaunchRow(row: D1RecentLaunchRow): RecentLaunchRow {
  return {
    summary: expectD1String(row.summary, 'summary'),
    actorId: expectD1NullableString(row.actorId, 'actorId'),
    userId: expectD1NullableString(row.userId, 'userId'),
    userDisplayName: expectD1NullableString(row.userDisplayName, 'userDisplayName'),
    userEmail: expectD1NullableString(row.userEmail, 'userEmail'),
    userLogin: expectD1NullableString(row.userLogin, 'userLogin'),
    attemptId: expectD1NullableString(row.attemptId, 'attemptId'),
    detail: parseD1JsonField(row.detail, 'detail', expectD1JsonRecord),
    occurredAt: expectD1String(row.occurredAt, 'occurredAt'),
  };
}

export function mapD1GradePublicationRow(
  row: D1GradePublicationSnapshotRow,
): GradePublicationSnapshotRow {
  return {
    attemptId: expectD1String(row.attemptId, 'attemptId'),
    status: expectD1StringLiteral(row.status, 'status', ['pending', 'published', 'failed']),
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
    publishedAt: expectD1NullableString(row.publishedAt, 'publishedAt'),
    updatedAt: expectD1String(row.updatedAt, 'updatedAt'),
    errorCode: expectD1NullableString(row.errorCode, 'errorCode'),
    errorDetail: parseD1NullableJsonField(row.errorDetail, 'errorDetail', expectD1JsonRecord),
  };
}

export function mapD1DiagnosticRow(row: D1DiagnosticRow): DiagnosticRow {
  return {
    id: expectD1Number(row.id, 'id'),
    eventType: expectD1String(row.eventType, 'eventType'),
    actorType: expectD1StringLiteral(row.actorType, 'actorType', ['user', 'system', 'platform']),
    status: expectD1StringLiteral(row.status, 'status', ['accepted', 'succeeded', 'failed']),
    deploymentRecordId: expectD1NullableNumber(row.deploymentRecordId, 'deploymentRecordId'),
    attemptId: expectD1NullableString(row.attemptId, 'attemptId'),
    summary: expectD1String(row.summary, 'summary'),
    detail: parseD1JsonField(row.detail, 'detail', expectD1JsonRecord),
    occurredAt: expectD1String(row.occurredAt, 'occurredAt'),
  };
}

export function mapD1InternalBrokerVerificationRow(
  row: D1InternalBrokerVerificationRow,
): InternalBrokerVerificationRow {
  return {
    scope: expectSupportedPath(row.scope, 'scope'),
    source: expectD1StringLiteral(row.source, 'source', ['manual', 'ci', '1edtech']),
    status: expectD1StringLiteral(row.status, 'status', ['passed', 'failed', 'notRun']),
    summary: expectD1String(row.summary, 'summary'),
    detailUrl: expectD1NullableString(row.detailUrl, 'detailUrl'),
    checkedAt: expectD1String(row.checkedAt, 'checkedAt'),
  };
}

export function mapD1OfficialBrokerVerificationRow(
  row: D1OfficialBrokerVerificationRow,
): OfficialBrokerVerificationRow {
  return {
    scope: expectSupportedPath(row.scope, 'scope'),
    status: expectD1StringLiteral(row.status, 'status', [
      'passed',
      'failed',
      'notRun',
      'notCertified',
    ]),
    certificationState: expectD1NullableStringLiteral(
      row.certificationState,
      'certificationState',
      [
        'ltiAdvantageCertified',
        'ltiAdvantageComplete',
      ],
    ),
    detailUrl: expectD1NullableString(row.detailUrl, 'detailUrl'),
    checkedAt: expectD1String(row.checkedAt, 'checkedAt'),
  };
}

export function mapD1CertificationWorkflowStatusRow(
  row: D1CertificationWorkflowStatusRow,
): CertificationWorkflowStatusRow {
  return {
    workflowKey: expectD1StringLiteral(row.workflowKey, 'workflowKey', [
      'core',
      'deepLinking',
      'nrps',
      'ags',
    ]),
    deploymentRecordId: expectD1NullableNumber(row.deploymentRecordId, 'deploymentRecordId'),
    deploymentLabel: expectD1NullableString(row.deploymentLabel, 'deploymentLabel'),
    status: expectD1NullableStringLiteral(row.status, 'status', ['passed', 'failed', 'pending']),
    summary: expectD1NullableString(row.summary, 'summary'),
    detailUrl: expectD1NullableString(row.detailUrl, 'detailUrl'),
    checkedAt: expectD1NullableString(row.checkedAt, 'checkedAt'),
  };
}

export function mapD1LatestOfficialCertificationEvidenceRow(
  row: D1LatestOfficialCertificationEvidenceRow,
): LatestOfficialCertificationEvidenceRow {
  return {
    workflowKey: expectD1StringLiteral(row.workflowKey, 'workflowKey', [
      'core',
      'deepLinking',
      'nrps',
      'ags',
    ]),
    status: expectD1StringLiteral(row.status, 'status', [
      'passed',
      'failed',
      'notRun',
      'notCertified',
    ]),
    certificationState: expectD1NullableStringLiteral(
      row.certificationState,
      'certificationState',
      [
        'ltiAdvantageCertified',
        'ltiAdvantageComplete',
      ],
    ),
    summary: expectD1String(row.summary, 'summary'),
    detailUrl: expectD1NullableString(row.detailUrl, 'detailUrl'),
    checkedAt: expectD1String(row.checkedAt, 'checkedAt'),
  };
}

export function mapD1RetryLookupRow(row: D1RetryLookupRow): RetryLookupRow {
  return {
    attemptId: expectD1String(row.attemptId, 'attemptId'),
    deploymentRecordId: expectD1Number(row.deploymentRecordId, 'deploymentRecordId'),
    deploymentSlug: expectD1String(row.deploymentSlug, 'deploymentSlug'),
    publicationStatus: expectD1StringLiteral(row.publicationStatus, 'publicationStatus', [
      'pending',
      'published',
      'failed',
    ]),
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
    publishedAt: expectD1NullableString(row.publishedAt, 'publishedAt'),
    updatedAt: expectD1String(row.updatedAt, 'updatedAt'),
    errorCode: expectD1NullableString(row.errorCode, 'errorCode'),
    errorDetail: parseD1NullableJsonField(row.errorDetail, 'errorDetail', expectD1JsonRecord),
    bindingCanvasEnvironment: expectD1NullableString(
      row.bindingCanvasEnvironment,
      'bindingCanvasEnvironment',
    ),
    bindingIssuer: expectD1NullableString(row.bindingIssuer, 'bindingIssuer'),
    bindingClientId: expectD1NullableString(row.bindingClientId, 'bindingClientId'),
    bindingDeploymentId: expectD1NullableString(row.bindingDeploymentId, 'bindingDeploymentId'),
    sessionId: expectD1NullableString(row.sessionId, 'sessionId'),
    runtimeLtiToolSessionId: expectD1NullableString(
      row.runtimeLtiToolSessionId,
      'runtimeLtiToolSessionId',
    ),
    runtimeAttemptId: expectD1NullableString(row.runtimeAttemptId, 'runtimeAttemptId'),
    runtimeDeploymentRecordId: expectD1NullableNumber(
      row.runtimeDeploymentRecordId,
      'runtimeDeploymentRecordId',
    ),
    runtimeDeploymentSlug: expectD1NullableString(
      row.runtimeDeploymentSlug,
      'runtimeDeploymentSlug',
    ),
    runtimeAppId: expectD1NullableString(row.runtimeAppId, 'runtimeAppId'),
    runtimePackageVersionId: expectD1NullableNumber(
      row.runtimePackageVersionId,
      'runtimePackageVersionId',
    ),
    runtimePackageVersion: expectD1NullableString(
      row.runtimePackageVersion,
      'runtimePackageVersion',
    ),
    runtimeAgsScope: parseD1NullableJsonField(
      row.runtimeAgsScope,
      'runtimeAgsScope',
      expectD1StringArray,
    ),
    runtimeAgsLineitemsUrl: expectD1NullableString(
      row.runtimeAgsLineitemsUrl,
      'runtimeAgsLineitemsUrl',
    ),
    runtimeAgsLineitemUrl: expectD1NullableString(
      row.runtimeAgsLineitemUrl,
      'runtimeAgsLineitemUrl',
    ),
    runtimeNrpsContextMembershipsUrl: expectD1NullableString(
      row.runtimeNrpsContextMembershipsUrl,
      'runtimeNrpsContextMembershipsUrl',
    ),
    runtimeNrpsServiceVersions: parseD1NullableJsonField(
      row.runtimeNrpsServiceVersions,
      'runtimeNrpsServiceVersions',
      expectD1StringArray,
    ),
    runtimeCreatedAt: expectD1NullableString(row.runtimeCreatedAt, 'runtimeCreatedAt'),
    runtimeExpiresAt: expectD1NullableString(row.runtimeExpiresAt, 'runtimeExpiresAt'),
  };
}

function expectSupportedPath(value: unknown, fieldName: string) {
  return expectD1StringLiteral(value, fieldName, ['lti13LaunchAgsNrps', 'lti13LaunchAgsScore']);
}

function expectNullableSupportedPath(value: unknown, fieldName: string) {
  if (value === null) {
    return null;
  }

  return expectSupportedPath(value, fieldName);
}
