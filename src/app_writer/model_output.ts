import type { Capability } from '../../sdk/app-sdk.ts';
import type {
  AppGenerationProgressStage,
  AppGenerationActivityType,
  AppGenerationAttemptEventType,
  AppGenerationGradingMode,
  AppPackageGenerationResult,
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
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('App package generator returned invalid JSON.');
  }

  return parseAppPackageGenerationResult(parsed);
}

export function parseAppPackageGenerationResult(value: unknown): AppPackageGenerationResult {
  const record = requireRecord(value, 'App package generator output must be a JSON object.');
  const normalizedRequest = requireRecord(record.normalizedRequest, 'normalizedRequest');

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
  const record = requireRecord(value, 'appPlan');
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

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
