import {
  APP_GENERATION_PLAN_STEP_IDS,
  APP_GENERATION_PLAN_STEP_STATUSES,
  APP_GENERATION_PROGRESS_STAGES,
  APP_WRITER_AUTHORING_MODES,
  APP_WRITER_STARTER_IDS,
  APP_WRITER_WORKSPACE_FILE_ROLES,
  type AppGenerationActivityType,
  type AppGenerationAttemptEventPlan,
  type AppGenerationAttemptEventType,
  type AppGenerationGradingMode,
  type AppGenerationModelRequestMetadata,
  type AppGenerationModelRequestOutcome,
  type AppGenerationModelRequestStoredStage,
  type AppGenerationNormalizedRequest,
  type AppGenerationPlan,
  type AppGenerationPlanningResult,
  type AppGenerationPlanStep,
  type AppGenerationProgressUpdate,
  type AppGenerationValidationFinding,
  type AppGenerationWorkspaceRecord,
  type AppPackageGenerationInput,
  type AppPackageGenerationResult,
  type AppWriterAuthoringMode,
  type AppWriterStarterId,
  type AppWriterWorkspaceFile,
  type AppWriterWorkspaceFileRole,
} from './types.ts';
import { readAppWriterSelectedContext } from './context.ts';
import type { Capability } from '../../sdk/app-sdk.ts';

const APP_GENERATION_ACTIVITY_TYPES = [
  'quiz',
  'sorting',
  'matching',
  'flashcards',
  'simulation',
  'game',
  'practice',
] as const satisfies readonly AppGenerationActivityType[];
const APP_GENERATION_GRADING_MODES = [
  'completion',
  'declarative',
  'browser',
] as const satisfies readonly AppGenerationGradingMode[];
const APP_GENERATION_ATTEMPT_EVENT_TYPES = [
  'answer',
  'progress',
  'complete',
] as const satisfies readonly AppGenerationAttemptEventType[];
const APP_GENERATION_CAPABILITIES = [
  'read_launch_context',
  'read_activity_content',
  'submit_attempt_event',
  'submit_evidence_artifact',
  'finalize_attempt',
  'read_local_state',
  'write_local_state',
] as const satisfies readonly Capability[];

export function parseWorkspaceFiles(value: unknown, fieldName: string): AppWriterWorkspaceFile[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
    const record = expectRecord(item, `${fieldName}[${index}]`);
    const file: AppWriterWorkspaceFile = {
      path: expectString(record.path, `${fieldName}[${index}].path`),
      contents: expectString(record.contents, `${fieldName}[${index}].contents`),
    };

    if (record.role !== undefined) {
      file.role = expectWorkspaceFileRole(record.role, `${fieldName}[${index}].role`);
    }

    return file;
  });
}

export function parseAppPackageGenerationInput(
  value: unknown,
  fieldName: string,
): AppPackageGenerationInput {
  const record = expectRecord(value, fieldName);
  const generationId = expectString(record.generationId, `${fieldName}.generationId`);
  const ownerId = expectString(record.ownerId, `${fieldName}.ownerId`);
  const promptText = expectString(record.promptText, `${fieldName}.promptText`);
  const requestedAppId = expectNullableString(record.requestedAppId, `${fieldName}.requestedAppId`);
  const selectedStarterId = expectStarterId(
    record.selectedStarterId,
    `${fieldName}.selectedStarterId`,
  );

  return {
    generationId,
    ownerId,
    promptText,
    requestedAppId,
    selectedStarterId,
    selectedContext: readAppWriterSelectedContext(record.selectedContext, selectedStarterId),
    authoringMode: expectAuthoringMode(record.authoringMode, `${fieldName}.authoringMode`),
    createdAt: expectString(record.createdAt, `${fieldName}.createdAt`),
  };
}

export function parseAppGenerationPlanningResult(
  value: unknown,
  fieldName: string,
): AppGenerationPlanningResult {
  const record = expectRecord(value, fieldName);

  return {
    normalizedRequest: parseNormalizedRequest(
      record.normalizedRequest,
      `${fieldName}.normalizedRequest`,
    ),
    appPlan: parseAppGenerationPlan(record.appPlan, `${fieldName}.appPlan`),
    selectedStarterId: expectStarterId(record.selectedStarterId, `${fieldName}.selectedStarterId`),
    progressUpdates: parseProgressUpdates(record.progressUpdates, `${fieldName}.progressUpdates`),
    notes: expectStringArray(record.notes, `${fieldName}.notes`),
    ...(record.modelRequestMetadata === undefined ? {} : {
      modelRequestMetadata: parseModelRequestMetadata(
        record.modelRequestMetadata,
        `${fieldName}.modelRequestMetadata`,
      ),
    }),
  };
}

