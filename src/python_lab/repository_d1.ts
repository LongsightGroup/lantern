import { type D1Database, queryD1First, queryD1Objects, runD1, runD1Batch } from '../db/d1.ts';
import {
  expectD1JsonRecord,
  expectD1NullableNumber,
  expectD1NullableString,
  expectD1Number,
  expectD1String,
  expectD1StringLiteral,
  parseD1JsonField,
} from '../db/d1_row.ts';
import type { CodeSubmissionEvaluation } from './service.ts';
import type {
  CodeAssignmentDefinitionRecord,
  CodeSubmissionRunRecord,
  PythonLabAccessRequestRecord,
  PythonLabRecord,
  PythonLabRepository,
  PythonLabRequestStatus,
} from './repository.ts';

const LAB_STATES = ['generating', 'ready', 'failed', 'expired'] as const;
const REQUEST_STATUSES = ['new', 'contacted', 'closed'] as const;

export function createD1PythonLabRepository(db: D1Database): PythonLabRepository {
  return {
    async reserveLab(input) {
      const statements: Array<{ sql: string; parameters: readonly unknown[] }> =
        input.ipWindowStartedAt === null
          ? []
          : [
              {
                sql: `INSERT INTO python_lab_rate_limits (
            request_ip_hash, window_started_at, created_at
          ) VALUES (?, ?, ?)`,
                parameters: [input.lab.requestIpHash, input.ipWindowStartedAt, input.lab.createdAt],
              },
            ];
      statements.push({
        sql: `INSERT INTO python_lab_trials (
          lab_id, visitor_hash, visitor_day, request_ip_hash, access_token_hash, state, author_draft,
          package_version_id, private_artifact_key, failure_message, created_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        parameters: [
          input.lab.labId,
          input.lab.visitorHash,
          input.visitorDay,
          input.lab.requestIpHash,
          input.lab.accessTokenHash,
          input.lab.state,
          input.lab.authorDraft,
          input.lab.packageVersionId,
          input.lab.privateArtifactKey,
          input.lab.failureMessage,
          input.lab.createdAt,
          input.lab.updatedAt,
          input.lab.expiresAt,
        ],
      });

      try {
        await runD1Batch(db, statements);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';

        if (message.includes('python_lab_trials.visitor_hash')) {
          return { status: 'visitor_limited' };
        }

        if (message.includes('python_lab_rate_limits.request_ip_hash')) {
          return { status: 'ip_limited' };
        }

        throw error;
      }

      return { status: 'accepted', lab: input.lab };
    },
    async getLabById(labId) {
      return mapOptionalLab(
        await queryD1First(db, 'SELECT * FROM python_lab_trials WHERE lab_id = ?', [labId]),
      );
    },
    async markLabReady(input) {
      await runD1(
        db,
        `UPDATE python_lab_trials
         SET state = 'ready', package_version_id = ?, private_artifact_key = ?,
             failure_message = NULL, updated_at = ?
         WHERE lab_id = ?`,
        [input.packageVersionId, input.privateArtifactKey, input.updatedAt, input.labId],
      );
      return await requireLab(db, input.labId);
    },
    async markLabFailed(input) {
      await runD1(
        db,
        `UPDATE python_lab_trials
         SET state = 'failed', failure_message = ?,
             package_version_id = COALESCE(?, package_version_id), updated_at = ?
         WHERE lab_id = ?`,
        [input.failureMessage, input.packageVersionId ?? null, input.updatedAt, input.labId],
      );
      return await requireLab(db, input.labId);
    },
    async listExpiredLabs(now) {
      return (
        await queryD1Objects<Record<string, unknown>>(
          db,
          'SELECT * FROM python_lab_trials WHERE expires_at <= ?',
          [now],
        )
      ).map(mapLabRow);
    },
    async deleteLab(labId) {
      await runD1(db, 'DELETE FROM python_lab_trials WHERE lab_id = ?', [labId]);
    },
    async createCodeAssignmentDefinition(record) {
      await runD1(
        db,
        `INSERT INTO code_assignment_definitions (
          package_version_id, function_name, private_artifact_key, created_at
        ) VALUES (?, ?, ?, ?)`,
        [record.packageVersionId, record.functionName, record.privateArtifactKey, record.createdAt],
      );
      return record;
    },
    async getCodeAssignmentDefinitionByPackageVersionId(packageVersionId) {
      return mapOptionalDefinition(
        await queryD1First<Record<string, unknown>>(
          db,
          'SELECT * FROM code_assignment_definitions WHERE package_version_id = ?',
          [packageVersionId],
        ),
      );
    },
    async reserveCodeSubmissionRun(record) {
      try {
        await runD1(
          db,
          `INSERT INTO code_submission_runs (
            run_id, attempt_id, source_artifact_key, phase, public_outcomes,
            hidden_summary, score_given, score_maximum, created_at, source_persisted_at, finalized_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            record.runId,
            record.attemptId,
            record.sourceArtifactKey,
            record.phase,
            record.publicOutcomes,
            record.hiddenSummary,
            record.scoreGiven,
            record.scoreMaximum,
            record.createdAt,
            record.sourcePersistedAt,
            record.finalizedAt,
          ],
        );
        return { status: 'created', run: record };
      } catch (error) {
        if (!isFinalRunUniqueViolation(error)) {
          throw error;
        }

        const existing = await requireFinalRun(db, record.attemptId);
        return { status: 'existing', run: existing };
      }
    },
    async markCodeSubmissionSourcePersisted(input) {
      await runD1(
        db,
        `UPDATE code_submission_runs
         SET source_persisted_at = ?
         WHERE run_id = ? AND source_persisted_at IS NULL`,
        [input.sourcePersistedAt, input.runId],
      );
      return await requireRunById(db, input.runId);
    },
    async deleteUnpersistedCodeSubmissionRun(runId) {
      await runD1(
        db,
        'DELETE FROM code_submission_runs WHERE run_id = ? AND source_persisted_at IS NULL',
        [runId],
      );
    },
    async getFinalCodeSubmissionRunByAttemptId(attemptId) {
      return mapOptionalRun(
        await queryD1First<Record<string, unknown>>(
          db,
          `SELECT * FROM code_submission_runs
         WHERE attempt_id = ? AND phase = 'final' LIMIT 1`,
          [attemptId],
        ),
      );
    },
    async listSubmissionArtifactKeysByPackageVersionId(packageVersionId) {
      const rows = await queryD1Objects<Record<string, unknown>>(
        db,
        `SELECT code_submission_runs.source_artifact_key
         FROM code_submission_runs
         INNER JOIN attempts ON attempts.attempt_id = code_submission_runs.attempt_id
         WHERE attempts.package_version_id = ?`,
        [packageVersionId],
      );

      return rows.map((row) =>
        expectD1String(row.source_artifact_key, 'code_submission_runs.source_artifact_key'),
      );
    },
    async createAccessRequest(record) {
      await runD1(
        db,
        `INSERT INTO python_lab_access_requests (
          request_id, lab_id, name, work_email, institution, status, created_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.requestId,
          record.labId,
          record.name,
          record.workEmail,
          record.institution,
          record.status,
          record.createdAt,
          record.updatedAt,
          record.expiresAt,
        ],
      );
      return record;
    },
    async listAccessRequests() {
      return (
        await queryD1Objects<Record<string, unknown>>(
          db,
          'SELECT * FROM python_lab_access_requests ORDER BY created_at DESC',
        )
      ).map(mapAccessRequestRow);
    },
    async updateAccessRequestStatus(input) {
      await runD1(
        db,
        'UPDATE python_lab_access_requests SET status = ?, updated_at = ? WHERE request_id = ?',
        [input.status, input.updatedAt, input.requestId],
      );
      const row = await queryD1First<Record<string, unknown>>(
        db,
        'SELECT * FROM python_lab_access_requests WHERE request_id = ?',
        [input.requestId],
      );

      if (row === null) {
        throw new Error('Python Lab access request was not found.');
      }

      return mapAccessRequestRow(row);
    },
    async listExpiredAccessRequests(now) {
      return (
        await queryD1Objects<Record<string, unknown>>(
          db,
          'SELECT * FROM python_lab_access_requests WHERE expires_at <= ?',
          [now],
        )
      ).map(mapAccessRequestRow);
    },
    async deleteAccessRequest(requestId) {
      await runD1(db, 'DELETE FROM python_lab_access_requests WHERE request_id = ?', [requestId]);
    },
  };
}

async function requireLab(db: D1Database, labId: string): Promise<PythonLabRecord> {
  const lab = mapOptionalLab(
    await queryD1First<Record<string, unknown>>(
      db,
      'SELECT * FROM python_lab_trials WHERE lab_id = ?',
      [labId],
    ),
  );

  if (lab === null) {
    throw new Error('Python Lab was not found.');
  }

  return lab;
}

async function requireFinalRun(
  db: D1Database,
  attemptId: string,
): Promise<CodeSubmissionRunRecord> {
  const run = mapOptionalRun(
    await queryD1First<Record<string, unknown>>(
      db,
      `SELECT * FROM code_submission_runs
       WHERE attempt_id = ? AND phase = 'final' LIMIT 1`,
      [attemptId],
    ),
  );

  if (run === null) {
    throw new Error('A final Python submission run was not found after a duplicate reservation.');
  }

  return run;
}

async function requireRunById(db: D1Database, runId: string): Promise<CodeSubmissionRunRecord> {
  const run = mapOptionalRun(
    await queryD1First<Record<string, unknown>>(
      db,
      'SELECT * FROM code_submission_runs WHERE run_id = ?',
      [runId],
    ),
  );

  if (run === null) {
    throw new Error('Python submission run was not found.');
  }

  return run;
}

function mapOptionalLab(row: Record<string, unknown> | null): PythonLabRecord | null {
  return row === null ? null : mapLabRow(row);
}

function mapLabRow(row: Record<string, unknown>): PythonLabRecord {
  const authorDraft = parseD1JsonField(
    row.author_draft,
    'python_lab_trials.author_draft',
    (value) => {
      const record = expectD1JsonRecord(value, 'python_lab_trials.author_draft');
      return {
        title: expectD1String(record.title, 'python_lab_trials.author_draft.title'),
        prompt: expectD1String(record.prompt, 'python_lab_trials.author_draft.prompt'),
        starterCode: expectD1String(
          record.starterCode,
          'python_lab_trials.author_draft.starterCode',
        ),
        functionName: expectD1String(
          record.functionName,
          'python_lab_trials.author_draft.functionName',
        ),
      };
    },
  );

  return {
    labId: expectD1String(row.lab_id, 'python_lab_trials.lab_id'),
    visitorHash: expectD1String(row.visitor_hash, 'python_lab_trials.visitor_hash'),
    requestIpHash: expectD1NullableString(row.request_ip_hash, 'python_lab_trials.request_ip_hash'),
    accessTokenHash: expectD1String(row.access_token_hash, 'python_lab_trials.access_token_hash'),
    state: expectD1StringLiteral(row.state, 'python_lab_trials.state', LAB_STATES),
    authorDraft,
    packageVersionId: expectD1NullableNumber(
      row.package_version_id,
      'python_lab_trials.package_version_id',
    ),
    privateArtifactKey: expectD1NullableString(
      row.private_artifact_key,
      'python_lab_trials.private_artifact_key',
    ),
    failureMessage: expectD1NullableString(
      row.failure_message,
      'python_lab_trials.failure_message',
    ),
    createdAt: expectD1String(row.created_at, 'python_lab_trials.created_at'),
    updatedAt: expectD1String(row.updated_at, 'python_lab_trials.updated_at'),
    expiresAt: expectD1String(row.expires_at, 'python_lab_trials.expires_at'),
  };
}

function mapOptionalDefinition(
  row: Record<string, unknown> | null,
): CodeAssignmentDefinitionRecord | null {
  if (row === null) {
    return null;
  }

  return {
    packageVersionId: expectD1Number(
      row.package_version_id,
      'code_assignment_definitions.package_version_id',
    ),
    functionName: expectD1String(row.function_name, 'code_assignment_definitions.function_name'),
    privateArtifactKey: expectD1String(
      row.private_artifact_key,
      'code_assignment_definitions.private_artifact_key',
    ),
    createdAt: expectD1String(row.created_at, 'code_assignment_definitions.created_at'),
  };
}

function mapOptionalRun(row: Record<string, unknown> | null): CodeSubmissionRunRecord | null {
  if (row === null) {
    return null;
  }

  return {
    runId: expectD1String(row.run_id, 'code_submission_runs.run_id'),
    attemptId: expectD1String(row.attempt_id, 'code_submission_runs.attempt_id'),
    sourceArtifactKey: expectD1String(
      row.source_artifact_key,
      'code_submission_runs.source_artifact_key',
    ),
    phase: expectD1StringLiteral(row.phase, 'code_submission_runs.phase', ['final'] as const),
    publicOutcomes: parseD1JsonField(
      row.public_outcomes,
      'code_submission_runs.public_outcomes',
      parsePublicOutcomes,
    ),
    hiddenSummary: parseD1JsonField(
      row.hidden_summary,
      'code_submission_runs.hidden_summary',
      parseHiddenSummary,
    ),
    scoreGiven: expectD1Number(row.score_given, 'code_submission_runs.score_given'),
    scoreMaximum: expectD1Number(row.score_maximum, 'code_submission_runs.score_maximum'),
    createdAt: expectD1String(row.created_at, 'code_submission_runs.created_at'),
    sourcePersistedAt: expectD1NullableString(
      row.source_persisted_at,
      'code_submission_runs.source_persisted_at',
    ),
    finalizedAt: expectD1String(row.finalized_at, 'code_submission_runs.finalized_at'),
  };
}

function isFinalRunUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('UNIQUE constraint failed') &&
    error.message.includes('code_submission_runs.attempt_id')
  );
}

function parsePublicOutcomes(
  value: unknown,
  fieldName: string,
): CodeSubmissionEvaluation['publicOutcomes'] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected D1 ${fieldName} to be an array.`);
  }

  return value.map((item) => {
    const record = expectD1JsonRecord(item, fieldName);
    const status = expectD1StringLiteral(record.status, `${fieldName}.status`, [
      'passed',
      'failed',
    ] as const);
    const message = expectD1NullableString(record.message, `${fieldName}.message`);

    return {
      label: expectD1String(record.label, `${fieldName}.label`),
      status,
      message,
    };
  });
}

function parseHiddenSummary(
  value: unknown,
  fieldName: string,
): NonNullable<CodeSubmissionEvaluation['hiddenSummary']> {
  const record = expectD1JsonRecord(value, fieldName);
  return {
    passed: expectD1Number(record.passed, `${fieldName}.passed`),
    total: expectD1Number(record.total, `${fieldName}.total`),
  };
}

function mapAccessRequestRow(row: Record<string, unknown>): PythonLabAccessRequestRecord {
  return {
    requestId: expectD1String(row.request_id, 'python_lab_access_requests.request_id'),
    labId: expectD1String(row.lab_id, 'python_lab_access_requests.lab_id'),
    name: expectD1String(row.name, 'python_lab_access_requests.name'),
    workEmail: expectD1String(row.work_email, 'python_lab_access_requests.work_email'),
    institution: expectD1String(row.institution, 'python_lab_access_requests.institution'),
    status: expectD1StringLiteral(
      row.status,
      'python_lab_access_requests.status',
      REQUEST_STATUSES,
    ) as PythonLabRequestStatus,
    createdAt: expectD1String(row.created_at, 'python_lab_access_requests.created_at'),
    updatedAt: expectD1String(row.updated_at, 'python_lab_access_requests.updated_at'),
    expiresAt: expectD1String(row.expires_at, 'python_lab_access_requests.expires_at'),
  };
}
