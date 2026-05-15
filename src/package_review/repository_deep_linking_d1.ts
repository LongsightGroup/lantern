import type { D1Database } from '../db/d1.ts';
import { queryD1First, queryD1Objects, runD1 } from '../db/d1.ts';
import { mapOptionalPlacementAuditSnapshot } from './repository_mappers_review.ts';
import {
  mapDeepLinkingSessionRow,
  mapOptionalDeepLinkingSession,
  mapOptionalReviewedPlacement,
  mapReviewedPlacementRow,
} from './repository_mappers_sessions.ts';
import type {
  DeepLinkingSessionRow,
  PlacementAuditSnapshotRow,
  ReviewedPlacementRow,
} from './repository_row_types.ts';
import {
  buildDeepLinkingResourceOptions,
  sortPackageVersions,
} from './repository_resource_options.ts';
import type { PackageReviewRepository } from './repository.ts';
import {
  D1_PACKAGE_VERSION_SELECT,
  type D1PackageVersionRow,
  mapD1PackageVersionRow,
} from './repository_package_versions_d1.ts';

export function createD1DeepLinkingRepositoryMethods(
  db: D1Database,
): Pick<
  PackageReviewRepository,
  | 'createDeepLinkingSession'
  | 'getDeepLinkingSessionById'
  | 'consumeDeepLinkingSession'
  | 'updateDeepLinkingSessionSelection'
  | 'listDeepLinkingResourceOptions'
  | 'createReviewedPlacement'
  | 'getReviewedPlacementById'
  | 'listReviewedPlacementsByPackageVersion'
  | 'getPlacementAuditSnapshotById'
  | 'requirePlacementAuditSnapshotById'
  | 'bindReviewedPlacementResourceLink'
