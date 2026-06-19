import type { AppGenerationModelRequestMetadata, AppGenerationModelRequestStage } from './types.ts';
import type {
  AppWriterAgentEnv,
  CloudflareAiBinding,
  CloudflareAiMessage,
  DurableObjectState,
  StoredAppWriterAgentSession,
  WorkspaceAuthorInput,
  WorkspaceRepairInput,
} from './agent_types.ts';
import { AGENT_SESSION_STORAGE_KEY } from './agent_events.ts';
import {
  createAppWriterAgentHarnessError,
  createAppWriterAgentModelRequestError,
  isAppWriterAgentModelRequestError,
} from './agent_errors.ts';
import { readCloudflareAiResponseText } from './agent_response.ts';
import {
  formatStructuredWorkspaceHarnessResultContract,
  parseStructuredWorkspaceHarnessResult,
  type WorkspaceHarnessResponse,
} from './workspace_harness_result.ts';
import { isGenerationTimeoutMessage } from './generation_error_classification.ts';
import { getWorkspaceFileRole } from './workspace_files.ts';

const STRUCTURED_MODEL_ATTEMPT_LIMIT = 3;
const MODEL_TEXT_TIMEOUT_MS = 300000;

type StructuredModelFailureCode =
  | 'model_timeout'
  | 'provider_error'
  | 'structured_response_invalid';

interface StructuredResponseFailure {
  errorCode: StructuredModelFailureCode;
  error: string;
}

export async function authorWorkspace(input: {
  state: DurableObjectState;
  env: AppWriterAgentEnv;
  request: WorkspaceAuthorInput;
}): Promise<WorkspaceHarnessResponse> {
  return await runStructuredModelLoop({
    state: input.state,
    env: input.env,
    stage: 'author',
    progressStage: 'building_package',
    prompt: {
      task: 'author_lantern_learning_app_workspace',
      generationInput: input.request.generationInput,
      planning: input.request.planning,
      instructions: readWorkspaceFile(input.request.workspace.files, 'AGENTS.md'),
      workspaceFiles: serializeWorkspaceFiles(input.request.workspace.files),
      definitionOfDone:
        'Return the full next generated Lantern workspace file snapshot needed to implement the plan. Protected workspace context files such as AGENTS.md and .lantern/contracts/** are read-only context; do not modify or return them. Lantern preserves protected context outside the generated snapshot. Do not create backend code, external network calls, package installs, localStorage, sessionStorage, LMS code, Cloudflare bindings, Worker code, or Durable Object code.',
    },
  });
}

export async function repairWorkspace(input: {
  state: DurableObjectState;
  env: AppWriterAgentEnv;
  request: WorkspaceRepairInput;
}): Promise<WorkspaceHarnessResponse> {
  return await runStructuredModelLoop({
    state: input.state,
    env: input.env,
    stage: 'repair',
    progressStage: 'repairing_package',
    prompt: {
      task: 'repair_lantern_learning_app_workspace',
      generationInput: input.request.generationInput,
      previousResult: {
        normalizedRequest: input.request.previousResult.normalizedRequest,
        appPlan: input.request.previousResult.appPlan,
        selectedStarterId: input.request.previousResult.selectedStarterId,
      },
      validationFindings: input.request.validationFindings,
      repairAttempt: input.request.repairAttempt,
      instructions: readWorkspaceFile(input.request.workspace.files, 'AGENTS.md'),
      workspaceFiles: serializeWorkspaceFiles(input.request.workspace.files),
      definitionOfDone:
        'Return the repaired full next generated Lantern workspace file snapshot. Omit any generated package or evidence file that should be removed. Protected workspace context files such as AGENTS.md and .lantern/contracts/** are read-only context; do not modify or return them. Lantern preserves protected context outside the generated snapshot. Repair the supplied diagnostics without changing the app concept or weakening preview tests.',
    },
  });
}

