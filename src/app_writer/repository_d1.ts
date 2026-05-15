import type { Capability } from '../../sdk/app-sdk.ts';
import type { D1Database } from '../db/d1.ts';
import { queryD1First, runD1 } from '../db/d1.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import {
  APP_GENERATION_STATUSES,
  APP_WRITER_STARTER_IDS,
  type AppGenerationAttemptEventPlan,
  type AppGenerationModelRequestMetadata,
  type AppGenerationNormalizedRequest,
  type AppGenerationPlan,
  type AppGenerationRunRecord,
  type AppGenerationValidationFinding,
} from './types.ts';

const APP_GENERATION_ACTIVITY_TYPES = [
  'quiz',
  'sorting',
  'matching',
  'flashcards',
  'simulation',
  'game',
  'practice',
] as const;
const APP_GENERATION_GRADING_MODES = ['completion', 'declarative', 'browser'] as const;
const APP_GENERATION_ATTEMPT_EVENT_TYPES = ['answer', 'progress', 'complete'] as const;
const APP_GENERATION_VALIDATION_SEVERITIES = ['error', 'warning'] as const;
const APP_GENERATION_CAPABILITIES = [
  'read_launch_context',
  'read_activity_content',
  'submit_attempt_event',
  'submit_evidence_artifact',
  'finalize_attempt',
  'read_local_state',
  'write_local_state',
] as const satisfies readonly Capability[];

export function createD1AppGenerationRepositoryMethods(
  db: D1Database,
): Pick<
  PackageReviewRepository,
  'createAppGenerationRun' | 'getAppGenerationRunById' | 'updateAppGenerationRun'
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
      parseNormalizedRequest,
    ),
    appPlan: parseNullableJsonField(row.appPlanJson, 'appPlanJson', parseAppPlan),
    selectedStarterId: expectNullableStringLiteral(
      row.selectedStarterId,
      'selectedStarterId',
      APP_WRITER_STARTER_IDS,
    ),
    selectedContext: parseJsonObjectField(row.selectedContextJson, 'selectedContextJson'),
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

function parseNormalizedRequest(value: unknown): AppGenerationNormalizedRequest {
  const record = expectRecord(value, 'normalizedRequest');

  return {
    learningGoal: expectString(record.learningGoal, 'normalizedRequest.learningGoal'),
    audience: expectString(record.audience, 'normalizedRequest.audience'),
    contentSummary: expectString(record.contentSummary, 'normalizedRequest.contentSummary'),
    requestedActivity: expectString(
      record.requestedActivity,
      'normalizedRequest.requestedActivity',
    ),
    constraints: expectStringArray(record.constraints, 'normalizedRequest.constraints'),
    missingInformation: expectStringArray(
      record.missingInformation,
      'normalizedRequest.missingInformation',
    ),
    safeToGenerate: expectBoolean(record.safeToGenerate, 'normalizedRequest.safeToGenerate'),
  };
}

function parseAppPlan(value: unknown): AppGenerationPlan {
  const record = expectRecord(value, 'appPlan');
  const grading = expectRecord(record.grading, 'appPlan.grading');

  return {
    appId: expectString(record.appId, 'appPlan.appId'),
    title: expectString(record.title, 'appPlan.title'),
    description: expectString(record.description, 'appPlan.description'),
    learningGoal: expectString(record.learningGoal, 'appPlan.learningGoal'),
    audience: expectString(record.audience, 'appPlan.audience'),
    activityType: expectStringLiteral(
      record.activityType,
      'appPlan.activityType',
      APP_GENERATION_ACTIVITY_TYPES,
    ),
    learnerFlow: expectStringArray(record.learnerFlow, 'appPlan.learnerFlow'),
    contentModel: expectRecord(record.contentModel, 'appPlan.contentModel'),
    capabilities: expectStringLiteralArray(
      record.capabilities,
      'appPlan.capabilities',
      APP_GENERATION_CAPABILITIES,
    ),
    grading: {
      mode: expectStringLiteral(grading.mode, 'appPlan.grading.mode', APP_GENERATION_GRADING_MODES),
      maxScore: expectNumber(grading.maxScore, 'appPlan.grading.maxScore'),
      scoringSummary: expectString(grading.scoringSummary, 'appPlan.grading.scoringSummary'),
    },
    attemptEvents: parseAttemptEventPlans(record.attemptEvents),
    previewTests: expectStringArray(record.previewTests, 'appPlan.previewTests'),
    accessibilityNotes: expectStringArray(record.accessibilityNotes, 'appPlan.accessibilityNotes'),
    riskNotes: expectStringArray(record.riskNotes, 'appPlan.riskNotes'),
  };
}

