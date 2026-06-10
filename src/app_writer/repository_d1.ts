import type { D1Database } from '../db/d1.ts';
import { queryD1First, runD1 } from '../db/d1.ts';
import { readAppWriterSelectedContext } from './context.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import {
  APP_GENERATION_STATUSES,
  APP_WRITER_STARTER_IDS,
  type AppGenerationModelRequestMetadata,
  type AppGenerationPlanStep,
  type AppGenerationRunRecord,
  type AppGenerationValidationFinding,
  type AppGenerationWorkspaceRecord,
  type AppWriterWorkspaceFile,
} from './types.ts';
import {
  expectNullableNumber,
  expectNullableString,
  expectNumber,
  expectRecord,
  expectString,
  expectStringArray,
  parseAppGenerationPlan,
  parseGenerationPlanSteps,
  parseModelRequestMetadata,
  parseNormalizedRequest,
  parseValidationFindings,
  parseWorkspaceFiles,
} from './binding_result.ts';

export function createD1AppGenerationRepositoryMethods(
  db: D1Database,
): Pick<
  PackageReviewRepository,
  | 'createAppGenerationRun'
  | 'getAppGenerationRunById'
  | 'updateAppGenerationRun'
  | 'saveAppGenerationWorkspace'
  | 'getAppGenerationWorkspaceByGenerationId'
