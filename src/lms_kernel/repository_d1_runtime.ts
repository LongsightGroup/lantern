import { type D1Database, queryD1First, runD1, runD1Batch } from '../db/d1.ts';
import type { GovernedRuntimeRepository } from './repository.ts';
import { governanceEventStatement } from './repository_d1_governance.ts';
import {
  type D1Row,
  mapContinuation,
  mapGovernedRuntimeSession,
  mapProtectedMediaReference,
  requireString,
} from './repository_d1_row.ts';

export function createD1GovernedRuntimeRepository(db: D1Database): GovernedRuntimeRepository {
  const repository: GovernedRuntimeRepository = {
    async getGovernedRuntimeSession(input) {
      const row = await queryD1First<D1Row>(
        db,
        `
          SELECT
            governed_runtime_sessions.runtime_session_id,
            governed_runtime_sessions.runtime_session_token,
            governed_runtime_sessions.launch_trace_id,
            governed_runtime_sessions.runtime_expires_at,
            governed_runtime_sessions.app_id,
            governed_runtime_sessions.package_version_id,
            governed_runtime_sessions.package_version,
            governed_runtime_sessions.package_capabilities,
            governed_runtime_sessions.lti_tool_session_id,
            governed_runtime_sessions.nrps_context_memberships_url,
            governed_runtime_sessions.nrps_service_versions,
            governed_runtime_sessions.connector_kind,
            governed_runtime_sessions.institution_id,
            governed_runtime_sessions.lms_connection_id,
            governed_runtime_sessions.lms_context_id,
            governed_runtime_sessions.app_installation_id,
            governed_runtime_sessions.actor_subject_id,
            governed_runtime_sessions.actor_type,
            institutions.status AS institution_status,
            lms_connections.status AS connection_status,
            lms_connections.platform_type,
            lms_connections.lms_origin,
            app_installations.status AS installation_status
          FROM governed_runtime_sessions
          JOIN institutions
            ON institutions.id = governed_runtime_sessions.institution_id
          JOIN lms_connections
            ON lms_connections.id = governed_runtime_sessions.lms_connection_id
          JOIN app_installations
            ON app_installations.id = governed_runtime_sessions.app_installation_id
            AND app_installations.package_version_id = governed_runtime_sessions.package_version_id
            AND app_installations.app_id = governed_runtime_sessions.app_id
          WHERE governed_runtime_sessions.runtime_session_id = ?
            AND governed_runtime_sessions.runtime_session_token = ?
        `,
        [input.runtimeSessionId, input.runtimeSessionToken],
      );
      return row === null ? null : mapGovernedRuntimeSession(row);
    },

    async createGovernedRuntimeSession(input) {
      const session = input.session;
      await runD1Batch(db, [
        {
          sql: `
          INSERT INTO governed_runtime_sessions (
            runtime_session_id, runtime_session_token, launch_trace_id, runtime_expires_at,
            institution_id, lms_connection_id, lms_context_id, app_installation_id,
            app_id, package_version_id, package_version, package_capabilities,
            actor_subject_id, actor_type, lti_tool_session_id,
            nrps_context_memberships_url, nrps_service_versions, connector_kind, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          parameters: [
            session.runtimeSessionId,
            session.runtimeSessionToken,
            session.launchTraceId,
            session.runtimeExpiresAt,
            session.institutionId,
            session.lmsConnectionId,
            session.lmsContextId,
            session.appInstallationId,
            session.appId,
            session.packageVersionId,
            session.packageVersion,
            session.packageCapabilities,
            session.actorSubjectId,
            session.actorType,
            session.ltiToolSessionId,
            session.nrpsContextMembershipsUrl,
            session.nrpsServiceVersions,
            session.connectorKind,
            input.createdAt,
          ],
        },
        governanceEventStatement(input.event),
      ]);
      const stored = await repository.getGovernedRuntimeSession({
        runtimeSessionId: session.runtimeSessionId,
        runtimeSessionToken: session.runtimeSessionToken,
      });
      if (stored === null) {
        throw new Error('Governed runtime session was not persisted.');
      }
      return stored;
    },

    async getOrCreateSubjectIdentity(input) {
      await runD1(
        db,
        `
          INSERT INTO subject_identities (
            id, institution_id, lms_connection_id, provider_subject_id,
            created_at, last_seen_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (lms_connection_id, provider_subject_id) DO UPDATE SET
            last_seen_at = excluded.last_seen_at
        `,
        [
          input.id,
          input.institutionId,
          input.lmsConnectionId,
          input.providerSubjectId,
          input.now,
          input.now,
        ],
      );
      const row = await queryD1First<D1Row>(
        db,
        `
          SELECT id FROM subject_identities
          WHERE lms_connection_id = ? AND provider_subject_id = ?
        `,
        [input.lmsConnectionId, input.providerSubjectId],
      );
      if (row === null) {
        throw new Error('Subject identity was not persisted.');
      }
      return requireString(row, 'id');
    },

    async saveRosterContinuation(input) {
      await runD1(
        db,
        `
          INSERT INTO roster_continuations (
            id, runtime_session_id, app_installation_id, package_version_id,
            connector_kind, continuation_value, created_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          input.id,
          input.runtimeSessionId,
          input.appInstallationId,
          input.packageVersionId,
          input.connectorKind,
          input.continuationValue,
          new Date().toISOString(),
          input.expiresAt,
        ],
      );
    },

    async getRosterContinuation(id) {
      const row = await queryD1First<D1Row>(db, `SELECT * FROM roster_continuations WHERE id = ?`, [
        id,
      ]);
      return row === null ? null : mapContinuation(row);
    },

    async saveProtectedMediaReference(input) {
      await runD1(
        db,
        `
          INSERT INTO protected_media_refs (
            id, trace_id, institution_id, lms_connection_id, lms_context_id,
            runtime_session_id, app_installation_id, package_version_id,
            subject_identity_id, actor_subject_id, actor_type, connector_kind,
            source_url, created_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          input.id,
          input.traceId,
          input.institutionId,
          input.lmsConnectionId,
          input.lmsContextId,
          input.runtimeSessionId,
          input.appInstallationId,
          input.packageVersionId,
          input.subjectIdentityId,
          input.actorSubjectId,
          input.actorType,
          input.connectorKind,
          input.sourceUrl,
          new Date().toISOString(),
          input.expiresAt,
        ],
      );
    },

    async getAuthorizedProtectedMediaReference(input) {
      const row = await queryD1First<D1Row>(
        db,
        `
          SELECT protected_media_refs.*
          FROM protected_media_refs
          JOIN governed_runtime_sessions
            ON governed_runtime_sessions.runtime_session_id =
              protected_media_refs.runtime_session_id
          JOIN institutions
            ON institutions.id = protected_media_refs.institution_id
          JOIN lms_connections
            ON lms_connections.id = governed_runtime_sessions.lms_connection_id
          JOIN app_installations
            ON app_installations.id = protected_media_refs.app_installation_id
            AND app_installations.package_version_id = protected_media_refs.package_version_id
            AND app_installations.package_version_id = governed_runtime_sessions.package_version_id
          WHERE protected_media_refs.id = ?
            AND protected_media_refs.expires_at > ?
            AND governed_runtime_sessions.runtime_expires_at > ?
            AND institutions.status = 'active'
            AND lms_connections.status = 'active'
            AND app_installations.status = 'active'
            AND EXISTS (
              SELECT 1
              FROM capability_grants
              WHERE capability_grants.app_installation_id =
                  protected_media_refs.app_installation_id
                AND capability_grants.package_version_id =
                  protected_media_refs.package_version_id
                AND capability_grants.capability = 'lms.roster.profile_photo.read'
                AND capability_grants.revoked_at IS NULL
                AND (
                  capability_grants.scope_kind = 'institution'
                  OR capability_grants.lms_context_id =
                    governed_runtime_sessions.lms_context_id
                )
            )
        `,
        [input.id, input.now, input.now],
      );
      return row === null ? null : mapProtectedMediaReference(row);
    },
  };

  return repository;
}