function parseAttemptEventPlans(value: unknown): AppGenerationAttemptEventPlan[] {
  if (!Array.isArray(value)) {
    throw new TypeError('appPlan.attemptEvents must be an array.');
  }

  return value.map((item, index) => {
    const record = expectRecord(item, `appPlan.attemptEvents[${index}]`);

    return {
      when: expectString(record.when, `appPlan.attemptEvents[${index}].when`),
      eventType: expectStringLiteral(
        record.eventType,
        `appPlan.attemptEvents[${index}].eventType`,
        APP_GENERATION_ATTEMPT_EVENT_TYPES,
      ),
      questionIdPattern: expectString(
        record.questionIdPattern,
        `appPlan.attemptEvents[${index}].questionIdPattern`,
      ),
    };
  });
}

function parseValidationFindingsField(
  value: unknown,
  fieldName: string,
): AppGenerationValidationFinding[] {
  const parsed = parseJsonField(value, fieldName);

  if (!Array.isArray(parsed)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return parsed.map((item, index) => parseValidationFinding(item, `${fieldName}[${index}]`));
}

function parseModelRequestMetadataField(
  value: unknown,
  fieldName: string,
): AppGenerationModelRequestMetadata[] {
  const parsed = parseJsonField(value, fieldName);

  if (!Array.isArray(parsed)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return parsed.map((item, index) => {
    const record = expectRecord(item, `${fieldName}[${index}]`);

    return {
      provider: expectString(record.provider, `${fieldName}[${index}].provider`),
      model: expectNullableString(record.model, `${fieldName}[${index}].model`),
      requestId: expectNullableString(record.requestId, `${fieldName}[${index}].requestId`),
      durationMs: expectNullableNumber(record.durationMs, `${fieldName}[${index}].durationMs`),
      responseCharacters: expectNullableNumber(
        record.responseCharacters,
        `${fieldName}[${index}].responseCharacters`,
      ),
    };
  });
}

function parseValidationFinding(value: unknown, fieldName: string): AppGenerationValidationFinding {
  const record = expectRecord(value, fieldName);

  return {
    code: expectString(record.code, `${fieldName}.code`),
    severity: expectStringLiteral(
      record.severity,
      `${fieldName}.severity`,
      APP_GENERATION_VALIDATION_SEVERITIES,
    ),
    message: expectString(record.message, `${fieldName}.message`),
    file: expectNullableString(record.file, `${fieldName}.file`),
    field: expectNullableString(record.field, `${fieldName}.field`),
    fix: expectNullableString(record.fix, `${fieldName}.fix`),
    detail: expectRecord(record.detail, `${fieldName}.detail`),
  };
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

function expectRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be text.`);
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
    throw new TypeError(`${fieldName} must be numeric.`);
  }

  return value;
}

function expectNullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  return expectNumber(value, fieldName);
}

function expectBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${fieldName} must be boolean.`);
  }

  return value;
}

function expectStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be a string array.`);
  }

  return value.map((item) => expectString(item, `${fieldName} item`));
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

function expectStringLiteralArray<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item) => expectStringLiteral(item, `${fieldName} item`, allowed));
}

function isD1UniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}