> {
  return {
    async createAppGenerationRun(record) {
      try {
        await runD1(
          db,
          `
            INSERT INTO app_generation_runs (
              generation_id,
              owner_id,
              status,
              requested_app_id,
              generated_app_id,
              generated_version,
              package_version_id,
              prompt_text,
              normalized_request_json,
              app_plan_json,
              selected_starter_id,
              selected_context_json,
              model_request_metadata_json,
              generation_notes_json,
              validation_findings_json,
              repair_attempt_count,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          serializeAppGenerationRun(record),
        );
      } catch (error) {
        if (isD1UniqueViolation(error)) {
          throw new Error(
            `App generation run ${record.generationId} already exists and cannot be replaced.`,
          );
        }

        throw error;
      }

      return await requireAppGenerationRun(db, record.generationId);
    },

    async getAppGenerationRunById(generationId) {
      const row = await queryAppGenerationRunRow(db, generationId);

      return row === null ? null : mapD1AppGenerationRunFields(row);
    },

    async updateAppGenerationRun(record) {
      await runD1(
        db,
        `
          UPDATE app_generation_runs
          SET
            owner_id = ?,
            status = ?,
            requested_app_id = ?,
            generated_app_id = ?,
            generated_version = ?,
            package_version_id = ?,
            prompt_text = ?,
            normalized_request_json = ?,
            app_plan_json = ?,
            selected_starter_id = ?,
            selected_context_json = ?,
            model_request_metadata_json = ?,
            generation_notes_json = ?,
            validation_findings_json = ?,
            repair_attempt_count = ?,
            created_at = ?,
            updated_at = ?
          WHERE generation_id = ?
        `,
        [...serializeAppGenerationRun(record).slice(1), record.generationId],
      );

      return await requireAppGenerationRun(db, record.generationId);
    },

    async saveAppGenerationWorkspace(record) {
      await runD1(
        db,
        `
          INSERT INTO app_generation_workspaces (
            generation_id,
            selected_starter_id,
            files_json,
            generation_plan_json,
            validation_findings_json,
            repair_attempt_count,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(generation_id) DO UPDATE SET
            selected_starter_id = excluded.selected_starter_id,
            files_json = excluded.files_json,
            generation_plan_json = excluded.generation_plan_json,
            validation_findings_json = excluded.validation_findings_json,
            repair_attempt_count = excluded.repair_attempt_count,
            updated_at = excluded.updated_at
        `,
        serializeAppGenerationWorkspace(record),
      );

      return await requireAppGenerationWorkspace(db, record.generationId);
    },

    async getAppGenerationWorkspaceByGenerationId(generationId) {
      const row = await queryAppGenerationWorkspaceRow(db, generationId);

      return row === null ? null : mapD1AppGenerationWorkspaceFields(row);
    },
  };
}

const D1_APP_GENERATION_RUN_SELECT = `
  SELECT
    generation_id AS generationId,
    owner_id AS ownerId,
    status,
    requested_app_id AS requestedAppId,
    generated_app_id AS generatedAppId,
    generated_version AS generatedVersion,
    package_version_id AS packageVersionId,
    prompt_text AS promptText,
    normalized_request_json AS normalizedRequestJson,
    app_plan_json AS appPlanJson,
    selected_starter_id AS selectedStarterId,
    selected_context_json AS selectedContextJson,
    model_request_metadata_json AS modelRequestMetadataJson,
    generation_notes_json AS generationNotesJson,
    validation_findings_json AS validationFindingsJson,
    repair_attempt_count AS repairAttemptCount,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM app_generation_runs
`;

interface D1AppGenerationRunRow extends Record<string, unknown> {
  generationId: unknown;
  ownerId: unknown;
  status: unknown;
  requestedAppId: unknown;
  generatedAppId: unknown;
  generatedVersion: unknown;
  packageVersionId: unknown;
  promptText: unknown;
  normalizedRequestJson: unknown;
  appPlanJson: unknown;
  selectedStarterId: unknown;
  selectedContextJson: unknown;
  modelRequestMetadataJson: unknown;
  generationNotesJson: unknown;
  validationFindingsJson: unknown;
  repairAttemptCount: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

const D1_APP_GENERATION_WORKSPACE_SELECT = `
  SELECT
    generation_id AS generationId,
    selected_starter_id AS selectedStarterId,
    files_json AS filesJson,
    generation_plan_json AS generationPlanJson,
    validation_findings_json AS validationFindingsJson,
    repair_attempt_count AS repairAttemptCount,
    updated_at AS updatedAt
  FROM app_generation_workspaces
`;

interface D1AppGenerationWorkspaceRow extends Record<string, unknown> {
  generationId: unknown;
  selectedStarterId: unknown;
  filesJson: unknown;
  generationPlanJson: unknown;
  validationFindingsJson: unknown;
  repairAttemptCount: unknown;
  updatedAt: unknown;
}

async function queryAppGenerationRunRow(
  db: D1Database,
  generationId: string,
): Promise<D1AppGenerationRunRow | null> {
  return await queryD1First<D1AppGenerationRunRow>(
    db,
    `${D1_APP_GENERATION_RUN_SELECT} WHERE generation_id = ?`,
    [generationId],
  );
}

async function requireAppGenerationRun(
  db: D1Database,
  generationId: string,
): Promise<AppGenerationRunRecord> {
  const row = await queryAppGenerationRunRow(db, generationId);

  if (row === null) {
    throw new Error(`App generation run ${generationId} was not found.`);
  }

  return mapD1AppGenerationRunFields(row);
}

async function queryAppGenerationWorkspaceRow(
  db: D1Database,
  generationId: string,
): Promise<D1AppGenerationWorkspaceRow | null> {
  return await queryD1First<D1AppGenerationWorkspaceRow>(
    db,
    `${D1_APP_GENERATION_WORKSPACE_SELECT} WHERE generation_id = ?`,
    [generationId],
  );
}

async function requireAppGenerationWorkspace(
  db: D1Database,
  generationId: string,
): Promise<AppGenerationWorkspaceRecord> {
  const row = await queryAppGenerationWorkspaceRow(db, generationId);

  if (row === null) {
    throw new Error(`App generation workspace ${generationId} was not found.`);
  }

  return mapD1AppGenerationWorkspaceFields(row);
}

function serializeAppGenerationRun(record: AppGenerationRunRecord): unknown[] {
  return [
    record.generationId,
    record.ownerId,
    record.status,
    record.requestedAppId,
    record.generatedAppId,
    record.generatedVersion,
    record.packageVersionId,
    record.promptText,
    record.normalizedRequest,
    record.appPlan,
    record.selectedStarterId,
    record.selectedContext,
    record.modelRequestMetadata,
    record.generationNotes,
    record.validationFindings,
    record.repairAttemptCount,
    record.createdAt,
    record.updatedAt,
  ];
}

function mapD1AppGenerationRunFields(row: D1AppGenerationRunRow): AppGenerationRunRecord {
  return {
    generationId: expectString(row.generationId, 'generationId'),
    ownerId: expectString(row.ownerId, 'ownerId'),
    status: expectStringLiteral(row.status, 'status', APP_GENERATION_STATUSES),
    requestedAppId: expectNullableString(row.requestedAppId, 'requestedAppId'),
    generatedAppId: expectNullableString(row.generatedAppId, 'generatedAppId'),
    generatedVersion: expectNullableString(row.generatedVersion, 'generatedVersion'),
    packageVersionId: expectNullableNumber(row.packageVersionId, 'packageVersionId'),
    promptText: expectString(row.promptText, 'promptText'),
    normalizedRequest: parseNullableJsonField(
      row.normalizedRequestJson,
      'normalizedRequestJson',
      (value) => parseNormalizedRequest(value, 'normalizedRequest'),
    ),
    appPlan: parseNullableJsonField(
      row.appPlanJson,
      'appPlanJson',
      (value) => parseAppGenerationPlan(value, 'appPlan'),
    ),
    selectedStarterId: expectNullableStringLiteral(
      row.selectedStarterId,
      'selectedStarterId',
      APP_WRITER_STARTER_IDS,
    ),
    selectedContext: readAppWriterSelectedContext(
      parseJsonObjectField(row.selectedContextJson, 'selectedContextJson'),
      expectNullableStringLiteral(
        row.selectedStarterId,
        'selectedStarterId',
        APP_WRITER_STARTER_IDS,
      ),
    ),
    modelRequestMetadata: parseModelRequestMetadataField(
      row.modelRequestMetadataJson,
      'modelRequestMetadataJson',
    ),
    generationNotes: parseStringArrayField(row.generationNotesJson, 'generationNotesJson'),
    validationFindings: parseValidationFindingsField(
      row.validationFindingsJson,
      'validationFindingsJson',
    ),
    repairAttemptCount: expectNumber(row.repairAttemptCount, 'repairAttemptCount'),
    createdAt: expectString(row.createdAt, 'createdAt'),
    updatedAt: expectString(row.updatedAt, 'updatedAt'),
  };
}

function serializeAppGenerationWorkspace(record: AppGenerationWorkspaceRecord): unknown[] {
  return [
    record.generationId,
    record.selectedStarterId,
    record.files,
    record.generationPlan,
    record.validationFindings,
    record.repairAttemptCount,
    record.updatedAt,
  ];
}

function mapD1AppGenerationWorkspaceFields(
  row: D1AppGenerationWorkspaceRow,
): AppGenerationWorkspaceRecord {
  return {
    generationId: expectString(row.generationId, 'generationId'),
    selectedStarterId: expectStringLiteral(
      row.selectedStarterId,
      'selectedStarterId',
      APP_WRITER_STARTER_IDS,
    ),
    files: parseWorkspaceFilesField(row.filesJson, 'filesJson'),
    generationPlan: parseGenerationPlanField(row.generationPlanJson, 'generationPlanJson'),
    validationFindings: parseValidationFindingsField(
      row.validationFindingsJson,
      'validationFindingsJson',
    ),
    repairAttemptCount: expectNumber(row.repairAttemptCount, 'repairAttemptCount'),
    updatedAt: expectString(row.updatedAt, 'updatedAt'),
  };
}

function parseWorkspaceFilesField(value: unknown, fieldName: string): AppWriterWorkspaceFile[] {
  return parseWorkspaceFiles(parseJsonField(value, fieldName), fieldName);
}

function parseGenerationPlanField(value: unknown, fieldName: string): AppGenerationPlanStep[] {
  return parseGenerationPlanSteps(parseJsonField(value, fieldName), fieldName);
}

function parseValidationFindingsField(
  value: unknown,
  fieldName: string,
): AppGenerationValidationFinding[] {
  return parseValidationFindings(parseJsonField(value, fieldName), fieldName);
}

function parseModelRequestMetadataField(
  value: unknown,
  fieldName: string,
): AppGenerationModelRequestMetadata[] {
  return parseModelRequestMetadata(parseJsonField(value, fieldName), fieldName);
}

function parseNullableJsonField<T>(
  value: unknown,
  fieldName: string,
  parse: (value: unknown) => T,
): T | null {
  if (value === null) {
    return null;
  }

  return parse(parseJsonField(value, fieldName));
}

function parseJsonObjectField(value: unknown, fieldName: string): Record<string, unknown> {
  return expectRecord(parseJsonField(value, fieldName), fieldName);
}

function parseStringArrayField(value: unknown, fieldName: string): string[] {
  return expectStringArray(parseJsonField(value, fieldName), fieldName);
}

function parseJsonField(value: unknown, fieldName: string): unknown {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected D1 ${fieldName} to be JSON text.`);
  }

  return JSON.parse(value);
}

function expectStringLiteral<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`Unexpected ${fieldName} value.`);
  }

  return value as T;
}

function expectNullableStringLiteral<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T | null {
  if (value === null) {
    return null;
  }

  return expectStringLiteral(value, fieldName, allowed);
}

function isD1UniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}
