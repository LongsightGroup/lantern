import { type D1Database, queryD1First, queryD1Objects, runD1, runD1Batch } from '../db/d1.ts';
import type { GovernanceEventRepository } from './repository.ts';
import { addOptionalClause, type D1Row, mapGovernanceEvent } from './repository_d1_row.ts';
import type { GovernanceEventRecord } from './types.ts';

export interface GovernanceEventStatement {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

export function governanceEventStatement(
  event: Omit<GovernanceEventRecord, 'id'>,
  guard?: { readonly sql: string; readonly parameters: readonly unknown[] },
): GovernanceEventStatement {
  const placeholders = Array.from({ length: 21 }, () => '?').join(', ');
  return {
    sql: `
      INSERT INTO governance_events (
        trace_id, event_type, institution_id, lms_connection_id,
        lms_context_id, app_installation_id, app_id, package_version_id,
        runtime_session_id, actor_type, actor_id, capability,
        capability_grant_id, decision, outcome, connector_kind,
        object_count, latency_ms, error_code, request_metadata, occurred_at
      ) SELECT ${placeholders}${guard === undefined ? '' : ` WHERE ${guard.sql}`}
    `,
    parameters: [
      event.traceId,
      event.eventType,
      event.institutionId,
      event.lmsConnectionId,
      event.lmsContextId,
      event.appInstallationId,
      event.appId,
      event.packageVersionId,
      event.runtimeSessionId,
      event.actorType,
      event.actorId,
      event.capability,
      event.capabilityGrantId,
      event.decision,
      event.outcome,
      event.connectorKind,
      event.objectCount,
      event.latencyMs,
      event.errorCode,
      event.requestMetadata,
      event.occurredAt,
      ...(guard?.parameters ?? []),
    ],
  };
}

export function createD1GovernanceEventRepository(db: D1Database): GovernanceEventRepository {
  return {
    async appendGovernanceEvents(events) {
      if (events.length === 0) return;
      await runD1Batch(
        db,
        events.map((event) => governanceEventStatement(event)),
      );
    },

    async appendGovernanceEvent(event) {
      const statement = governanceEventStatement(event);
      await runD1(db, statement.sql, statement.parameters);
      const row = await queryD1First<D1Row>(
        db,
        `
          SELECT * FROM governance_events
          WHERE trace_id = ?
          ORDER BY id DESC
          LIMIT 1
        `,
        [event.traceId],
      );
      if (row === null) {
        throw new Error('Governance event was not persisted.');
      }
      return mapGovernanceEvent(row);
    },

    async listGovernanceEvents(filter) {
      const clauses = ['institution_id = ?'];
      const parameters: unknown[] = [filter.institutionId];
      addOptionalClause(clauses, parameters, 'trace_id', filter.traceId);
      addOptionalClause(clauses, parameters, 'lms_connection_id', filter.lmsConnectionId);
      addOptionalClause(clauses, parameters, 'app_installation_id', filter.appInstallationId);
      addOptionalClause(clauses, parameters, 'capability', filter.capability);
      addOptionalClause(clauses, parameters, 'decision', filter.decision);
      addOptionalClause(clauses, parameters, 'outcome', filter.outcome);
      if (filter.occurredAfter !== undefined) {
        clauses.push('occurred_at >= ?');
        parameters.push(filter.occurredAfter);
      }
      if (filter.occurredBefore !== undefined) {
        clauses.push('occurred_at < ?');
        parameters.push(filter.occurredBefore);
      }
      const limit = Math.max(1, Math.min(filter.limit ?? 100, 200));
      parameters.push(limit);

      const rows = await queryD1Objects<D1Row>(
        db,
        `
          SELECT * FROM governance_events
          WHERE ${clauses.join(' AND ')}
          ORDER BY ${
            filter.traceId === undefined ? 'occurred_at DESC, id DESC' : 'occurred_at ASC, id ASC'
          }
          LIMIT ?
        `,
        parameters,
      );
      return rows.map(mapGovernanceEvent);
    },
  };
}