export function parseAppPackageGenerationResult(
  value: unknown,
  fieldName: string,
): AppPackageGenerationResult {
  const record = expectRecord(value, fieldName);

  return {
    normalizedRequest: parseNormalizedRequest(
      record.normalizedRequest,
      `${fieldName}.normalizedRequest`,
    ),
    appPlan: parseAppGenerationPlan(record.appPlan, `${fieldName}.appPlan`),
    selectedStarterId: expectStarterId(record.selectedStarterId, `${fieldName}.selectedStarterId`),
    files: parseWorkspaceFiles(record.files, `${fieldName}.files`),
    progressUpdates: parseProgressUpdates(record.progressUpdates, `${fieldName}.progressUpdates`),
    notes: expectStringArray(record.notes, `${fieldName}.notes`),
    validationFindings: parseValidationFindings(
      record.validationFindings,
      `${fieldName}.validationFindings`,
    ),
    ...(record.modelRequestMetadata === undefined ? {} : {
      modelRequestMetadata: parseModelRequestMetadata(
        record.modelRequestMetadata,
        `${fieldName}.modelRequestMetadata`,
      ),
    }),
  };
}

export function parseAppGenerationWorkspaceRecord(
  value: unknown,
  fieldName: string,
): AppGenerationWorkspaceRecord {
  const record = expectRecord(value, fieldName);

  return {
    generationId: expectString(record.generationId, `${fieldName}.generationId`),
    selectedStarterId: expectStarterId(record.selectedStarterId, `${fieldName}.selectedStarterId`),
    files: parseWorkspaceFiles(record.files, `${fieldName}.files`),
    generationPlan: parseGenerationPlanSteps(record.generationPlan, `${fieldName}.generationPlan`),
    validationFindings: parseValidationFindings(
      record.validationFindings,
      `${fieldName}.validationFindings`,
    ),
    repairAttemptCount: expectNumber(record.repairAttemptCount, `${fieldName}.repairAttemptCount`),
    updatedAt: expectString(record.updatedAt, `${fieldName}.updatedAt`),
  };
}

export function parseAppGenerationPlan(value: unknown, fieldName: string): AppGenerationPlan {
  const record = expectRecord(value, fieldName);
  const grading = expectRecord(record.grading, `${fieldName}.grading`);

  return {
    appId: expectString(record.appId, `${fieldName}.appId`),
    title: expectString(record.title, `${fieldName}.title`),
    description: expectString(record.description, `${fieldName}.description`),
    learningGoal: expectString(record.learningGoal, `${fieldName}.learningGoal`),
    audience: expectString(record.audience, `${fieldName}.audience`),
    activityType: expectStringLiteral(
      record.activityType,
      `${fieldName}.activityType`,
      APP_GENERATION_ACTIVITY_TYPES,
    ),
    learnerFlow: expectStringArray(record.learnerFlow, `${fieldName}.learnerFlow`),
    contentModel: expectRecord(record.contentModel, `${fieldName}.contentModel`),
    capabilities: expectStringLiteralArray(
      record.capabilities,
      `${fieldName}.capabilities`,
      APP_GENERATION_CAPABILITIES,
    ),
    grading: {
      mode: expectStringLiteral(
        grading.mode,
        `${fieldName}.grading.mode`,
        APP_GENERATION_GRADING_MODES,
      ),
      maxScore: expectNumber(grading.maxScore, `${fieldName}.grading.maxScore`),
      scoringSummary: expectString(grading.scoringSummary, `${fieldName}.grading.scoringSummary`),
    },
    attemptEvents: parseAttemptEventPlans(record.attemptEvents, `${fieldName}.attemptEvents`),
    previewTests: expectStringArray(record.previewTests, `${fieldName}.previewTests`),
    accessibilityNotes: expectStringArray(
      record.accessibilityNotes,
      `${fieldName}.accessibilityNotes`,
    ),
    riskNotes: expectStringArray(record.riskNotes, `${fieldName}.riskNotes`),
  };
}

export function parseNormalizedRequest(
  value: unknown,
  fieldName: string,
): AppGenerationNormalizedRequest {
  const record = expectRecord(value, fieldName);

  return {
    learningGoal: expectString(record.learningGoal, `${fieldName}.learningGoal`),
    audience: expectString(record.audience, `${fieldName}.audience`),
    contentSummary: expectString(record.contentSummary, `${fieldName}.contentSummary`),
    requestedActivity: expectString(record.requestedActivity, `${fieldName}.requestedActivity`),
    constraints: expectStringArray(record.constraints, `${fieldName}.constraints`),
    missingInformation: expectStringArray(
      record.missingInformation,
      `${fieldName}.missingInformation`,
    ),
    safeToGenerate: expectBoolean(record.safeToGenerate, `${fieldName}.safeToGenerate`),
  };
}

export function parseProgressUpdates(
  value: unknown,
  fieldName: string,
): AppGenerationProgressUpdate[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
    const record = expectRecord(item, `${fieldName}[${index}]`);

    return {
      stage: expectProgressStage(record.stage, `${fieldName}[${index}].stage`),
      message: expectString(record.message, `${fieldName}[${index}].message`),
    };
  });
}

