import {
  expectD1NullableNumber,
  expectD1NullableString,
  expectD1Number,
  expectD1String,
  expectD1StringArray,
  expectD1StringLiteral,
  parseD1JsonField,
} from '../db/d1_row.ts';
import type {
  DeepLinkingSessionRow,
  PlacementAuditSnapshotRow,
  ReviewedPlacementRow,
} from './repository_row_types.ts';

export interface D1DeepLinkingSessionRow extends Record<string, unknown> {
  sessionId: unknown;
  sessionToken: unknown;
  ltiToolSessionId: unknown;
  deploymentRecordId: unknown;
  deploymentSlug: unknown;
  appId: unknown;
  userId: unknown;
  userRole: unknown;
  contextId: unknown;
  contextTitle: unknown;
  deepLinkReturnUrl: unknown;
  data: unknown;
  placement: unknown;
  acceptTypes: unknown;
  acceptMultiple: unknown;
  acceptPresentationDocumentTargets: unknown;
  acceptLineItem: unknown;
  selectedPackageVersionId: unknown;
  selectedPackageVersion: unknown;
  selectedActivityId: unknown;
  selectedContentPath: unknown;
  createdAt: unknown;
  expiresAt: unknown;
  usedAt: unknown;
}

export interface D1ReviewedPlacementRow extends Record<string, unknown> {
  placementId: unknown;
  deploymentRecordId: unknown;
  deploymentSlug: unknown;
  appId: unknown;
  contextId: unknown;
  contextTitle: unknown;
  packageVersionId: unknown;
  packageVersion: unknown;
  packageTitle: unknown;
  activityId: unknown;
  contentPath: unknown;
  contentTitle: unknown;
  createdByUserId: unknown;
  resourceLinkId: unknown;
  createdAt: unknown;
  boundAt: unknown;
}

export interface D1PlacementAuditSnapshotRow extends D1ReviewedPlacementRow {
  latestPreviewSessionId: unknown;
  latestPreviewOccurredAt: unknown;
  previewEvidenceCount: unknown;
  deepLinkingRequestCount: unknown;
  placementEventCount: unknown;
  reviewerEventCount: unknown;
  latestAuditOccurredAt: unknown;
}

export function mapD1DeepLinkingSessionFields(
  row: D1DeepLinkingSessionRow,
): DeepLinkingSessionRow {
  return {
    sessionId: expectD1String(row.sessionId, 'sessionId'),
    sessionToken: expectD1String(row.sessionToken, 'sessionToken'),
    ltiToolSessionId: expectD1NullableString(row.ltiToolSessionId, 'ltiToolSessionId'),
    deploymentRecordId: expectD1Number(row.deploymentRecordId, 'deploymentRecordId'),
    deploymentSlug: expectD1String(row.deploymentSlug, 'deploymentSlug'),
    appId: expectD1String(row.appId, 'appId'),
    userId: expectD1NullableString(row.userId, 'userId'),
    userRole: expectD1StringLiteral(row.userRole, 'userRole', ['learner', 'instructor']),
    contextId: expectD1NullableString(row.contextId, 'contextId'),
    contextTitle: expectD1NullableString(row.contextTitle, 'contextTitle'),
    deepLinkReturnUrl: expectD1String(row.deepLinkReturnUrl, 'deepLinkReturnUrl'),
    data: expectD1NullableString(row.data, 'data'),
    placement: expectD1StringLiteral(row.placement, 'placement', [
      'assignment_selection',
      'resource_selection',
    ]),
    acceptTypes: parseD1JsonField(
      row.acceptTypes,
      'acceptTypes',
      parseDeepLinkingAcceptTypes,
    ),
    acceptMultiple: expectBooleanInteger(row.acceptMultiple, 'acceptMultiple'),
    acceptPresentationDocumentTargets: parseD1JsonField(
      row.acceptPresentationDocumentTargets,
      'acceptPresentationDocumentTargets',
      parseDeepLinkingPresentationTargets,
    ),
    acceptLineItem: expectBooleanInteger(row.acceptLineItem, 'acceptLineItem'),
    selectedPackageVersionId: expectD1NullableNumber(
      row.selectedPackageVersionId,
      'selectedPackageVersionId',
    ),
    selectedPackageVersion: expectD1NullableString(
      row.selectedPackageVersion,
      'selectedPackageVersion',
    ),
    selectedActivityId: expectD1NullableString(row.selectedActivityId, 'selectedActivityId'),
    selectedContentPath: expectD1NullableString(row.selectedContentPath, 'selectedContentPath'),
    createdAt: expectD1String(row.createdAt, 'createdAt'),
    expiresAt: expectD1String(row.expiresAt, 'expiresAt'),
    usedAt: expectD1NullableString(row.usedAt, 'usedAt'),
  };
}

