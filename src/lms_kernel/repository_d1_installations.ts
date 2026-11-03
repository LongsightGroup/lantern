import { type D1Database, queryD1First, queryD1Objects, runD1Batch } from '../db/d1.ts';
import type { AppInstallationRepository } from './repository.ts';
import { governanceEventStatement } from './repository_d1_governance.ts';
import {
  type D1Row,
  mapCapabilityGrant,
  mapInstallation,
  requireInstallation,
} from './repository_d1_row.ts';

export function createD1AppInstallationRepository(db: D1Database): AppInstallationRepository {
  const repository: AppInstallationRepository = {
    async createInstallation(input) {
      await runD1Batch(db, [
        {
          sql: `
          INSERT INTO app_installations (
            id, institution_id, app_id, package_version_id, status,
            installed_by_user_id, installed_at, updated_at
          ) VALUES (?, ?, ?, ?, 'pending_approval', ?, ?, ?)
        `,
          parameters: [
            input.id,
            input.institutionId,
            input.appId,
            input.packageVersionId,
            input.installedByUserId,
            input.now,
            input.now,
          ],
        },
        governanceEventStatement(input.event),
      ]);
      return requireInstallation(await repository.getInstallationById(input.id), input.id);
    },

    async replaceInstallationPackageVersion(input) {
      await runD1Batch(db, [
        {
          sql: `
          UPDATE app_installations
          SET package_version_id = ?,
              status = 'pending_approval',
              installed_by_user_id = ?,
              installed_at = ?,
              activated_at = NULL,
              updated_at = ?
          WHERE id = ? AND institution_id = ?
        `,
          parameters: [
            input.packageVersionId,
            input.installedByUserId,
            input.now,
            input.now,
            input.id,
            input.institutionId,
          ],
        },
        {
          sql: `
            UPDATE governed_runtime_sessions SET runtime_expires_at = ?
            WHERE app_installation_id = ? AND institution_id = ?
              AND package_version_id <> ? AND runtime_expires_at > ?
              AND EXISTS (
                SELECT 1 FROM app_installations
                WHERE id = ? AND institution_id = ? AND package_version_id = ? AND updated_at = ?
              )
          `,
          parameters: [
            input.now,
            input.id,
            input.institutionId,
            input.packageVersionId,
            input.now,
            input.id,
            input.institutionId,
            input.packageVersionId,
            input.now,
          ],
        },
        {
          sql: `
            UPDATE capability_grants SET revoked_by_user_id = ?, revoked_at = ?
            WHERE app_installation_id = ? AND institution_id = ?
              AND package_version_id <> ? AND revoked_at IS NULL
              AND EXISTS (
                SELECT 1 FROM app_installations
                WHERE id = ? AND institution_id = ? AND package_version_id = ? AND updated_at = ?
              )
          `,
          parameters: [
            input.installedByUserId,
            input.now,
            input.id,
            input.institutionId,
            input.packageVersionId,
            input.id,
            input.institutionId,
            input.packageVersionId,
            input.now,
          ],
        },
        governanceEventStatement(input.event, {
          sql: `EXISTS (
          SELECT 1 FROM app_installations
          WHERE id = ? AND institution_id = ? AND package_version_id = ? AND updated_at = ?
        )`,
          parameters: [input.id, input.institutionId, input.packageVersionId, input.now],
        }),
      ]);
      const row = await queryD1First<D1Row>(
        db,
        `SELECT * FROM app_installations WHERE id = ? AND institution_id = ?`,
        [input.id, input.institutionId],
      );
      return row === null ? null : mapInstallation(row);
    },

    async getInstallationById(id) {
      const row = await queryD1First<D1Row>(db, `SELECT * FROM app_installations WHERE id = ?`, [
        id,
      ]);
      return row === null ? null : mapInstallation(row);
    },

    async listInstallations(institutionId) {
      const rows = await queryD1Objects<D1Row>(
        db,
        `
          SELECT * FROM app_installations
          WHERE institution_id = ?
          ORDER BY installed_at DESC, id DESC
        `,
        [institutionId],
      );
      return rows.map(mapInstallation);
    },

    async activateInstallation(input) {
      await runD1Batch(db, [
        {
          sql: `
          UPDATE app_installations
          SET status = 'active', activated_at = ?, updated_at = ?
          WHERE id = ?
        `,
          parameters: [input.activatedAt, input.activatedAt, input.id],
        },
        governanceEventStatement(input.event, {
          sql: `EXISTS (
          SELECT 1 FROM app_installations
          WHERE id = ? AND status = 'active' AND activated_at = ?
        )`,
          parameters: [input.id, input.activatedAt],
        }),
      ]);
      return await repository.getInstallationById(input.id);
    },

    async disableInstallation(input) {
      await runD1Batch(db, [
        {
          sql: `
          UPDATE app_installations
          SET status = 'disabled', updated_at = ?
          WHERE id = ? AND institution_id = ?
        `,
          parameters: [input.disabledAt, input.id, input.institutionId],
        },
        governanceEventStatement(input.event, {
          sql: `EXISTS (
          SELECT 1 FROM app_installations
          WHERE id = ? AND institution_id = ? AND status = 'disabled' AND updated_at = ?
        )`,
          parameters: [input.id, input.institutionId, input.disabledAt],
        }),
      ]);
      const installation = await repository.getInstallationById(input.id);
      return installation?.institutionId === input.institutionId ? installation : null;
    },

    async createCapabilityGrant(input) {
      const lmsContextId = input.scope.kind === 'context' ? input.scope.lmsContextId : null;
      await runD1Batch(db, [
        {
          sql: `
          INSERT INTO capability_grants (
            id, institution_id, app_installation_id, package_version_id,
            capability, scope_kind, lms_context_id, approved_by_user_id, approved_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT DO UPDATE SET
            approved_by_user_id = excluded.approved_by_user_id,
            approved_at = excluded.approved_at,
            revoked_by_user_id = NULL,
            revoked_at = NULL
        `,
          parameters: [
            input.id,
            input.institutionId,
            input.appInstallationId,
            input.packageVersionId,
            input.capability,
            input.scope.kind,
            lmsContextId,
            input.approvedByUserId,
            input.approvedAt,
          ],
        },
        governanceEventStatement(input.event),
      ]);
      const row = await queryD1First<D1Row>(
        db,
        `
          SELECT * FROM capability_grants
          WHERE app_installation_id = ?
            AND package_version_id = ?
            AND capability = ?
            AND scope_kind = ?
            AND lms_context_id IS ?
        `,
        [
          input.appInstallationId,
          input.packageVersionId,
          input.capability,
          input.scope.kind,
          lmsContextId,
        ],
      );
      if (row === null) {
        throw new Error('Capability grant was not persisted.');
      }
      return mapCapabilityGrant(row);
    },

    async revokeCapabilityGrant(input) {
      await runD1Batch(db, [
        {
          sql: `
          UPDATE capability_grants
          SET revoked_by_user_id = ?, revoked_at = ?
          WHERE id = ? AND institution_id = ? AND revoked_at IS NULL
        `,
          parameters: [input.revokedByUserId, input.revokedAt, input.id, input.institutionId],
        },
        governanceEventStatement(input.event, {
          sql: `EXISTS (
          SELECT 1 FROM capability_grants
          WHERE id = ? AND institution_id = ? AND revoked_at = ?
        )`,
          parameters: [input.id, input.institutionId, input.revokedAt],
        }),
      ]);
      const row = await queryD1First<D1Row>(
        db,
        `SELECT * FROM capability_grants WHERE id = ? AND institution_id = ?`,
        [input.id, input.institutionId],
      );
      return row === null ? null : mapCapabilityGrant(row);
    },

    async listCapabilityGrants(appInstallationId) {
      const rows = await queryD1Objects<D1Row>(
        db,
        `
          SELECT * FROM capability_grants
          WHERE app_installation_id = ?
          ORDER BY approved_at, id
        `,
        [appInstallationId],
      );
      return rows.map(mapCapabilityGrant);
    },

    async listCapabilityGrantsForInstitution(institutionId) {
      const rows = await queryD1Objects<D1Row>(
        db,
        `
          SELECT * FROM capability_grants
          WHERE institution_id = ?
          ORDER BY approved_at, id
        `,
        [institutionId],
      );
      return rows.map(mapCapabilityGrant);
    },
  };

  return repository;
}
