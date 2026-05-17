import type { Capability } from '../../sdk/app-sdk.ts';
import {
  expectRecord,
  expectString,
  expectStringArray,
  parseWorkspaceFiles,
} from './binding_result.ts';
import type {
  AppGenerationActivityType,
  AppGenerationAttemptEventPlan,
  AppGenerationAttemptEventType,
  AppGenerationGradingMode,
  AppGenerationPlan,
  AppPackagePreviewer,
  AppPackagePreviewInput,
  AppPackageSourceCompileInput,
  AppPackageSourceCompiler,
  AppWriterStarterId,
} from './types.ts';

const SOURCE_COMPILER_PATH = '/app-writer/source-compiler/compile';
const PREVIEWER_PATH = '/app-writer/preview/run';

const CAPABILITIES = [
  'read_launch_context',
  'read_activity_content',
  'submit_attempt_event',
  'submit_evidence_artifact',
  'finalize_attempt',
  'read_local_state',
  'write_local_state',
] as const satisfies readonly Capability[];

const ACTIVITY_TYPES = [
  'quiz',
  'sorting',
  'matching',
  'flashcards',
  'simulation',
  'game',
  'practice',
] as const satisfies readonly AppGenerationActivityType[];

const GRADING_MODES = [
  'completion',
  'declarative',
  'browser',
] as const satisfies readonly AppGenerationGradingMode[];

const ATTEMPT_EVENT_TYPES = [
  'answer',
  'progress',
  'complete',
] as const satisfies readonly AppGenerationAttemptEventType[];

export function createAppWriterPlatformServicesHandler(input: {
  sourceCompiler?: AppPackageSourceCompiler;
  previewer?: AppPackagePreviewer;
}): { fetch(request: Request): Promise<Response> } {
  return {
    async fetch(request) {
      const url = new URL(request.url);

      if (request.method !== 'POST') {
        return jsonError(405, 'method_not_allowed', 'App writer service endpoints require POST.');
      }

      if (url.pathname === SOURCE_COMPILER_PATH) {
        if (input.sourceCompiler === undefined) {
          return jsonError(
            503,
            'source_compiler_unavailable',
            'App writer source compiler is not configured for this service.',
          );
        }

        const compileInput = parseSourceCompileInput(await readJson(request));
        const result = await input.sourceCompiler.compile(compileInput);

        return Response.json(result);
      }

      if (url.pathname === PREVIEWER_PATH) {
        if (input.previewer === undefined) {
          return jsonError(
            503,
            'previewer_unavailable',
            'App writer previewer is not configured for this service.',
          );
        }

        const previewInput = parsePreviewInput(await readJson(request));
        const previewResult = await input.previewer.preview(previewInput);

        return Response.json(previewResult);
      }

      return jsonError(404, 'not_found', 'App writer service endpoint was not found.');
    },
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new TypeError('App writer service request body must be valid JSON.');
  }
}

function parseSourceCompileInput(value: unknown): AppPackageSourceCompileInput {
  const record = expectRecord(value, 'sourceCompileInput');

  return {
    generationId: expectString(record.generationId, 'sourceCompileInput.generationId'),
    appPlan: parseAppGenerationPlan(record.appPlan, 'sourceCompileInput.appPlan'),
    selectedStarterId: expectStarterId(
      record.selectedStarterId,
      'sourceCompileInput.selectedStarterId',
    ),
    files: parseWorkspaceFiles(record.files, 'sourceCompileInput.files'),
  };
}

function parsePreviewInput(value: unknown): AppPackagePreviewInput {
  const record = expectRecord(value, 'previewInput');

  return {
    generationId: expectString(record.generationId, 'previewInput.generationId'),
    selectedStarterId: expectStarterId(record.selectedStarterId, 'previewInput.selectedStarterId'),
    files: parseWorkspaceFiles(record.files, 'previewInput.files'),
  };
}

function parseAppGenerationPlan(value: unknown, fieldName: string): AppGenerationPlan {
  const record = expectRecord(value, fieldName);

  return {
    appId: expectString(record.appId, `${fieldName}.appId`),
    title: expectString(record.title, `${fieldName}.title`),
    description: expectString(record.description, `${fieldName}.description`),
    learningGoal: expectString(record.learningGoal, `${fieldName}.learningGoal`),
    audience: expectString(record.audience, `${fieldName}.audience`),
    activityType: expectActivityType(record.activityType, `${fieldName}.activityType`),
    learnerFlow: expectStringArray(record.learnerFlow, `${fieldName}.learnerFlow`),
    contentModel: expectRecord(record.contentModel, `${fieldName}.contentModel`),
    capabilities: expectCapabilities(record.capabilities, `${fieldName}.capabilities`),
    grading: parseGrading(record.grading, `${fieldName}.grading`),
    attemptEvents: parseAttemptEvents(record.attemptEvents, `${fieldName}.attemptEvents`),
    previewTests: expectStringArray(record.previewTests, `${fieldName}.previewTests`),
    accessibilityNotes: expectStringArray(
      record.accessibilityNotes,
      `${fieldName}.accessibilityNotes`,
    ),
    riskNotes: expectStringArray(record.riskNotes, `${fieldName}.riskNotes`),
  };
}

function parseGrading(value: unknown, fieldName: string): AppGenerationPlan['grading'] {
  const record = expectRecord(value, fieldName);
  const maxScore = record.maxScore;

  if (typeof maxScore !== 'number') {
    throw new TypeError(`${fieldName}.maxScore must be a number.`);
  }

  return {
    mode: expectGradingMode(record.mode, `${fieldName}.mode`),
    maxScore,
    scoringSummary: expectString(record.scoringSummary, `${fieldName}.scoringSummary`),
  };
}

function parseAttemptEvents(value: unknown, fieldName: string): AppGenerationAttemptEventPlan[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
    const record = expectRecord(item, `${fieldName}[${index}]`);

    return {
      when: expectString(record.when, `${fieldName}[${index}].when`),
      eventType: expectAttemptEventType(record.eventType, `${fieldName}[${index}].eventType`),
      questionIdPattern: expectString(
        record.questionIdPattern,
        `${fieldName}[${index}].questionIdPattern`,
      ),
    };
  });
}

function expectStarterId(value: unknown, fieldName: string): AppWriterStarterId {
  if (value !== 'simple-activity' && value !== 'browser-autograder') {
    throw new TypeError(`${fieldName} must be a supported starter id.`);
  }

  return value;
}

function expectActivityType(value: unknown, fieldName: string): AppGenerationActivityType {
  if (!ACTIVITY_TYPES.some((activityType) => activityType === value)) {
    throw new TypeError(`${fieldName} must be a supported activity type.`);
  }

  return value as AppGenerationActivityType;
}

function expectGradingMode(value: unknown, fieldName: string): AppGenerationGradingMode {
  if (!GRADING_MODES.some((mode) => mode === value)) {
    throw new TypeError(`${fieldName} must be a supported grading mode.`);
  }

  return value as AppGenerationGradingMode;
}

function expectAttemptEventType(value: unknown, fieldName: string): AppGenerationAttemptEventType {
  if (!ATTEMPT_EVENT_TYPES.some((eventType) => eventType === value)) {
    throw new TypeError(`${fieldName} must be a supported attempt event type.`);
  }

  return value as AppGenerationAttemptEventType;
}

function expectCapabilities(value: unknown, fieldName: string): Capability[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
    if (!CAPABILITIES.some((capability) => capability === item)) {
      throw new TypeError(`${fieldName}[${index}] must be a supported capability.`);
    }

    return item;
  });
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}