> {
  const methods: Pick<
    PackageReviewRepository,
    | 'createDeepLinkingSession'
    | 'getDeepLinkingSessionById'
    | 'consumeDeepLinkingSession'
    | 'updateDeepLinkingSessionSelection'
    | 'listDeepLinkingResourceOptions'
    | 'createReviewedPlacement'
    | 'getReviewedPlacementById'
    | 'listReviewedPlacementsByPackageVersion'
    | 'getPlacementAuditSnapshotById'
    | 'requirePlacementAuditSnapshotById'
    | 'bindReviewedPlacementResourceLink'
  > = {
    async createDeepLinkingSession(record) {
      try {
        await runD1(
          db,
          `
            INSERT INTO deep_linking_sessions (
              session_id,
              session_token,
              deployment_record_id,
              deployment_slug,
              app_id,
              user_id,
              user_role,
              context_id,
              context_title,
              deep_link_return_url,
              data,
              placement,
              accept_types,
              accept_multiple,
              accept_presentation_document_targets,
              accept_line_item,
              selected_package_version_id,
              selected_package_version,
              selected_activity_id,
              selected_content_path,
              created_at,
              expires_at,
              used_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            record.sessionId,
            record.sessionToken,
            record.deploymentRecordId,
            record.deploymentSlug,
            record.appId,
            record.userId,
            record.userRole,
            record.contextId,
            record.contextTitle,
            record.deepLinkReturnUrl,
            record.data,
            record.placement,
            record.acceptTypes,
            record.acceptMultiple,
            record.acceptPresentationDocumentTargets,
            record.acceptLineItem,
            record.selection?.packageVersionId ?? null,
            record.selection?.packageVersion ?? null,
            record.selection?.activityId ?? null,
            record.selection?.contentPath ?? null,
            record.createdAt,
            record.expiresAt,
            record.usedAt,
          ],
        );
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          throw new Error(
            `Deep Linking session ${record.sessionId} already exists and cannot be replaced.`,
          );
        }

        throw error;
      }

      return await requireDeepLinkingSession(db, record.sessionId);
    },

    async getDeepLinkingSessionById(sessionId) {
      const row = await queryD1First<D1DeepLinkingSessionRow>(
        db,
        `${D1_DEEP_LINKING_SESSION_SELECT} WHERE session_id = ?`,
        [sessionId],
      );

      return mapOptionalDeepLinkingSession(
        row === null ? undefined : mapD1DeepLinkingSessionFields(row),
      );
    },

    async consumeDeepLinkingSession(input) {
      await runD1(
        db,
        `
          UPDATE deep_linking_sessions
          SET used_at = ?
          WHERE session_id = ?
            AND used_at IS NULL
        `,
        [input.usedAt, input.sessionId],
      );

      const existing = await requireDeepLinkingSession(db, input.sessionId);

      if (existing.usedAt === input.usedAt) {
        return existing;
      }

      if (existing.usedAt !== null) {
        throw new Error(`Deep Linking session ${input.sessionId} has already been used.`);
      }

      throw new Error(`Deep Linking session ${input.sessionId} could not be consumed.`);
    },

    async updateDeepLinkingSessionSelection(input) {
      await runD1(
        db,
        `
          UPDATE deep_linking_sessions
          SET
            selected_package_version_id = ?,
            selected_package_version = ?,
            selected_activity_id = ?,
            selected_content_path = ?
          WHERE session_id = ?
            AND used_at IS NULL
        `,
        [
          input.selection?.packageVersionId ?? null,
          input.selection?.packageVersion ?? null,
          input.selection?.activityId ?? null,
          input.selection?.contentPath ?? null,
          input.sessionId,
        ],
      );

      const existing = await requireDeepLinkingSession(db, input.sessionId);

      if (existing.usedAt !== null) {
        throw new Error(`Deep Linking session ${input.sessionId} has already been used.`);
      }

      return existing;
    },

    async listDeepLinkingResourceOptions(appId, placement) {
      const installScope = placement === 'assignment_selection' ? 'assignment' : 'course';
      const rows = await queryD1Objects<D1PackageVersionRow>(
        db,
        `
          ${D1_PACKAGE_VERSION_SELECT}
          WHERE app_id = ?
            AND install_scope = ?
            AND approval_status = 'approved'
            AND reviewed_at IS NOT NULL
        `,
        [appId, installScope],
      );

      return buildDeepLinkingResourceOptions(
        sortPackageVersions(rows.map(mapD1PackageVersionRow)),
        placement,
      );
    },

    async createReviewedPlacement(record) {
      try {
        await runD1(
          db,
          `
            INSERT INTO reviewed_placements (
              placement_id,
              deployment_record_id,
              deployment_slug,
              app_id,
              context_id,
              context_title,
              package_version_id,
              package_version,
              package_title,
              activity_id,
              content_path,
              content_title,
              created_by_user_id,
              resource_link_id,
              created_at,
              bound_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            record.placementId,
            record.deploymentRecordId,
            record.deploymentSlug,
            record.appId,
            record.contextId,
            record.contextTitle,
            record.packageVersionId,
            record.packageVersion,
            record.packageTitle,
            record.activityId,
            record.contentPath,
            record.contentTitle,
            record.createdByUserId,
            record.resourceLinkId,
            record.createdAt,
            record.boundAt,
          ],
        );
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          throw new Error(
            `Reviewed placement ${record.placementId} already exists and cannot be replaced.`,
          );
        }

        throw error;
      }

      return await requireReviewedPlacement(db, record.placementId);
    },

    async getReviewedPlacementById(placementId) {
      const row = await queryD1First<D1ReviewedPlacementRow>(
        db,
        `${D1_REVIEWED_PLACEMENT_SELECT} WHERE placement_id = ?`,
        [placementId],
      );

      return mapOptionalReviewedPlacement(
        row === null ? undefined : mapD1ReviewedPlacementFields(row),
      );
    },

    async listReviewedPlacementsByPackageVersion(packageVersionId) {
      const rows = await queryD1Objects<D1ReviewedPlacementRow>(
        db,
        `${D1_REVIEWED_PLACEMENT_SELECT} WHERE package_version_id = ? ORDER BY created_at DESC, placement_id ASC`,
        [packageVersionId],
      );

      return rows.map((row) => mapReviewedPlacementRow(mapD1ReviewedPlacementFields(row)));
    },

    async getPlacementAuditSnapshotById(placementId) {
      const row = await queryD1First<D1PlacementAuditSnapshotRow>(
        db,
        `${D1_PLACEMENT_AUDIT_SNAPSHOT_SELECT} WHERE reviewed_placements.placement_id = ?`,
        [placementId],
      );

      return mapOptionalPlacementAuditSnapshot(
        row === null ? undefined : mapD1PlacementAuditSnapshotFields(row),
      );
    },

    async requirePlacementAuditSnapshotById(placementId) {
      const snapshot = await methods.getPlacementAuditSnapshotById(placementId);

      if (snapshot === null) {
        throw new Error(`Reviewed placement ${placementId} was not found.`);
      }

      return snapshot;
    },

    async bindReviewedPlacementResourceLink(input) {
      const existing = await requireReviewedPlacement(db, input.placementId);

      if (existing.resourceLinkId !== null && existing.resourceLinkId !== input.resourceLinkId) {
        throw new Error(
          `Reviewed placement ${input.placementId} is already bound to Canvas resource link ${existing.resourceLinkId}.`,
        );
      }

      if (existing.resourceLinkId === input.resourceLinkId) {
        return existing;
      }

      try {
        await runD1(
          db,
          `
            UPDATE reviewed_placements
            SET
              resource_link_id = ?,
              bound_at = ?
            WHERE placement_id = ?
          `,
          [input.resourceLinkId, input.boundAt, input.placementId],
        );
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          throw new Error(
            `Canvas resource link ${input.resourceLinkId} is already bound to another reviewed placement in deployment ${existing.deploymentSlug}.`,
          );
        }

        throw error;
      }

      return await requireReviewedPlacement(db, input.placementId);
    },
  };

  return methods;
}

