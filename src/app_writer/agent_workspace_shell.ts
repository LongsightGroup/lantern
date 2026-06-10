import { getWorkspaceFileRole } from './workspace_files.ts';
import type {
  AppGenerationModelRequestMetadata,
  AppGenerationModelRequestStage,
  AppWriterWorkspaceFile,
} from './types.ts';
import type {
  AppWriterAgentEnv,
  CloudflareAiBinding,
  CloudflareAiMessage,
  DurableObjectState,
  StoredAppWriterAgentSession,
  WorkspaceAuthorInput,
  WorkspaceHarnessResponse,
  WorkspaceRepairInput,
} from './agent_types.ts';
import { AGENT_SESSION_STORAGE_KEY } from './agent_events.ts';
import {
  createAppWriterAgentHarnessError,
  createAppWriterAgentModelRequestError,
  isAppWriterAgentModelRequestError,
} from './agent_errors.ts';
import {
  normalizeWorkspaceCodeForExecution,
  readCloudflareAiResponseText,
} from './agent_response.ts';
import { isGenerationTimeoutMessage } from './generation_error_classification.ts';

const SHELL_CODE_ATTEMPT_LIMIT = 3;
const MODEL_TEXT_TIMEOUT_MS = 300000;
const WORKSPACE_FILE_GLOB = '/**/*';

type WorkspaceConstructor = (typeof import('@cloudflare/shell'))['Workspace'];
type ShellWorkspace = InstanceType<WorkspaceConstructor>;
type ShellWorkspaceOptions = ConstructorParameters<WorkspaceConstructor>[0];
type DynamicWorkerExecutorConstructor =
  (typeof import('@cloudflare/codemode'))['DynamicWorkerExecutor'];
type ShellExecutor = InstanceType<DynamicWorkerExecutorConstructor>;
type ShellExecutorOptions = ConstructorParameters<DynamicWorkerExecutorConstructor>[0];

interface WorkspaceCodeFailure {
  errorCode: string;
  error: string;
  logs: string[];
}

export async function authorWorkspace(input: {
  state: DurableObjectState;
  env: AppWriterAgentEnv;
  request: WorkspaceAuthorInput;
}): Promise<WorkspaceHarnessResponse> {
  const workspace = await createShellWorkspace({
    state: input.state,
    env: input.env,
    generationId: input.request.generationInput.generationId,
  });
  await syncWorkspaceFiles(workspace, input.request.workspace.files);

  const result = await runWorkspaceCodeLoop({
    state: input.state,
    env: input.env,
    workspace,
    stage: 'author',
    prompt: {
      task: 'author_lantern_learning_app_workspace',
      generationInput: input.request.generationInput,
      planning: input.request.planning,
      instructions: readWorkspaceFile(input.request.workspace.files, 'AGENTS.md'),
      initialTree: summarizeWorkspaceFiles(input.request.workspace.files),
      definitionOfDone:
        'Edit the real workspace until the Lantern package files implement the plan. Use state.* filesystem APIs. Do not create backend code, external network calls, package installs, localStorage, sessionStorage, LMS code, or Cloudflare bindings.',
    },
  });

  return {
    files: await readShellWorkspaceFiles(workspace, input.request.workspace.files),
    progressUpdates: [
      {
        stage: 'building_package',
        message: 'Authored the Lantern workspace in the shell harness.',
      },
    ],
    notes: result.notes,
    modelRequestMetadata: result.modelRequestMetadata,
    validationFindings: [],
  };
}

export async function repairWorkspace(input: {
  state: DurableObjectState;
  env: AppWriterAgentEnv;
  request: WorkspaceRepairInput;
}): Promise<WorkspaceHarnessResponse> {
  const workspace = await createShellWorkspace({
    state: input.state,
    env: input.env,
    generationId: input.request.generationInput.generationId,
  });
  await syncWorkspaceFiles(workspace, input.request.workspace.files);

  const result = await runWorkspaceCodeLoop({
    state: input.state,
    env: input.env,
    workspace,
    stage: 'repair',
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
      currentTree: summarizeWorkspaceFiles(input.request.workspace.files),
      definitionOfDone:
        'Repair the real workspace diagnostics without changing the app concept. Use state.* filesystem APIs and keep all generated package files inside the Lantern allowlist.',
    },
  });

  return {
    files: await readShellWorkspaceFiles(workspace, input.request.workspace.files),
    progressUpdates: [
      {
        stage: 'repairing_package',
        message: 'Repaired the Lantern workspace in the shell harness.',
      },
    ],
    notes: result.notes,
    modelRequestMetadata: result.modelRequestMetadata,
    validationFindings: [],
  };
}

