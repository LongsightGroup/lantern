import {
  expectD1NullableNumber,
  expectD1NullableString,
  expectD1NullableStringLiteral,
  expectD1Number,
  expectD1String,
  expectD1StringLiteral,
  parseD1JsonField,
  parseD1NullableJsonField,
} from '../db/d1_row.ts';
import {
  expectRecord,
  expectStringArray,
  parseAppGenerationPlan,
  parseGenerationPlanSteps,
  parseModelRequestMetadata,
  parseNormalizedRequest,
  parseValidationFindings,
  parseWorkspaceFiles,
} from './binding_result.ts';
import { readAppWriterSelectedContext } from './context.ts';
import {
  APP_GENERATION_STATUSES,
  APP_WRITER_STARTER_IDS,
  type AppGenerationRunRecord,
  type AppGenerationWorkspaceRecord,
} from './types.ts';

export const D1_APP_GENERATION_RUN_SELECT = `
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

export interface D1AppGenerationRunRow extends Record<string, unknown> {
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

export const D1_APP_GENERATION_WORKSPACE_SELECT = `
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

export interface D1AppGenerationWorkspaceRow extends Record<string, unknown> {
  generationId: unknown;
  selectedStarterId: unknown;
  filesJson: unknown;
  generationPlanJson: unknown;
  validationFindingsJson: unknown;
  repairAttemptCount: unknown;
  updatedAt: unknown;
}

export function serializeAppGenerationRun(record: AppGenerationRunRecord): unknown[] {
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

export function mapD1AppGenerationRunFields(row: D1AppGenerationRunRow): AppGenerationRunRecord {
  const selectedStarterId = expectD1NullableStringLiteral(
    row.selectedStarterId,
    'app_generation_runs.selectedStarterId',
    APP_WRITER_STARTER_IDS,
  );

  return {
    generationId: expectD1String(row.generationId, 'app_generation_runs.generationId'),
    ownerId: expectD1String(row.ownerId, 'app_generation_runs.ownerId'),
    status: expectD1StringLiteral(
      row.status,
      'app_generation_runs.status',
      APP_GENERATION_STATUSES,
    ),
    requestedAppId: expectD1NullableString(
      row.requestedAppId,
      'app_generation_runs.requestedAppId',
    ),
    generatedAppId: expectD1NullableString(
      row.generatedAppId,
      'app_generation_runs.generatedAppId',
    ),
    generatedVersion: expectD1NullableString(
      row.generatedVersion,
      'app_generation_runs.generatedVersion',
    ),
    packageVersionId: expectD1NullableNumber(
      row.packageVersionId,
      'app_generation_runs.packageVersionId',
    ),
    promptText: expectD1String(row.promptText, 'app_generation_runs.promptText'),
    normalizedRequest: parseD1NullableJsonField(
      row.normalizedRequestJson,
      'app_generation_runs.normalizedRequestJson',
      parseNormalizedRequest,
    ),
    appPlan: parseD1NullableJsonField(
      row.appPlanJson,
      'app_generation_runs.appPlanJson',
      parseAppGenerationPlan,
    ),
    selectedStarterId,
    selectedContext: readAppWriterSelectedContext(
      parseD1JsonField(
        row.selectedContextJson,
        'app_generation_runs.selectedContextJson',
        expectRecord,
      ),
      selectedStarterId,
    ),
    modelRequestMetadata: parseD1JsonField(
      row.modelRequestMetadataJson,
      'app_generation_runs.modelRequestMetadataJson',
      parseModelRequestMetadata,
    ),
    generationNotes: parseD1JsonField(
      row.generationNotesJson,
      'app_generation_runs.generationNotesJson',
      expectStringArray,
    ),
    validationFindings: parseD1JsonField(
      row.validationFindingsJson,
      'app_generation_runs.validationFindingsJson',
      parseValidationFindings,
    ),
    repairAttemptCount: expectD1Number(
      row.repairAttemptCount,
      'app_generation_runs.repairAttemptCount',
    ),
    createdAt: expectD1String(row.createdAt, 'app_generation_runs.createdAt'),
    updatedAt: expectD1String(row.updatedAt, 'app_generation_runs.updatedAt'),
  };
}

export function serializeAppGenerationWorkspace(record: AppGenerationWorkspaceRecord): unknown[] {
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

export function mapD1AppGenerationWorkspaceFields(
  row: D1AppGenerationWorkspaceRow,
): AppGenerationWorkspaceRecord {
  return {
    generationId: expectD1String(row.generationId, 'app_generation_workspaces.generationId'),
    selectedStarterId: expectD1StringLiteral(
      row.selectedStarterId,
      'app_generation_workspaces.selectedStarterId',
      APP_WRITER_STARTER_IDS,
    ),
    files: parseD1JsonField(
      row.filesJson,
      'app_generation_workspaces.filesJson',
      parseWorkspaceFiles,
    ),
    generationPlan: parseD1JsonField(
      row.generationPlanJson,
      'app_generation_workspaces.generationPlanJson',
      parseGenerationPlanSteps,
    ),
    validationFindings: parseD1JsonField(
      row.validationFindingsJson,
      'app_generation_workspaces.validationFindingsJson',
      parseValidationFindings,
    ),
    repairAttemptCount: expectD1Number(
      row.repairAttemptCount,
      'app_generation_workspaces.repairAttemptCount',
    ),
    updatedAt: expectD1String(row.updatedAt, 'app_generation_workspaces.updatedAt'),
  };
}