const D1_DEEP_LINKING_SESSION_SELECT = `
  SELECT
    session_id AS sessionId,
    session_token AS sessionToken,
    deployment_record_id AS deploymentRecordId,
    deployment_slug AS deploymentSlug,
    app_id AS appId,
    user_id AS userId,
    user_role AS userRole,
    context_id AS contextId,
    context_title AS contextTitle,
    deep_link_return_url AS deepLinkReturnUrl,
    data,
    placement,
    accept_types AS acceptTypes,
    accept_multiple AS acceptMultiple,
    accept_presentation_document_targets AS acceptPresentationDocumentTargets,
    accept_line_item AS acceptLineItem,
    selected_package_version_id AS selectedPackageVersionId,
    selected_package_version AS selectedPackageVersion,
    selected_activity_id AS selectedActivityId,
    selected_content_path AS selectedContentPath,
    created_at AS createdAt,
    expires_at AS expiresAt,
    used_at AS usedAt
  FROM deep_linking_sessions
`;

const D1_REVIEWED_PLACEMENT_SELECT = `
  SELECT
    placement_id AS placementId,
    deployment_record_id AS deploymentRecordId,
    deployment_slug AS deploymentSlug,
    app_id AS appId,
    context_id AS contextId,
    context_title AS contextTitle,
    package_version_id AS packageVersionId,
    package_version AS packageVersion,
    package_title AS packageTitle,
    activity_id AS activityId,
    content_path AS contentPath,
    content_title AS contentTitle,
    created_by_user_id AS createdByUserId,
    resource_link_id AS resourceLinkId,
    created_at AS createdAt,
    bound_at AS boundAt
  FROM reviewed_placements
`;

const LATEST_PREVIEW_SESSION_ID = `
  SELECT preview_sessions.session_id
  FROM preview_sessions
  WHERE preview_sessions.package_version_id = reviewed_placements.package_version_id
  ORDER BY preview_sessions.created_at DESC, preview_sessions.session_id DESC
  LIMIT 1
`;

