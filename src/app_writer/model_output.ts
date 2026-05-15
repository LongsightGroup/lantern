import type { Capability } from '../../sdk/app-sdk.ts';
import type {
  AppGenerationActivityType,
  AppGenerationAttemptEventType,
  AppGenerationGradingMode,
  AppGenerationPlanningResult,
  AppGenerationProgressStage,
  AppPackageGenerationResult,
  AppWorkspaceFileEditResult,
  AppWriterStarterId,
} from './types.ts';
import { APP_GENERATION_PROGRESS_STAGES } from './types.ts';

const CAPABILITIES = new Set<Capability>([
  'read_launch_context',
  'read_activity_content',
  'submit_attempt_event',
  'submit_evidence_artifact',
  'finalize_attempt',
  'read_local_state',
  'write_local_state',
]);

const ACTIVITY_TYPES = new Set<AppGenerationActivityType>([
  'quiz',
  'sorting',
  'matching',
  'flashcards',
  'simulation',
  'game',
  'practice',
]);

const GRADING_MODES = new Set<AppGenerationGradingMode>(['completion', 'declarative', 'browser']);

const ATTEMPT_EVENT_TYPES = new Set<AppGenerationAttemptEventType>([
  'answer',
  'progress',
  'complete',
]);

const STARTER_IDS = new Set<AppWriterStarterId>(['simple-activity', 'browser-autograder']);
const PROGRESS_STAGES = new Set<AppGenerationProgressStage>(APP_GENERATION_PROGRESS_STAGES);
const MAX_PROGRESS_UPDATES = 4;
const MAX_PROGRESS_MESSAGE_CHARACTERS = 180;
const UNSAFE_PROGRESS_PHRASES = [
  'api key',
  'chain of thought',
  'cloudflare',
  'd1',
  'durable object',
  'hidden instruction',
  'lms token',
  'r2',
  'secret',
  'system prompt',
  'token',
  'worker binding',
] as const;

export function parseAppPackageGenerationResultJson(jsonText: string): AppPackageGenerationResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractModelJsonObjectText(jsonText));
  } catch {
    throw new Error('App package generator returned invalid JSON.');
  }

  return parseAppPackageGenerationResult(normalizeModelOutputRoot(parsed));
}

function extractModelJsonObjectText(text: string): string {
  const trimmed = stripMarkdownJsonFence(text.trim());
  const firstBrace = trimmed.indexOf('{');

  if (firstBrace < 0) {
    return trimmed;
  }

  const objectText = readBalancedJsonObject(trimmed, firstBrace);

  return objectText ?? trimmed;
}

function stripMarkdownJsonFence(text: string): string {
  const fenced = text.match(/^```(?:[a-z0-9_-]+)?\s*([\s\S]*?)\s*```$/i);

  return fenced?.[1]?.trim() ?? text;
}