async function runStructuredModelLoop(input: {
  state: DurableObjectState;
  env: AppWriterAgentEnv;
  stage: AppGenerationModelRequestStage;
  progressStage: WorkspaceHarnessResponse['progressUpdates'][number]['stage'];
  prompt: Record<string, unknown>;
}): Promise<WorkspaceHarnessResponse> {
  const failures: StructuredResponseFailure[] = [];
  const modelRequestMetadata: AppGenerationModelRequestMetadata[] = [];

  for (let attempt = 1; attempt <= STRUCTURED_MODEL_ATTEMPT_LIMIT; attempt += 1) {
    await storeModelProgress({
      state: input.state,
      stage: input.stage,
      attempt,
    });

    let modelResult: { text: string; metadata: AppGenerationModelRequestMetadata };

    try {
      modelResult = await runModelText({
        env: input.env,
        messages: buildStructuredWorkspaceMessages({
          prompt: input.prompt,
          stage: input.stage,
          progressStage: input.progressStage,
          attempt,
          failures,
        }),
        stage: input.stage,
        attempt,
      });
      modelRequestMetadata.push(modelResult.metadata);
    } catch (error) {
      if (isAppWriterAgentModelRequestError(error)) {
        modelRequestMetadata.push(error.metadata);
        failures.push({
          errorCode: error.code,
          error: error.message,
        });
        continue;
      }

      throw error;
    }

    try {
      const parsed = parseStructuredModelJson(modelResult.text);

      return {
        ...parsed,
        progressUpdates: parsed.progressUpdates.length === 0
          ? [
            {
              stage: input.progressStage,
              message: `Completed structured ${input.stage} workspace generation.`,
            },
          ]
          : parsed.progressUpdates,
        notes: [
          `Workspace structured harness completed ${input.stage} on attempt ${attempt}.`,
          ...buildHarnessFailureNotes(failures),
          ...parsed.notes,
        ],
        modelRequestMetadata,
      };
    } catch (error) {
      updateLastMetadataFailure(modelRequestMetadata, 'structured_response_invalid');
      failures.push({
        errorCode: 'structured_response_invalid',
        error: error instanceof Error ? error.message : 'Structured response was invalid.',
      });
      continue;
    }
  }

  const lastFailure = failures.at(-1);
  throw createAppWriterAgentHarnessError({
    code: lastFailure?.errorCode ?? 'structured_response_invalid',
    message: `Workspace structured harness failed during ${input.stage}: ${
      lastFailure?.error ?? 'unknown structured response error'
    }`,
    modelRequestMetadata,
    notes: buildHarnessFailureNotes(failures),
  });
}

function parseStructuredModelJson(text: string): ReturnType<
  typeof parseStructuredWorkspaceHarnessResult
> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new TypeError(
      `workspaceHarnessModelResult must be raw valid JSON. ${
        error instanceof Error ? error.message : 'JSON parsing failed.'
      }`,
    );
  }

  return parseStructuredWorkspaceHarnessResult(parsed, 'workspaceHarnessModelResult');
}

