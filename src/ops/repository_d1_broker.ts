import type { D1Database } from '../db/d1.ts';
import { queryD1First, runD1 } from '../db/d1.ts';
import {
  type D1CertificationWorkflowStatusRow,
  type D1InternalBrokerVerificationRow,
  type D1LatestOfficialCertificationEvidenceRow,
  type D1OfficialBrokerVerificationRow,
  mapD1CertificationWorkflowStatusRow,
  mapD1InternalBrokerVerificationRow,
  mapD1LatestOfficialCertificationEvidenceRow,
  mapD1OfficialBrokerVerificationRow,
} from './repository_d1_mapping.ts';
import {
  assertBrokerVerificationRunInput,
  mapBrokerVerificationStatusRows,
  mapCertificationWorkflowStatusRow,
  mapLatestOfficialCertificationEvidenceRow,
} from './repository_mapping.ts';
import type {
  CertificationWorkflowStatusRow,
  RecordBrokerVerificationRunInput,
} from './repository_types.ts';

export async function listCertificationWorkflowStatusesForD1(db: D1Database) {
  const workflowKeys = ['core', 'deepLinking', 'nrps', 'ags'] as const;
  const rows: CertificationWorkflowStatusRow[] = [];

  for (const workflowKey of workflowKeys) {
    const row = await queryD1First<D1CertificationWorkflowStatusRow>(
      db,
      `
        SELECT
          ? AS workflowKey,
          broker_verification_runs.deployment_record_id AS deploymentRecordId,
          deployments.label AS deploymentLabel,
          broker_verification_runs.status,
          broker_verification_runs.summary,
          broker_verification_runs.detail_url AS detailUrl,
          broker_verification_runs.checked_at AS checkedAt
        FROM broker_verification_runs
        LEFT JOIN deployments
          ON deployments.id = broker_verification_runs.deployment_record_id
        WHERE broker_verification_runs.workflow_key = ?
          AND broker_verification_runs.deployment_record_id IS NOT NULL
          AND broker_verification_runs.source IN ('manual', 'ci')
        ORDER BY broker_verification_runs.checked_at DESC, broker_verification_runs.id DESC
        LIMIT 1
      `,
      [workflowKey, workflowKey],
    );

    rows.push(
      row === null
        ? {
          workflowKey,
          deploymentRecordId: null,
          deploymentLabel: null,
          status: null,
          summary: null,
          detailUrl: null,
          checkedAt: null,
        }
        : mapD1CertificationWorkflowStatusRow(row),
    );
  }

  return rows.map((row) => mapCertificationWorkflowStatusRow(row));
}

export async function getLatestOfficialCertificationEvidenceForD1(db: D1Database) {
  const row = await queryD1First<D1LatestOfficialCertificationEvidenceRow>(
    db,
    `
      SELECT
        workflow_key AS workflowKey,
        status,
        certification_state AS certificationState,
        summary,
        detail_url AS detailUrl,
        checked_at AS checkedAt
      FROM broker_verification_runs
      WHERE source = '1edtech'
        AND workflow_key IS NOT NULL
      ORDER BY checked_at DESC, id DESC
      LIMIT 1
    `,
  );

  return mapLatestOfficialCertificationEvidenceRow(
    row === null ? null : mapD1LatestOfficialCertificationEvidenceRow(row),
  );
}

export async function getLatestBrokerVerificationStatusForD1(db: D1Database) {
  const internalRow = await queryD1First<D1InternalBrokerVerificationRow>(
    db,
    `
      SELECT
        scope,
        source,
        status,
        summary,
        detail_url AS detailUrl,
        checked_at AS checkedAt
      FROM broker_verification_runs
      WHERE deployment_record_id IS NOT NULL
        AND source IN ('manual', 'ci')
      ORDER BY checked_at DESC, id DESC
      LIMIT 1
    `,
  );

  if (internalRow !== null) {
    const internal = mapD1InternalBrokerVerificationRow(internalRow);
    const officialRow = await queryD1First<D1OfficialBrokerVerificationRow>(
      db,
      `
        SELECT
          scope,
          status,
          certification_state AS certificationState,
          detail_url AS detailUrl,
          checked_at AS checkedAt
        FROM broker_verification_runs
        WHERE scope = ?
          AND source = '1edtech'
        ORDER BY checked_at DESC, id DESC
        LIMIT 1
      `,
      [internal.scope],
    );

    return mapBrokerVerificationStatusRows(
      internal,
      officialRow === null ? null : mapD1OfficialBrokerVerificationRow(officialRow),
    );
  }

  const officialRow = await queryD1First<D1OfficialBrokerVerificationRow>(
    db,
    `
      SELECT
        scope,
        status,
        certification_state AS certificationState,
        detail_url AS detailUrl,
        checked_at AS checkedAt
      FROM broker_verification_runs
      WHERE source = '1edtech'
      ORDER BY checked_at DESC, id DESC
      LIMIT 1
    `,
  );

  return mapBrokerVerificationStatusRows(
    null,
    officialRow === null ? null : mapD1OfficialBrokerVerificationRow(officialRow),
  );
}

export async function recordBrokerVerificationRunForD1(
  db: D1Database,
  input: RecordBrokerVerificationRunInput,
): Promise<void> {
  assertBrokerVerificationRunInput(input);
  await runD1(
    db,
    `
      INSERT INTO broker_verification_runs (
        deployment_record_id,
        scope,
        workflow_key,
        source,
        status,
        summary,
        detail_url,
        certification_state,
        checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.deploymentRecordId,
      input.scope,
      input.workflowKey,
      input.source,
      input.status,
      input.summary,
      input.detailUrl,
      input.certificationState,
      input.checkedAt,
    ],
  );
}