const D1_PLACEMENT_AUDIT_SNAPSHOT_SELECT = `
  SELECT
    reviewed_placements.placement_id AS placementId,
    reviewed_placements.deployment_record_id AS deploymentRecordId,
    reviewed_placements.deployment_slug AS deploymentSlug,
    reviewed_placements.app_id AS appId,
    reviewed_placements.context_id AS contextId,
    reviewed_placements.context_title AS contextTitle,
    reviewed_placements.package_version_id AS packageVersionId,
    reviewed_placements.package_version AS packageVersion,
    reviewed_placements.package_title AS packageTitle,
    reviewed_placements.activity_id AS activityId,
    reviewed_placements.content_path AS contentPath,
    reviewed_placements.content_title AS contentTitle,
    reviewed_placements.created_by_user_id AS createdByUserId,
    reviewed_placements.resource_link_id AS resourceLinkId,
    reviewed_placements.created_at AS createdAt,
    reviewed_placements.bound_at AS boundAt,
    (${LATEST_PREVIEW_SESSION_ID}) AS latestPreviewSessionId,
    (
      SELECT MAX(preview_evidence.occurred_at)
      FROM preview_evidence
      WHERE preview_evidence.preview_session_id = (${LATEST_PREVIEW_SESSION_ID})
    ) AS latestPreviewOccurredAt,
    (
      SELECT COUNT(*)
      FROM preview_evidence
      WHERE preview_evidence.preview_session_id = (${LATEST_PREVIEW_SESSION_ID})
    ) AS previewEvidenceCount,
    (
      SELECT COUNT(*)
      FROM audit_events
      WHERE audit_events.deployment_record_id = reviewed_placements.deployment_record_id
        AND audit_events.package_version_id = reviewed_placements.package_version_id
        AND audit_events.event_type LIKE 'deep_linking.request.%'
    ) AS deepLinkingRequestCount,
    (
      SELECT COUNT(*)
      FROM audit_events
      WHERE audit_events.deployment_record_id = reviewed_placements.deployment_record_id
        AND audit_events.package_version_id = reviewed_placements.package_version_id
        AND audit_events.event_type LIKE 'deep_linking.placement.%'
        AND json_extract(audit_events.detail, '$.placementId') = reviewed_placements.placement_id
    ) AS placementEventCount,
    (
      SELECT COUNT(*)
      FROM audit_events
      WHERE audit_events.deployment_record_id = reviewed_placements.deployment_record_id
        AND audit_events.package_version_id = reviewed_placements.package_version_id
        AND audit_events.event_type LIKE 'reviewer.%'
        AND json_extract(audit_events.detail, '$.placementId') = reviewed_placements.placement_id
    ) AS reviewerEventCount,
    (
      SELECT MAX(audit_events.occurred_at)
      FROM audit_events
      WHERE audit_events.deployment_record_id = reviewed_placements.deployment_record_id
        AND audit_events.package_version_id = reviewed_placements.package_version_id
        AND (
          audit_events.event_type LIKE 'deep_linking.request.%'
          OR audit_events.event_type LIKE 'deep_linking.placement.%'
          OR audit_events.event_type LIKE 'reviewer.%'
        )
    ) AS latestAuditOccurredAt
  FROM reviewed_placements
`;