async function runModelText(input: {
  env: AppWriterAgentEnv;
  messages: CloudflareAiMessage[];
  stage: AppGenerationModelRequestStage;
  attempt: number;
}): Promise<{ text: string; metadata: AppGenerationModelRequestMetadata }> {
  const ai = input.env.AI;

  if (!isCloudflareAiBinding(ai)) {
    throw new Error('App writer structured harness requires a Workers AI binding named AI.');
  }

  const model = input.env.APP_WRITER_MODEL?.trim();

  if (!model) {
    throw new Error('App writer structured harness requires APP_WRITER_MODEL.');
  }

  const startedAt = Date.now();

  try {
    const text = await withTimeout(
      (async () => {
        const response = await ai.run(model, {
          messages: input.messages,
          stream: true,
        });

        return await readCloudflareAiResponseText(response);
      })(),
      MODEL_TEXT_TIMEOUT_MS,
      `Cloudflare AI model request timed out during app writer ${input.stage} attempt ${input.attempt}.`,
    );

    return {
      text,
      metadata: {
        provider: 'cloudflare',
        model,
        requestId: null,
        durationMs: Date.now() - startedAt,
        responseCharacters: text.length,
        stage: input.stage,
        attempt: input.attempt,
        outcome: 'succeeded',
        errorCode: null,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workers AI request failed.';
    const errorCode = isGenerationTimeoutMessage(message) ? 'model_timeout' : 'provider_error';

    throw createAppWriterAgentModelRequestError({
      code: errorCode,
      message,
      metadata: {
        provider: 'cloudflare',
        model,
        requestId: null,
        durationMs: Date.now() - startedAt,
        responseCharacters: null,
        stage: input.stage,
        attempt: input.attempt,
        outcome: errorCode === 'model_timeout' ? 'timed_out' : 'failed',
        errorCode,
      },
    });
  }
}

async function storeModelProgress(input: {
  state: DurableObjectState;
  stage: AppGenerationModelRequestStage;
  attempt: number;
}): Promise<void> {
  const session = await input.state.storage.get<StoredAppWriterAgentSession>(
    AGENT_SESSION_STORAGE_KEY,
  );

  if (session === undefined) {
    return;
  }

  await input.state.storage.put(AGENT_SESSION_STORAGE_KEY, {
    ...session,
    currentModelStage: input.stage,
    currentModelAttempt: input.attempt,
  });
}

function buildStructuredWorkspaceMessages(input: {
  prompt: Record<string, unknown>;
  stage: AppGenerationModelRequestStage;
  progressStage: WorkspaceHarnessResponse['progressUpdates'][number]['stage'];
  attempt: number;
  failures: readonly StructuredResponseFailure[];
}): CloudflareAiMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are Lantern App Writer.',
        'Return exactly one raw JSON object and nothing else.',
        'Do not return Markdown, code fences, prose, JavaScript, imports, package installs, fetch calls, LMS APIs, Cloudflare bindings, localStorage, sessionStorage, backend code, Worker code, or Durable Object code.',
        'Protected workspace context files such as AGENTS.md and .lantern/contracts/** are read-only instructions. Use them for context, but do not modify or return them in files; Lantern preserves protected context separately.',
        'The JSON object must match this contract:',
        formatStructuredWorkspaceHarnessResultContract({ progressStage: input.progressStage }),
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Stage: ${input.stage}`,
        `Attempt: ${input.attempt}`,
        'Lantern authoring request:',
        JSON.stringify(input.prompt, null, 2),
        input.failures.length === 0
          ? 'Previous structured response failures: none'
          : `Previous structured response failures:\n${JSON.stringify(input.failures, null, 2)}`,
      ].join('\n\n'),
    },
  ];
}

function serializeWorkspaceFiles(files: readonly { path: string; contents: string }[]) {
  return files.map((file) => ({
    path: file.path,
    role: getWorkspaceFileRole(file),
    contents: file.contents,
  }));
}

function readWorkspaceFile(files: readonly { path: string; contents: string }[], path: string) {
  return files.find((file) => file.path === path)?.contents ?? null;
}

function updateLastMetadataFailure(
  metadata: AppGenerationModelRequestMetadata[],
  errorCode: StructuredModelFailureCode,
): void {
  const last = metadata.at(-1);

  if (last === undefined) {
    return;
  }

  metadata.splice(metadata.length - 1, 1, {
    ...last,
    outcome: 'failed',
    errorCode,
  });
}

function buildHarnessFailureNotes(failures: readonly StructuredResponseFailure[]): string[] {
  return failures.slice(-3).map((failure, index) =>
    `Harness failure ${index + 1}: ${failure.errorCode}: ${failure.error}`
  );
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

function isCloudflareAiBinding(value: unknown): value is CloudflareAiBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<CloudflareAiBinding>).run === 'function'
  );
}