function readBalancedJsonObject(text: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '{') {
      depth += 1;
      continue;
    }

    if (character === '}') {
      depth -= 1;

      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function normalizeModelOutputRoot(value: unknown): unknown {
  const record = readRecord(value);

  if (record === null || hasAppPackageKeys(record)) {
    return normalizeAppPackageKeyAliases(value);
  }

  const contentText = readModelEnvelopeText(record);

  if (contentText !== null) {
    try {
      return normalizeModelOutputRoot(JSON.parse(extractModelJsonObjectText(contentText)));
    } catch {
      return value;
    }
  }

  const nested = readModelEnvelopeObject(record);

  return nested === null ? normalizeAppPackageKeyAliases(value) : normalizeModelOutputRoot(nested);
}

function hasAppPackageKeys(record: Record<string, unknown>): boolean {
  return record.normalizedRequest !== undefined || record.normalized_request !== undefined;
}

function readModelEnvelopeText(record: Record<string, unknown>): string | null {
  const response = readString(record.response);

  if (response !== null) {
    return response;
  }

  const content = readString(record.content);

  if (content !== null) {
    return content;
  }

  const result = readRecord(record.result);
  const resultResponse = readString(result?.response);

  if (resultResponse !== null) {
    return resultResponse;
  }

  const message = readRecord(record.message);

  return readString(message?.content);
}

function readModelEnvelopeObject(record: Record<string, unknown>): unknown | null {
  const candidateKeys = [
    'appPackage',
    'app_package',
    'package',
    'response',
    'result',
    'output',
    'data',
  ];

  for (const key of candidateKeys) {
    const candidate = readRecord(record[key]);

    if (candidate !== null && hasAppPackageKeys(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeAppPackageKeyAliases(value: unknown): unknown {
  const record = readRecord(value);

  if (record === null) {
    return value;
  }

  return {
    ...record,
    normalizedRequest: record.normalizedRequest ?? record.normalized_request,
    appPlan: normalizeAppPlanAliases(record.appPlan ?? record.app_plan),
    selectedStarterId: record.selectedStarterId ?? record.selected_starter_id,
    progressUpdates: record.progressUpdates ?? record.progress_updates,
  };
}

function normalizeAppPlanAliases(value: unknown): unknown {
  const record = readRecord(value);

  if (record === null) {
    return value;
  }

  return {
    ...record,
    appId: record.appId ?? record.app_id,
    learningGoal: record.learningGoal ?? record.learning_goal,
    activityType: record.activityType ?? record.activity_type,
    learnerFlow: record.learnerFlow ?? record.learner_flow,
    contentModel: record.contentModel ?? record.content_model,
    grading: normalizeGradingAliases(record.grading),
    attemptEvents: normalizeAttemptEventAliases(record.attemptEvents ?? record.attempt_events),
    previewTests: record.previewTests ?? record.preview_tests,
    accessibilityNotes: record.accessibilityNotes ?? record.accessibility_notes,
    riskNotes: record.riskNotes ?? record.risk_notes,
  };
}

function normalizeGradingAliases(value: unknown): unknown {
  const record = readRecord(value);

  if (record === null) {
    return value;
  }

  return {
    ...record,
    maxScore: record.maxScore ?? record.max_score,
    scoringSummary: record.scoringSummary ?? record.scoring_summary,
  };
}

function normalizeAttemptEventAliases(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => {
    const record = readRecord(item);

    if (record === null) {
      return item;
    }

    return {
      ...record,
      eventType: record.eventType ?? record.event_type,
      questionIdPattern: record.questionIdPattern ?? record.question_id_pattern,
    };
  });
}

export function parseAppPackageGenerationResult(value: unknown): AppPackageGenerationResult {
  const record = requireRecord(value, 'App package generator output must be a JSON object.');
  const normalizedRequest = requireRecord(
    normalizeNormalizedRequestAliases(record.normalizedRequest),
    'normalizedRequest',
  );

  return {
    normalizedRequest: {
      learningGoal: requireString(normalizedRequest.learningGoal, 'normalizedRequest.learningGoal'),
      audience: requireString(normalizedRequest.audience, 'normalizedRequest.audience'),
      contentSummary: requireString(
        normalizedRequest.contentSummary,
        'normalizedRequest.contentSummary',
      ),
      requestedActivity: requireString(
        normalizedRequest.requestedActivity,
        'normalizedRequest.requestedActivity',
      ),
      constraints: requireStringArray(
        normalizedRequest.constraints,
        'normalizedRequest.constraints',
      ),
      missingInformation: requireStringArray(
        normalizedRequest.missingInformation,
        'normalizedRequest.missingInformation',
      ),
      safeToGenerate: requireBoolean(
        normalizedRequest.safeToGenerate,
        'normalizedRequest.safeToGenerate',
      ),
    },
    appPlan: parseAppPlan(record.appPlan),
    selectedStarterId: requireEnum(record.selectedStarterId, STARTER_IDS, 'selectedStarterId'),
    files: requireArray(record.files, 'files').map((file, index) => {
      const fileRecord = requireRecord(file, `files[${index}]`);

      return {
        path: requireString(fileRecord.path, `files[${index}].path`),
        contents: requireString(fileRecord.contents, `files[${index}].contents`),
      };
    }),
    progressUpdates: parseProgressUpdates(record.progressUpdates),
    notes: requireStringArray(record.notes, 'notes'),
    validationFindings: [],
  };
}

export function parseAppGenerationPlanningResultJson(
  jsonText: string,
): AppGenerationPlanningResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractModelJsonObjectText(jsonText));
  } catch {
    throw new Error('App package planner returned invalid JSON.');
  }

  return parseAppGenerationPlanningResult(normalizeModelOutputRoot(parsed));
}

export function parseAppWorkspaceFileEditResultJson(jsonText: string): AppWorkspaceFileEditResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractModelJsonObjectText(jsonText));
  } catch {
    throw new Error('App package file writer returned invalid JSON.');
  }

  return parseAppWorkspaceFileEditResult(normalizeFileEditOutputRoot(parsed));
}