export function mapD1ReviewedPlacementFields(row: D1ReviewedPlacementRow): ReviewedPlacementRow {
  return {
    placementId: expectD1String(row.placementId, 'placementId'),
    deploymentRecordId: expectD1Number(row.deploymentRecordId, 'deploymentRecordId'),
    deploymentSlug: expectD1String(row.deploymentSlug, 'deploymentSlug'),
    appId: expectD1String(row.appId, 'appId'),
    contextId: expectD1NullableString(row.contextId, 'contextId'),
    contextTitle: expectD1NullableString(row.contextTitle, 'contextTitle'),
    packageVersionId: expectD1Number(row.packageVersionId, 'packageVersionId'),
    packageVersion: expectD1String(row.packageVersion, 'packageVersion'),
    packageTitle: expectD1String(row.packageTitle, 'packageTitle'),
    activityId: expectD1String(row.activityId, 'activityId'),
    contentPath: expectD1String(row.contentPath, 'contentPath'),
    contentTitle: expectD1NullableString(row.contentTitle, 'contentTitle'),
    createdByUserId: expectD1NullableString(row.createdByUserId, 'createdByUserId'),
    resourceLinkId: expectD1NullableString(row.resourceLinkId, 'resourceLinkId'),
    createdAt: expectD1String(row.createdAt, 'createdAt'),
    boundAt: expectD1NullableString(row.boundAt, 'boundAt'),
  };
}

export function mapD1PlacementAuditSnapshotFields(
  row: D1PlacementAuditSnapshotRow,
): PlacementAuditSnapshotRow {
  return {
    ...mapD1ReviewedPlacementFields(row),
    latestPreviewSessionId: expectD1NullableString(
      row.latestPreviewSessionId,
      'latestPreviewSessionId',
    ),
    latestPreviewOccurredAt: expectD1NullableString(
      row.latestPreviewOccurredAt,
      'latestPreviewOccurredAt',
    ),
    previewEvidenceCount: expectD1Number(row.previewEvidenceCount, 'previewEvidenceCount'),
    deepLinkingRequestCount: expectD1Number(row.deepLinkingRequestCount, 'deepLinkingRequestCount'),
    placementEventCount: expectD1Number(row.placementEventCount, 'placementEventCount'),
    reviewerEventCount: expectD1Number(row.reviewerEventCount, 'reviewerEventCount'),
    latestAuditOccurredAt: expectD1NullableString(
      row.latestAuditOccurredAt,
      'latestAuditOccurredAt',
    ),
  };
}

function expectBooleanInteger(value: unknown, fieldName: string): boolean {
  if (value === 0) {
    return false;
  }

  if (value === 1) {
    return true;
  }

  throw new TypeError(`Expected D1 ${fieldName} to be 0 or 1.`);
}

function parseDeepLinkingAcceptTypes(
  value: unknown,
  fieldName: string,
): DeepLinkingSessionRow['acceptTypes'] {
  return expectD1StringArray(value, fieldName).map((item, index) =>
    expectD1StringLiteral(item, `${fieldName}[${index}]`, ['ltiResourceLink'])
  );
}

function parseDeepLinkingPresentationTargets(
  value: unknown,
  fieldName: string,
): DeepLinkingSessionRow['acceptPresentationDocumentTargets'] {
  return expectD1StringArray(value, fieldName).map((item, index) =>
    expectD1StringLiteral(item, `${fieldName}[${index}]`, ['iframe', 'window', 'embed'])
  );
}
