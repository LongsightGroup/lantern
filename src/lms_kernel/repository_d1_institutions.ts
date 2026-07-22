import { type D1Database, queryD1First, queryD1Objects, runD1Batch } from '../db/d1.ts';
import type { InstitutionRepository } from './repository.ts';
import { governanceEventStatement } from './repository_d1_governance.ts';
import {
  type D1Row,
  mapInstitution,
  mapMembership,
  requireInstitution,
} from './repository_d1_row.ts';

export function createD1InstitutionRepository(db: D1Database): InstitutionRepository {
  const repository: InstitutionRepository = {
    async createInstitutionWithOwner(input) {
      await runD1Batch(db, [
        {
          sql: `
            INSERT INTO institutions (id, slug, name, status, created_at, updated_at)
            VALUES (?, ?, ?, 'active', ?, ?)
          `,
          parameters: [input.id, input.slug, input.name, input.now, input.now],
        },
        {
          sql: `
            INSERT INTO institution_memberships (
              institution_id, user_id, role, created_at
            ) VALUES (?, ?, 'owner', ?)
          `,
          parameters: [input.id, input.ownerUserId, input.now],
        },
        governanceEventStatement(input.event),
      ]);

      return requireInstitution(await repository.getInstitutionById(input.id), input.id);
    },

    async getInstitutionById(id) {
      const row = await queryD1First<D1Row>(
        db,
        `SELECT * FROM institutions WHERE id = ?`,
        [id],
      );
      return row === null ? null : mapInstitution(row);
    },

    async listMembershipsForUser(userId) {
      const rows = await queryD1Objects<D1Row>(
        db,
        `
          SELECT institution_id, user_id, role, created_at
          FROM institution_memberships
          WHERE user_id = ?
          ORDER BY created_at, institution_id
        `,
        [userId],
      );
      return rows.map(mapMembership);
    },

    async getMembership(institutionId, userId) {
      const row = await queryD1First<D1Row>(
        db,
        `
          SELECT institution_id, user_id, role, created_at
          FROM institution_memberships
          WHERE institution_id = ? AND user_id = ?
        `,
        [institutionId, userId],
      );
      return row === null ? null : mapMembership(row);
    },

    async createInvite(input) {
      await runD1Batch(db, [{
        sql: `
          INSERT INTO institution_invites (
            id, institution_id, token_hash, role, created_by_user_id,
            created_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        parameters: [
          input.id,
          input.institutionId,
          input.tokenHash,
          input.role,
          input.createdByUserId,
          input.createdAt,
          input.expiresAt,
        ],
      }, governanceEventStatement(input.event)]);
    },

    async acceptInvite(input) {
      const results = await runD1Batch(db, [
        {
          sql: `
            INSERT INTO institution_memberships (
              institution_id, user_id, role, created_at
            )
            SELECT institution_id, ?, role, ?
            FROM institution_invites
            WHERE token_hash = ?
              AND accepted_at IS NULL
              AND expires_at > ?
            ON CONFLICT (user_id) DO NOTHING
          `,
          parameters: [input.userId, input.acceptedAt, input.tokenHash, input.acceptedAt],
        },
        {
          sql: `
            UPDATE institution_invites
            SET accepted_by_user_id = ?, accepted_at = ?, acceptance_trace_id = ?
            WHERE token_hash = ?
              AND accepted_at IS NULL
              AND expires_at > ?
              AND EXISTS (
                SELECT 1
                FROM institution_memberships membership
                WHERE membership.institution_id = institution_invites.institution_id
                  AND membership.user_id = ?
              )
          `,
          parameters: [
            input.userId,
            input.acceptedAt,
            input.traceId,
            input.tokenHash,
            input.acceptedAt,
            input.userId,
          ],
        },
        {
          sql: `
            INSERT INTO governance_events (
              trace_id, event_type, institution_id, actor_type, actor_id,
              outcome, request_metadata, occurred_at
            )
            SELECT ?, 'institution_invite.accepted', institution_id,
                   'user', ?, 'completed', '{}', ?
            FROM institution_invites
            WHERE token_hash = ?
              AND accepted_by_user_id = ?
              AND accepted_at = ?
              AND acceptance_trace_id = ?
          `,
          parameters: [
            input.traceId,
            input.userId,
            input.acceptedAt,
            input.tokenHash,
            input.userId,
            input.acceptedAt,
            input.traceId,
          ],
        },
      ]);
      if (readD1Changes(results[1]?.meta) !== 1) {
        return null;
      }

      const row = await queryD1First<D1Row>(
        db,
        `
          SELECT membership.institution_id, membership.user_id,
                 membership.role, membership.created_at
          FROM institution_memberships membership
          JOIN institution_invites invite
            ON invite.institution_id = membership.institution_id
          WHERE invite.token_hash = ?
            AND invite.accepted_by_user_id = ?
            AND invite.accepted_at = ?
            AND invite.acceptance_trace_id = ?
        `,
        [input.tokenHash, input.userId, input.acceptedAt, input.traceId],
      );
      return row === null ? null : mapMembership(row);
    },
  };

  return repository;
}

function readD1Changes(meta: Record<string, unknown> | undefined): number {
  const changes = meta?.changes;
  return typeof changes === 'number' ? changes : 0;
}
