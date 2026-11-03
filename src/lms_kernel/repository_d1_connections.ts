import { type D1Database, queryD1First, queryD1Objects, runD1, runD1Batch } from '../db/d1.ts';
import type { LmsConnectionRepository } from './repository.ts';
import { governanceEventStatement } from './repository_d1_governance.ts';
import {
  type D1Row,
  mapConnection,
  mapLmsContext,
  requireConnection,
} from './repository_d1_row.ts';

export function createD1LmsConnectionRepository(db: D1Database): LmsConnectionRepository {
  const repository: LmsConnectionRepository = {
    async createLmsConnection(input) {
      await runD1Batch(db, [
        {
          sql: `
          INSERT INTO lms_connections (
            id, institution_id, label, platform_type, issuer, lms_origin, client_id,
            deployment_id, authorization_endpoint, access_token_url, jwks_url,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `,
          parameters: [
            input.id,
            input.institutionId,
            input.label,
            input.platformType,
            input.issuer,
            input.lmsOrigin,
            input.clientId,
            input.deploymentId,
            input.authorizationEndpoint,
            input.accessTokenUrl,
            input.jwksUrl,
            input.now,
            input.now,
          ],
        },
        governanceEventStatement(input.event),
      ]);
      return requireConnection(await repository.getLmsConnectionById(input.id), input.id);
    },

    async getLmsConnectionById(id) {
      const row = await queryD1First<D1Row>(db, `SELECT * FROM lms_connections WHERE id = ?`, [id]);
      return row === null ? null : mapConnection(row);
    },

    async getLmsConnectionByPlatformIdentity(input) {
      const row = await queryD1First<D1Row>(
        db,
        `
          SELECT * FROM lms_connections
          WHERE issuer = ? AND client_id = ? AND deployment_id = ?
        `,
        [input.issuer, input.clientId, input.deploymentId],
      );
      return row === null ? null : mapConnection(row);
    },

    async listLmsConnections(institutionId) {
      const rows = await queryD1Objects<D1Row>(
        db,
        `
          SELECT * FROM lms_connections
          WHERE institution_id = ?
          ORDER BY label, id
        `,
        [institutionId],
      );
      return rows.map(mapConnection);
    },

    async activateLmsConnection(input) {
      await runD1Batch(db, [
        {
          sql: `
          UPDATE lms_connections
          SET status = 'active', validated_at = ?, updated_at = ?
          WHERE id = ?
        `,
          parameters: [input.validatedAt, input.validatedAt, input.id],
        },
        governanceEventStatement(input.event, {
          sql: `EXISTS (
          SELECT 1 FROM lms_connections
          WHERE id = ? AND status = 'active' AND validated_at = ?
        )`,
          parameters: [input.id, input.validatedAt],
        }),
      ]);
      return await repository.getLmsConnectionById(input.id);
    },

    async disableLmsConnection(input) {
      await runD1Batch(db, [
        {
          sql: `
          UPDATE lms_connections
          SET status = 'disabled', updated_at = ?
          WHERE id = ? AND institution_id = ?
        `,
          parameters: [input.disabledAt, input.id, input.institutionId],
        },
        governanceEventStatement(input.event, {
          sql: `EXISTS (
          SELECT 1 FROM lms_connections
          WHERE id = ? AND institution_id = ? AND status = 'disabled' AND updated_at = ?
        )`,
          parameters: [input.id, input.institutionId, input.disabledAt],
        }),
      ]);
      const connection = await repository.getLmsConnectionById(input.id);
      return connection?.institutionId === input.institutionId ? connection : null;
    },

    async getOrCreateLmsContext(input) {
      await runD1(
        db,
        `
          INSERT INTO lms_contexts (
            id, institution_id, lms_connection_id, provider_context_id,
            label, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (lms_connection_id, provider_context_id) DO UPDATE SET
            label = excluded.label,
            updated_at = excluded.updated_at
        `,
        [
          input.id,
          input.institutionId,
          input.lmsConnectionId,
          input.providerContextId,
          input.label,
          input.now,
          input.now,
        ],
      );
      const row = await queryD1First<D1Row>(
        db,
        `
          SELECT * FROM lms_contexts
          WHERE lms_connection_id = ? AND provider_context_id = ?
        `,
        [input.lmsConnectionId, input.providerContextId],
      );
      if (row === null) {
        throw new Error('LMS context was not persisted.');
      }
      return mapLmsContext(row);
    },

    async listLmsContexts(institutionId) {
      const rows = await queryD1Objects<D1Row>(
        db,
        `
          SELECT * FROM lms_contexts
          WHERE institution_id = ?
          ORDER BY label, id
        `,
        [institutionId],
      );
      return rows.map(mapLmsContext);
    },

    async getLmsContextById(id) {
      const row = await queryD1First<D1Row>(db, `SELECT * FROM lms_contexts WHERE id = ?`, [id]);
      return row === null ? null : mapLmsContext(row);
    },
  };

  return repository;
}