interface D1DeepLinkingSessionRow extends Record<string, unknown> {
  sessionId: unknown;
  sessionToken: unknown;
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

interface D1ReviewedPlacementRow extends Record<string, unknown> {
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

interface D1PlacementAuditSnapshotRow extends D1ReviewedPlacementRow {
  latestPreviewSessionId: unknown;
  latestPreviewOccurredAt: unknown;
  previewEvidenceCount: unknown;
  deepLinkingRequestCount: unknown;
  placementEventCount: unknown;
  reviewerEventCount: unknown;
  latestAuditOccurredAt: unknown;
}

async function requireDeepLinkingSession(db: D1Database, sessionId: string) {
  const row = await queryD1First<D1DeepLinkingSessionRow>(
    db,
    `${D1_DEEP_LINKING_SESSION_SELECT} WHERE session_id = ?`,
    [sessionId],
  );

  if (row === null) {
    throw new Error(`Deep Linking session ${sessionId} was not found.`);
  }

  return mapDeepLinkingSessionRow(mapD1DeepLinkingSessionFields(row));
}

async function requireReviewedPlacement(db: D1Database, placementId: string) {
  const row = await queryD1First<D1ReviewedPlacementRow>(
    db,
    `${D1_REVIEWED_PLACEMENT_SELECT} WHERE placement_id = ?`,
    [placementId],
  );

  if (row === null) {
    throw new Error(`Reviewed placement ${placementId} was not found.`);
  }

  return mapReviewedPlacementRow(mapD1ReviewedPlacementFields(row));
}

function mapD1DeepLinkingSessionFields(row: D1DeepLinkingSessionRow): DeepLinkingSessionRow {
  return {
    sessionId: expectString(row.sessionId, 'sessionId'),
    sessionToken: expectString(row.sessionToken, 'sessionToken'),
    deploymentRecordId: expectNumber(row.deploymentRecordId, 'deploymentRecordId'),
    deploymentSlug: expectString(row.deploymentSlug, 'deploymentSlug'),
    appId: expectString(row.appId, 'appId'),
    userId: expectNullableString(row.userId, 'userId'),
    userRole: expectStringLiteral(row.userRole, 'userRole', ['learner', 'instructor']),
    contextId: expectNullableString(row.contextId, 'contextId'),
    contextTitle: expectNullableString(row.contextTitle, 'contextTitle'),
    deepLinkReturnUrl: expectString(row.deepLinkReturnUrl, 'deepLinkReturnUrl'),
    data: expectNullableString(row.data, 'data'),
    placement: expectStringLiteral(row.placement, 'placement', [
      'assignment_selection',
      'resource_selection',
    ]),
    acceptTypes: parseJsonField(
      row.acceptTypes,
      'acceptTypes',
    ) as DeepLinkingSessionRow['acceptTypes'],
    acceptMultiple: expectBooleanInteger(row.acceptMultiple, 'acceptMultiple'),
    acceptPresentationDocumentTargets: parseJsonField(
      row.acceptPresentationDocumentTargets,
      'acceptPresentationDocumentTargets',
    ) as DeepLinkingSessionRow['acceptPresentationDocumentTargets'],
    acceptLineItem: expectBooleanInteger(row.acceptLineItem, 'acceptLineItem'),
    selectedPackageVersionId: expectNullableNumber(
      row.selectedPackageVersionId,
      'selectedPackageVersionId',
    ),
    selectedPackageVersion: expectNullableString(
      row.selectedPackageVersion,
      'selectedPackageVersion',
    ),
    selectedActivityId: expectNullableString(row.selectedActivityId, 'selectedActivityId'),
    selectedContentPath: expectNullableString(row.selectedContentPath, 'selectedContentPath'),
    createdAt: expectString(row.createdAt, 'createdAt'),
    expiresAt: expectString(row.expiresAt, 'expiresAt'),
    usedAt: expectNullableString(row.usedAt, 'usedAt'),
  };
}

function mapD1ReviewedPlacementFields(row: D1ReviewedPlacementRow): ReviewedPlacementRow {
  return {
    placementId: expectString(row.placementId, 'placementId'),
    deploymentRecordId: expectNumber(row.deploymentRecordId, 'deploymentRecordId'),
    deploymentSlug: expectString(row.deploymentSlug, 'deploymentSlug'),
    appId: expectString(row.appId, 'appId'),
    contextId: expectNullableString(row.contextId, 'contextId'),
    contextTitle: expectNullableString(row.contextTitle, 'contextTitle'),
    packageVersionId: expectNumber(row.packageVersionId, 'packageVersionId'),
    packageVersion: expectString(row.packageVersion, 'packageVersion'),
    packageTitle: expectString(row.packageTitle, 'packageTitle'),
    activityId: expectString(row.activityId, 'activityId'),
    contentPath: expectString(row.contentPath, 'contentPath'),
    contentTitle: expectNullableString(row.contentTitle, 'contentTitle'),
    createdByUserId: expectNullableString(row.createdByUserId, 'createdByUserId'),
    resourceLinkId: expectNullableString(row.resourceLinkId, 'resourceLinkId'),
    createdAt: expectString(row.createdAt, 'createdAt'),
    boundAt: expectNullableString(row.boundAt, 'boundAt'),
  };
}

function mapD1PlacementAuditSnapshotFields(
  row: D1PlacementAuditSnapshotRow,
): PlacementAuditSnapshotRow {
  return {
    ...mapD1ReviewedPlacementFields(row),
    latestPreviewSessionId: expectNullableString(
      row.latestPreviewSessionId,
      'latestPreviewSessionId',
    ),
    latestPreviewOccurredAt: expectNullableString(
      row.latestPreviewOccurredAt,
      'latestPreviewOccurredAt',
    ),
    previewEvidenceCount: expectNumber(row.previewEvidenceCount, 'previewEvidenceCount'),
    deepLinkingRequestCount: expectNumber(row.deepLinkingRequestCount, 'deepLinkingRequestCount'),
    placementEventCount: expectNumber(row.placementEventCount, 'placementEventCount'),
    reviewerEventCount: expectNumber(row.reviewerEventCount, 'reviewerEventCount'),
    latestAuditOccurredAt: expectNullableString(row.latestAuditOccurredAt, 'latestAuditOccurredAt'),
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

function expectNullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  return expectNumber(value, fieldName);
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
