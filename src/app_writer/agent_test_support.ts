import type { CloudflareAiBinding, CloudflareAiMessage } from './agent_types.ts';
import { emptyAppWriterSelectedContext } from './context.ts';
import type {
  AppGenerationModelRequestMetadata,
  AppGenerationPlanningResult,
  AppGenerationValidationFinding,
  AppGenerationWorkspaceRecord,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
  AppWriterWorkspaceFile,
} from './types.ts';

export interface RecordedAiCall {
  model: string;
  input: {
    messages: CloudflareAiMessage[];
    stream?: true;
  };
}

export interface AgentErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
    notes?: string[];
    modelRequestMetadata?: AppGenerationModelRequestMetadata[];
  };
}

export function createFakeAiBinding(
  responses: readonly unknown[],
  calls: RecordedAiCall[] = [],
): CloudflareAiBinding {
  let index = 0;

  return {
    run(model, input) {
      calls.push({
        model,
        input: {
          messages: input.messages.map((message) => ({ ...message })),
          ...(input.stream === true ? { stream: true } : {}),
        },
      });

      const response = responses[index] ?? responses.at(-1);
      index += 1;

      if (response === undefined) {
        return Promise.reject(new Error('No fake AI response configured.'));
      }

      if (response instanceof Error) {
        return Promise.reject(response);
      }

      return Promise.resolve(response);
    },
  };
}

export function buildWorkspaceAuthorInput(): {
  generationInput: AppPackageGenerationInput;
  planning: AppGenerationPlanningResult;
  workspace: AppGenerationWorkspaceRecord;
} {
  return {
    generationInput: minimalGenerationInput(),
    planning: minimalPlanningResult(),
    workspace: minimalWorkspace(),
  };
}

export function buildWorkspaceRepairInput(): {
  generationInput: AppPackageGenerationInput;
  previousResult: AppPackageGenerationResult;
  validationFindings: AppGenerationValidationFinding[];
  repairAttempt: number;
  workspace: AppGenerationWorkspaceRecord;
} {
  const workspace = minimalWorkspace();
  const disallowedFile: AppWriterWorkspaceFile = {
    path: 'server/worker.ts',
    contents: 'export default { fetch() { return new Response("blocked"); } };\n',
    role: 'package',
  };
  const finding: AppGenerationValidationFinding = {
    code: 'file_path_not_allowed',
    severity: 'error',
    message: 'Generated package file server/worker.ts is outside the starter allowlist.',
    file: 'server/worker.ts',
    field: null,
    fix: 'Remove the disallowed backend file.',
    detail: {},
  };

  return {
    generationInput: minimalGenerationInput(),
    previousResult: {
      ...minimalPlanningResult(),
      files: [...workspace.files, disallowedFile],
      progressUpdates: [],
      notes: [],
      validationFindings: [finding],
    },
    validationFindings: [finding],
    repairAttempt: 1,
    workspace: {
      ...workspace,
      files: [...workspace.files, disallowedFile],
      validationFindings: [finding],
      repairAttemptCount: 1,
    },
  };
}

export function minimalWorkspace(): AppGenerationWorkspaceRecord {
  return {
    generationId: 'generation-1',
    selectedStarterId: 'simple-activity',
    files: [
      {
        path: 'AGENTS.md',
        contents: 'Generated apps stay inside the package contract.\n',
        role: 'instruction',
      },
      {
        path: 'manifest.json',
        contents: '{"appId":"structured-demo"}\n',
        role: 'package',
      },
    ],
    generationPlan: [],
    validationFindings: [],
    repairAttemptCount: 0,
    updatedAt: '2026-05-16T12:00:00.000Z',
  };
}

export function createMemoryDurableObjectState() {
  const stored = new Map<string, unknown>();

  return {
    storage: {
      get<T>(key: string): Promise<T | undefined> {
        return Promise.resolve(stored.get(key) as T | undefined);
      },
      put<T>(key: string, value: T): Promise<void> {
        stored.set(key, structuredClone(value));

        return Promise.resolve();
      },
    },
  };
}

function minimalGenerationInput(): AppPackageGenerationInput {
  return {
    generationId: 'generation-1',
    ownerId: 'admin',
    promptText: 'Create a small matching app.',
    requestedAppId: 'structured-demo',
    selectedStarterId: 'simple-activity',
    selectedContext: emptyAppWriterSelectedContext('simple-activity'),
    authoringMode: 'typescript',
    createdAt: '2026-05-16T12:00:00.000Z',
  };
}

function minimalPlanningResult(): AppGenerationPlanningResult {
  return {
    normalizedRequest: {
      learningGoal: 'Practice matching terms.',
      audience: 'Learners',
      contentSummary: 'Term and definition pairs.',
      requestedActivity: 'matching practice',
      constraints: [],
      missingInformation: [],
      safeToGenerate: true,
    },
    appPlan: {
      appId: 'structured-demo',
      title: 'Structured Demo',
      description: 'A small matching activity.',
      learningGoal: 'Practice matching terms.',
      audience: 'Learners',
      activityType: 'matching',
      learnerFlow: ['Open the app.', 'Match the terms.', 'Finish the attempt.'],
      contentModel: {
        pairs: [
          {
            term: 'Lantern',
            definition: 'A governed learning app runtime.',
          },
        ],
      },
      capabilities: ['read_activity_content', 'finalize_attempt'],
      grading: {
        mode: 'completion',
        maxScore: 100,
        scoringSummary: 'Completion credit.',
      },
      attemptEvents: [
        {
          when: 'Learner completes the activity.',
          eventType: 'complete',
          questionIdPattern: 'activity',
        },
      ],
      previewTests: ['renders the app title'],
      accessibilityNotes: [],
      riskNotes: [],
    },
    selectedStarterId: 'simple-activity',
    progressUpdates: [],
    notes: [],
  };
}