export function parseAppGenerationPlanningResult(value: unknown): AppGenerationPlanningResult {
  const record = requireRecord(value, 'App package planner output must be a JSON object.');
  const normalizedRequest = requireRecord(
    normalizeNormalizedRequestAliases(record.normalizedRequest),
    'normalizedRequest',
  );

  return {
    normalizedRequest: {
      learningGoal: requireString(normalizedRequest.learningGoal, 'normalizedRequest.learningGoal'),
      audience: requireString(normalizedRequest.audience, 'normalizedRequest.audience'),
      contentSummary: requireString(
        normalizedRequest.contentSummary,
        'normalizedRequest.contentSummary',
      ),
      requestedActivity: requireString(
        normalizedRequest.requestedActivity,
        'normalizedRequest.requestedActivity',
      ),
      constraints: requireStringArray(
        normalizedRequest.constraints,
        'normalizedRequest.constraints',
      ),
      missingInformation: requireStringArray(
        normalizedRequest.missingInformation,
        'normalizedRequest.missingInformation',
      ),
      safeToGenerate: requireBoolean(
        normalizedRequest.safeToGenerate,
        'normalizedRequest.safeToGenerate',
      ),
    },
    appPlan: parseAppPlan(record.appPlan),
    selectedStarterId: requireEnum(record.selectedStarterId, STARTER_IDS, 'selectedStarterId'),
    progressUpdates: parseProgressUpdates(record.progressUpdates),
    notes: requireStringArray(record.notes, 'notes'),
  };
}

export function parseAppWorkspaceFileEditResult(value: unknown): AppWorkspaceFileEditResult {
  const record = requireRecord(value, 'App package file writer output must be a JSON object.');
  const fileEdits = requireArray(record.fileEdits, 'fileEdits').map((file, index) => {
    const fileRecord = requireRecord(file, `fileEdits[${index}]`);

    return {
      path: requireString(fileRecord.path, `fileEdits[${index}].path`),
      contents: requireString(fileRecord.contents, `fileEdits[${index}].contents`),
    };
  });

  if (fileEdits.length === 0) {
    throw new Error('fileEdits must contain at least one workspace file edit.');
  }

  return {
    fileEdits,
    progressUpdates: parseProgressUpdates(record.progressUpdates),
    notes: requireStringArray(record.notes, 'notes'),
  };
}

function normalizeFileEditOutputRoot(value: unknown): unknown {
  const record = readRecord(value);

  if (record === null || record.fileEdits !== undefined || record.file_edits !== undefined) {
    return normalizeFileEditAliases(value);
  }

  const contentText = readModelEnvelopeText(record);

  if (contentText !== null) {
    try {
      return normalizeFileEditOutputRoot(JSON.parse(extractModelJsonObjectText(contentText)));
    } catch {
      return value;
    }
  }

  const candidateKeys = ['workspaceEdits', 'workspace_edits', 'fileEdits', 'files', 'result'];

  for (const key of candidateKeys) {
    const candidate = readRecord(record[key]);

    if (
      candidate !== null &&
      (candidate.fileEdits !== undefined || candidate.files !== undefined)
    ) {
      return normalizeFileEditOutputRoot(candidate);
    }
  }

  return normalizeFileEditAliases(value);
}

function normalizeFileEditAliases(value: unknown): unknown {
  const record = readRecord(value);

  if (record === null) {
    return value;
  }

  return {
    ...record,
    fileEdits: record.fileEdits ?? record.file_edits ?? record.files,
    progressUpdates: record.progressUpdates ?? record.progress_updates,
  };
}

function parseProgressUpdates(value: unknown): AppPackageGenerationResult['progressUpdates'] {
  const updates = requireArray(value, 'progressUpdates');

  if (updates.length === 0 || updates.length > MAX_PROGRESS_UPDATES) {
    throw new Error(`progressUpdates must contain 1 to ${MAX_PROGRESS_UPDATES} items.`);
  }

  return updates.map((update, index) => {
    const record = requireRecord(update, `progressUpdates[${index}]`);

    return {
      stage: requireEnum(record.stage, PROGRESS_STAGES, `progressUpdates[${index}].stage`),
      message: requireProgressMessage(record.message, `progressUpdates[${index}].message`),
    };
  });
}