async function createShellWorkspace(input: {
  state: DurableObjectState;
  env: AppWriterAgentEnv;
  generationId: string;
}): Promise<ShellWorkspace> {
  const sql = input.state.storage.sql;

  if (sql === undefined) {
    throw new Error('App writer shell harness requires SQLite Durable Object storage.');
  }
  const { Workspace } = await import('@cloudflare/shell');

  return new Workspace({
    sql,
    r2: input.env.PACKAGE_ARTIFACTS as ShellWorkspaceOptions['r2'],
    name: () => toShellWorkspaceNamespace(input.generationId),
    namespace: toShellWorkspaceNamespace(input.generationId),
  });
}

async function runWorkspaceCodeLoop(input: {
  state: DurableObjectState;
  env: AppWriterAgentEnv;
  workspace: ShellWorkspace;
  stage: 'author' | 'repair';
  prompt: Record<string, unknown>;
}): Promise<{
  notes: string[];
  modelRequestMetadata: AppGenerationModelRequestMetadata[];
}> {
  const executor = await createExecutor(input.env);
  const { normalizeCode, resolveProvider } = await import('@cloudflare/codemode');
  const { stateTools } = await import('@cloudflare/shell/workers');
  const stateProvider = stateTools(input.workspace);
  const failures: WorkspaceCodeFailure[] = [];
  const modelRequestMetadata: AppGenerationModelRequestMetadata[] = [];

  for (let attempt = 1; attempt <= SHELL_CODE_ATTEMPT_LIMIT; attempt += 1) {
    await storeModelProgress({
      state: input.state,
      stage: input.stage,
      attempt,
    });
    let rawCode: string;
    try {
      const modelResult = await runModelText({
        env: input.env,
        messages: buildWorkspaceCodeMessages({
          prompt: input.prompt,
          stage: input.stage,
          attempt,
          failures,
          toolTypes: readToolProviderTypes(stateProvider),
        }),
        stage: input.stage,
        attempt,
      });
      rawCode = modelResult.text;
      modelRequestMetadata.push(modelResult.metadata);
    } catch (error) {
      if (isAppWriterAgentModelRequestError(error)) {
        modelRequestMetadata.push(error.metadata);
        failures.push({
          errorCode: error.code,
          error: error.message,
          logs: [],
        });
        continue;
      }

      throw error;
    }
    let code: string;

    try {
      code = normalizeWorkspaceCodeForExecution(rawCode, normalizeCode);
    } catch (error) {
      updateLastMetadataFailure(modelRequestMetadata, 'code_normalization_failed');
      failures.push({
        errorCode: 'code_normalization_failed',
        error: error instanceof Error ? error.message : 'Code normalization failed.',
        logs: [],
      });
      continue;
    }

    let execution: Awaited<ReturnType<ShellExecutor['execute']>>;

    try {
      execution = await executor.execute(code, [resolveProvider(stateProvider)]);
    } catch (error) {
      failures.push({
        errorCode: 'code_execution_failed',
        error: error instanceof Error ? error.message : 'Workspace edit code execution failed.',
        logs: [],
      });
      updateLastMetadataFailure(modelRequestMetadata, 'code_execution_failed');
      continue;
    }

    if (execution.error === undefined) {
      return {
        modelRequestMetadata,
        notes: [
          `Workspace shell harness completed ${input.stage} on attempt ${attempt}.`,
          ...normalizeExecutionLogs(execution.logs),
        ],
      };
    }

    failures.push({
      errorCode: 'code_execution_failed',
      error: execution.error,
      logs: normalizeExecutionLogs(execution.logs),
    });
    updateLastMetadataFailure(modelRequestMetadata, 'code_execution_failed');
  }

  const lastFailure = failures.at(-1);
  throw createAppWriterAgentHarnessError({
    code: lastFailure?.errorCode ?? 'code_execution_failed',
    message: `Workspace shell harness failed during ${input.stage}: ${
      lastFailure?.error ?? 'unknown execution error'
    }`,
    modelRequestMetadata,
    notes: buildHarnessFailureNotes(failures),
  });
}

async function createExecutor(env: AppWriterAgentEnv): Promise<ShellExecutor> {
  const loader = env.LOADER;

  if (loader === undefined) {
    throw new Error('App writer shell harness requires a Worker Loader binding named LOADER.');
  }
  const { DynamicWorkerExecutor } = await import('@cloudflare/codemode');

  return new DynamicWorkerExecutor({
    loader,
    globalOutbound: null,
    timeout: 120000,
  });
}