export function parseValidationFindings(
  value: unknown,
  fieldName: string,
): AppGenerationValidationFinding[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
    const record = expectRecord(item, `${fieldName}[${index}]`);

    return {
      code: expectString(record.code, `${fieldName}[${index}].code`),
      severity: expectValidationSeverity(record.severity, `${fieldName}[${index}].severity`),
      message: expectString(record.message, `${fieldName}[${index}].message`),
      file: expectNullableString(record.file, `${fieldName}[${index}].file`),
      field: expectNullableString(record.field, `${fieldName}[${index}].field`),
      fix: expectNullableString(record.fix, `${fieldName}[${index}].fix`),
      detail: expectRecord(record.detail, `${fieldName}[${index}].detail`),
    };
  });
}

export function parseModelRequestMetadata(
  value: unknown,
  fieldName: string,
): AppGenerationModelRequestMetadata[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
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
      stage: expectModelStage(record.stage, `${fieldName}[${index}].stage`),
      attempt: expectNumber(record.attempt, `${fieldName}[${index}].attempt`),
      outcome: expectModelOutcome(record.outcome, `${fieldName}[${index}].outcome`),
      errorCode: expectNullableString(record.errorCode, `${fieldName}[${index}].errorCode`),
    };
  });
}

export function parseGenerationPlanSteps(
  value: unknown,
  fieldName: string,
): AppGenerationPlanStep[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
    const record = expectRecord(item, `${fieldName}[${index}]`);

    return {
      id: expectStringLiteral(record.id, `${fieldName}[${index}].id`, APP_GENERATION_PLAN_STEP_IDS),
      status: expectStringLiteral(
        record.status,
        `${fieldName}[${index}].status`,
        APP_GENERATION_PLAN_STEP_STATUSES,
      ),
      startedAt: expectNullableString(record.startedAt, `${fieldName}[${index}].startedAt`),
      completedAt: expectNullableString(record.completedAt, `${fieldName}[${index}].completedAt`),
      summary: expectString(record.summary, `${fieldName}[${index}].summary`),
      result: expectRecord(record.result, `${fieldName}[${index}].result`),
      diagnosticCount: expectNumber(
        record.diagnosticCount,
        `${fieldName}[${index}].diagnosticCount`,
      ),
    };
  });
}

export function expectRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
}

export function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be text.`);
  }

  return value;
}

export function expectNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  return expectString(value, fieldName);
}

export function expectNullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  return expectNumber(value, fieldName);
}

export function expectNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${fieldName} must be a finite number.`);
  }

  return value;
}

export function expectBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${fieldName} must be boolean.`);
  }

  return value;
}

export function expectStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be a string array.`);
  }

  return value.map((item, index) => expectString(item, `${fieldName}[${index}]`));
}

function expectValidationSeverity(
  value: unknown,
  fieldName: string,
): AppGenerationValidationFinding['severity'] {
  if (value !== 'error' && value !== 'warning') {
    throw new TypeError(`${fieldName} must be error or warning.`);
  }

  return value;
}

function parseAttemptEventPlans(
  value: unknown,
  fieldName: string,
): AppGenerationAttemptEventPlan[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
    const record = expectRecord(item, `${fieldName}[${index}]`);

    return {
      when: expectString(record.when, `${fieldName}[${index}].when`),
      eventType: expectStringLiteral(
        record.eventType,
        `${fieldName}[${index}].eventType`,
        APP_GENERATION_ATTEMPT_EVENT_TYPES,
      ),
      questionIdPattern: expectString(
        record.questionIdPattern,
        `${fieldName}[${index}].questionIdPattern`,
      ),
    };
  });
}

export function expectStarterId(value: unknown, fieldName: string): AppWriterStarterId {
  return expectStringLiteral(value, fieldName, APP_WRITER_STARTER_IDS);
}

export function expectAuthoringMode(value: unknown, fieldName: string): AppWriterAuthoringMode {
  return expectStringLiteral(value, fieldName, APP_WRITER_AUTHORING_MODES);
}

export function expectStringLiteral<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new TypeError(`${fieldName} must be a supported value.`);
  }

  return value as T;
}

function expectStringLiteralArray<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => expectStringLiteral(item, `${fieldName}[${index}]`, allowed));
}

function expectWorkspaceFileRole(value: unknown, fieldName: string): AppWriterWorkspaceFileRole {
  for (const role of APP_WRITER_WORKSPACE_FILE_ROLES) {
    if (value === role) {
      return role;
    }
  }

  throw new TypeError(`${fieldName} must be a supported workspace file role.`);
}

function expectProgressStage(
  value: unknown,
  fieldName: string,
): AppGenerationProgressUpdate['stage'] {
  for (const stage of APP_GENERATION_PROGRESS_STAGES) {
    if (value === stage) {
      return stage;
    }
  }

  throw new TypeError(`${fieldName} must be a supported generation progress stage.`);
}

function expectModelStage(value: unknown, fieldName: string): AppGenerationModelRequestStoredStage {
  if (value === 'author' || value === 'repair') {
    return value;
  }

  if (value === 'unknown') {
    return value;
  }

  throw new TypeError(`${fieldName} must be author or repair.`);
}

function expectModelOutcome(value: unknown, fieldName: string): AppGenerationModelRequestOutcome {
  if (value === 'succeeded' || value === 'failed' || value === 'timed_out' || value === 'unknown') {
    return value;
  }

  throw new TypeError(`${fieldName} must be succeeded, failed, or timed_out.`);
}