function requireProgressMessage(value: unknown, field: string): string {
  const message = requireString(value, field).replaceAll(/\s+/g, ' ').trim();

  if (message.length > MAX_PROGRESS_MESSAGE_CHARACTERS) {
    throw new Error(`${field} must be ${MAX_PROGRESS_MESSAGE_CHARACTERS} characters or fewer.`);
  }

  const normalized = message.toLowerCase();
  const unsafePhrase = UNSAFE_PROGRESS_PHRASES.find((phrase) => normalized.includes(phrase));

  if (unsafePhrase !== undefined) {
    throw new Error(`${field} contains unsafe implementation detail: ${unsafePhrase}.`);
  }

  return message;
}

function parseAppPlan(value: unknown): AppPackageGenerationResult['appPlan'] {
  const record = requireRecord(normalizeAppPlanAliases(value), 'appPlan');
  const grading = requireRecord(record.grading, 'appPlan.grading');

  return {
    appId: requireString(record.appId, 'appPlan.appId'),
    title: requireString(record.title, 'appPlan.title'),
    description: requireString(record.description, 'appPlan.description'),
    learningGoal: requireString(record.learningGoal, 'appPlan.learningGoal'),
    audience: requireString(record.audience, 'appPlan.audience'),
    activityType: requireEnum(record.activityType, ACTIVITY_TYPES, 'appPlan.activityType'),
    learnerFlow: requireStringArray(record.learnerFlow, 'appPlan.learnerFlow'),
    contentModel: requireRecord(record.contentModel, 'appPlan.contentModel'),
    capabilities: requireArray(record.capabilities, 'appPlan.capabilities').map(
      (capability, index) =>
        requireEnum(capability, CAPABILITIES, `appPlan.capabilities[${index}]`),
    ),
    grading: {
      mode: requireEnum(grading.mode, GRADING_MODES, 'appPlan.grading.mode'),
      maxScore: requireNumber(grading.maxScore, 'appPlan.grading.maxScore'),
      scoringSummary: requireString(grading.scoringSummary, 'appPlan.grading.scoringSummary'),
    },
    attemptEvents: requireArray(record.attemptEvents, 'appPlan.attemptEvents').map(
      (event, index) => {
        const eventRecord = requireRecord(event, `appPlan.attemptEvents[${index}]`);

        return {
          when: requireString(eventRecord.when, `appPlan.attemptEvents[${index}].when`),
          eventType: requireEnum(
            eventRecord.eventType,
            ATTEMPT_EVENT_TYPES,
            `appPlan.attemptEvents[${index}].eventType`,
          ),
          questionIdPattern: requireString(
            eventRecord.questionIdPattern,
            `appPlan.attemptEvents[${index}].questionIdPattern`,
          ),
        };
      },
    ),
    previewTests: requireStringArray(record.previewTests, 'appPlan.previewTests'),
    accessibilityNotes: requireStringArray(record.accessibilityNotes, 'appPlan.accessibilityNotes'),
    riskNotes: requireStringArray(record.riskNotes, 'appPlan.riskNotes'),
  };
}

function normalizeNormalizedRequestAliases(value: unknown): unknown {
  const record = readRecord(value);

  if (record === null) {
    return value;
  }

  return {
    ...record,
    learningGoal: record.learningGoal ?? record.learning_goal,
    contentSummary: record.contentSummary ?? record.content_summary,
    requestedActivity: record.requestedActivity ?? record.requested_activity,
    missingInformation: record.missingInformation ?? record.missing_information,
    safeToGenerate: record.safeToGenerate ?? record.safe_to_generate,
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  const record = readRecord(value);

  if (record === null) {
    throw new Error(`${field} must be a JSON object.`);
  }

  return record;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array.`);
  }

  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  return requireArray(value, field).map((item, index) => requireString(item, `${field}[${index}]`));
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number.`);
  }

  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${field} must be a boolean.`);
  }

  return value;
}

function requireEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, field: string): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    throw new Error(`${field} must use a supported value.`);
  }

  return value as T;
}