async function runModelText(input: {
  env: AppWriterAgentEnv;
  messages: CloudflareAiMessage[];
  stage: AppGenerationModelRequestStage;
  attempt: number;
}): Promise<{ text: string; metadata: AppGenerationModelRequestMetadata }> {
  const ai = input.env.AI;

  if (!isCloudflareAiBinding(ai)) {
    throw new Error('App writer shell harness requires a Workers AI binding named AI.');
  }

  const model = input.env.APP_WRITER_MODEL?.trim();

  if (!model) {
    throw new Error('App writer shell harness requires APP_WRITER_MODEL.');
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

async function syncWorkspaceFiles(
  workspace: ShellWorkspace,
  files: readonly AppWriterWorkspaceFile[],
): Promise<void> {
  const incomingPaths = new Set(files.map((file) => toShellPath(file.path)));
  const existingFiles = await listShellWorkspaceFilePaths(workspace);

  for (const path of existingFiles) {
    if (!incomingPaths.has(path)) {
      await workspace.rm(path, { force: true });
    }
  }

  for (const file of files) {
    const path = toShellPath(file.path);
    await workspace.mkdir(parentPath(path), { recursive: true });
    await workspace.writeFile(path, file.contents);
  }
}

async function readShellWorkspaceFiles(
  workspace: ShellWorkspace,
  seedFiles: readonly AppWriterWorkspaceFile[],
): Promise<AppWriterWorkspaceFile[]> {
  const roleByPath = new Map(seedFiles.map((file) => [file.path, getWorkspaceFileRole(file)]));
  const paths = await listShellWorkspaceFilePaths(workspace);
  const files: AppWriterWorkspaceFile[] = [];

  for (const path of paths) {
    const relativePath = fromShellPath(path);
    const contents = await workspace.readFile(path);

    if (contents === null) {
      continue;
    }

    const file: AppWriterWorkspaceFile = {
      path: relativePath,
      contents,
      role: roleByPath.get(relativePath) ?? getWorkspaceFileRole({ path: relativePath, contents }),
    };
    files.push(file);
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function listShellWorkspaceFilePaths(workspace: ShellWorkspace): Promise<string[]> {
  const entries = await workspace.glob(WORKSPACE_FILE_GLOB);

  return entries
    .filter((entry) => entry.type === 'file')
    .map((entry) => entry.path)
    .sort();
}

function buildWorkspaceCodeMessages(input: {
  prompt: Record<string, unknown>;
  stage: 'author' | 'repair';
  attempt: number;
  failures: readonly WorkspaceCodeFailure[];
  toolTypes: string;
}): CloudflareAiMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are Lantern App Writer running in Code Mode. Return only JavaScript for one async arrow function. The function edits the real Lantern workspace with state.* filesystem tools. Do not return Markdown, prose, JSON, imports, package installs, fetch, LMS APIs, Cloudflare bindings, localStorage, sessionStorage, or backend code.',
    },
    {
      role: 'user',
      content: [
        `Stage: ${input.stage}`,
        `Attempt: ${input.attempt}`,
        'Return shape: async () => { /* edit files with state.* */ return { edited: string[] }; }',
        'State tool types:',
        input.toolTypes,
        'Lantern authoring request:',
        JSON.stringify(input.prompt, null, 2),
        input.failures.length === 0
          ? 'Previous execution failures: none'
          : `Previous execution failures:\n${JSON.stringify(input.failures, null, 2)}`,
      ].join('\n\n'),
    },
  ];
}

function readToolProviderTypes(provider: { types?: unknown }): string {
  return typeof provider.types === 'string' ? provider.types : 'declare const state: unknown;';
}

function summarizeWorkspaceFiles(
  files: readonly AppWriterWorkspaceFile[],
): Array<{ path: string; role: string; bytes: number }> {
  return files.map((file) => ({
    path: file.path,
    role: getWorkspaceFileRole(file),
    bytes: new TextEncoder().encode(file.contents).length,
  }));
}

function readWorkspaceFile(files: readonly AppWriterWorkspaceFile[], path: string): string | null {
  return files.find((file) => file.path === path)?.contents ?? null;
}

function normalizeExecutionLogs(logs: readonly string[] | undefined): string[] {
  return (logs ?? []).filter((log) => log.trim() !== '').slice(0, 10);
}

function updateLastMetadataFailure(
  metadata: AppGenerationModelRequestMetadata[],
  errorCode: string,
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

function buildHarnessFailureNotes(failures: readonly WorkspaceCodeFailure[]): string[] {
  return failures.slice(-3).map((failure, index) => {
    const logs = failure.logs.length === 0 ? '' : ` Logs: ${failure.logs.join(' | ')}`;

    return `Harness failure ${index + 1}: ${failure.errorCode}: ${failure.error}${logs}`;
  });
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

function toShellPath(path: string): string {
  return `/${path.replace(/^\/+/, '')}`;
}

function fromShellPath(path: string): string {
  return path.replace(/^\/+/, '');
}

function toShellWorkspaceNamespace(generationId: string): string {
  const normalized = generationId.replaceAll(/[^a-zA-Z0-9_]/g, '_');

  return /^[a-zA-Z]/.test(normalized) ? normalized : `appwriter_${normalized}`;
}

function parentPath(path: string): string {
  const index = path.lastIndexOf('/');

  return index <= 0 ? '/' : path.slice(0, index);
}
