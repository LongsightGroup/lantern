import { APP_GENERATION_AUDIT_EVENT_TYPES } from './service.ts';
import { getWorkspaceFileRole } from './workspace_files.ts';
import type {
  AppGenerationPlanningResult,
  AppGenerationPlanStep,
  AppGenerationPlanStepId,
  AppGenerationPlanStepStatus,
  AppGenerationWorkspaceRecord,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
  AppWriterWorkspaceFile,
} from './types.ts';
import type { AppWriterAgentObserveInput, AppWriterAgentSessionSnapshot } from './agent_session.ts';
import { type D1Database, isD1Database } from '../db/d1.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import { createD1PackageReviewRepository } from '../package_review/repository_package_versions_d1.ts';
import type { RuntimeArtifactBucket } from '../runtime/artifact_store.ts';

const AGENT_SESSION_STORAGE_KEY = 'appWriterAgentSession';
const SSE_RETRY_MS = 2000;
const SSE_POLL_INTERVAL_MS = 2000;
const SSE_MAX_POLLS = 30;
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

interface DurableObjectState {
  storage: {
    sql?: ShellWorkspaceOptions['sql'];
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
  };
}

interface AppWriterAgentEnv extends Record<string, unknown> {
  DB?: D1Database;
  AI?: CloudflareAiBinding;
  LOADER?: ShellExecutorOptions['loader'];
  PACKAGE_ARTIFACTS?: RuntimeArtifactBucket;
  APP_WRITER_MODEL?: string;
}

interface CloudflareAiMessage {
  role: 'system' | 'user';
  content: string;
}

interface CloudflareAiBinding {
  run(
    model: string,
    input: {
      messages: CloudflareAiMessage[];
      stream?: true;
    },
  ): Promise<unknown>;
}

interface StoredAppWriterAgentSession {
  generationId: string;
  ownerId: string;
  workflowInstanceId: string | null;
  observedAt: string;
}

export class AppWriterAgent {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: AppWriterAgentEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/observe')) {
      if (request.method !== 'POST') {
        return jsonError(405, 'method_not_allowed', 'App writer Agent observe requires POST.');
      }

      const input = await readObserveInput(request);
      await this.state.storage.put(AGENT_SESSION_STORAGE_KEY, input);

      return Response.json({ ok: true });
    }

    if (url.pathname.endsWith('/state')) {
      if (request.method !== 'GET') {
        return jsonError(405, 'method_not_allowed', 'App writer Agent state requires GET.');
      }

      return Response.json(await this.loadSnapshot());
    }

    if (url.pathname.endsWith('/events')) {
      if (request.method !== 'GET') {
        return jsonError(405, 'method_not_allowed', 'App writer Agent events require GET.');
      }

      return this.streamEvents();
    }

    if (url.pathname.endsWith('/workspace-harness/author')) {
      if (request.method !== 'POST') {
        return jsonError(405, 'method_not_allowed', 'Workspace harness authoring requires POST.');
      }

      return Response.json(await this.authorWorkspace(await readWorkspaceAuthorInput(request)));
    }

    if (url.pathname.endsWith('/workspace-harness/repair')) {
      if (request.method !== 'POST') {
        return jsonError(405, 'method_not_allowed', 'Workspace harness repair requires POST.');
      }

      return Response.json(await this.repairWorkspace(await readWorkspaceRepairInput(request)));
    }

    return jsonError(404, 'not_found', 'App writer Agent endpoint was not found.');
  }

  private streamEvents(): Response {
    const encoder = new TextEncoder();
    let lastPayload = '';

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        controller.enqueue(encoder.encode(`retry: ${SSE_RETRY_MS}\n\n`));

        for (let poll = 0; poll < SSE_MAX_POLLS; poll += 1) {
          const snapshot = await this.loadSnapshot();
          const payload = JSON.stringify(snapshot);

          if (payload !== lastPayload) {
            controller.enqueue(encoder.encode(`event: snapshot\ndata: ${payload}\n\n`));
            lastPayload = payload;
          }

          if (
            snapshot.status === 'unknown' ||
            snapshot.status === 'failed' ||
            snapshot.status === 'saved_pending_version'
          ) {
            break;
          }

          await sleep(SSE_POLL_INTERVAL_MS);
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=UTF-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  }

  private async loadSnapshot(): Promise<AppWriterAgentSessionSnapshot> {
    const session =
      await this.state.storage.get<StoredAppWriterAgentSession>(AGENT_SESSION_STORAGE_KEY);
    const generationId = session?.generationId ?? 'unknown';
    const baseSnapshot = buildUnknownSnapshot(session);

    if (!isD1Database(this.env.DB) || session === undefined) {
      return baseSnapshot;
    }

    const repository = createD1PackageReviewRepository(this.env.DB);
    const run = await repository.getAppGenerationRunById(generationId);

    if (run === null) {
      return baseSnapshot;
    }

    const workspace = await repository.getAppGenerationWorkspaceByGenerationId(generationId);
    const currentStep = workspace === null ? null : selectCurrentPlanStep(workspace.generationPlan);

    return {
      generationId,
      status: run.status,
      currentPlanStepId: currentStep?.id ?? null,
      currentPlanStepStatus: currentStep?.status ?? null,
      workflowInstanceId: session.workflowInstanceId,
      packageVersionId: run.packageVersionId,
      repairAttemptCount: run.repairAttemptCount,
      validationFindingCount: run.validationFindings.length,
      activityEventCount: await countGenerationActivityEvents(repository, generationId),
      updatedAt: run.updatedAt,
    };
  }

  private async authorWorkspace(input: WorkspaceAuthorInput): Promise<WorkspaceHarnessResponse> {
    const workspace = await this.createShellWorkspace(input.generationInput.generationId);
    await syncWorkspaceFiles(workspace, input.workspace.files);

    const result = await this.runWorkspaceCodeLoop({
      workspace,
      stage: 'author',
      prompt: {
        task: 'author_lantern_learning_app_workspace',
        generationInput: input.generationInput,
        planning: input.planning,
        instructions: readWorkspaceFile(input.workspace.files, 'AGENTS.md'),
        initialTree: summarizeWorkspaceFiles(input.workspace.files),
        definitionOfDone:
          'Edit the real workspace until the Lantern package files implement the plan. Use state.* filesystem APIs. Do not create backend code, external network calls, package installs, localStorage, sessionStorage, LMS code, or Cloudflare bindings.',
      },
    });

    return {
      files: await readShellWorkspaceFiles(workspace, input.workspace.files),
      progressUpdates: [
        {
          stage: 'building_package',
          message: 'Authored the Lantern workspace in the shell harness.',
        },
      ],
      notes: result.notes,
      validationFindings: [],
    };
  }

  private async repairWorkspace(input: WorkspaceRepairInput): Promise<WorkspaceHarnessResponse> {
    const workspace = await this.createShellWorkspace(input.generationInput.generationId);
    await syncWorkspaceFiles(workspace, input.workspace.files);

    const result = await this.runWorkspaceCodeLoop({
      workspace,
      stage: 'repair',
      prompt: {
        task: 'repair_lantern_learning_app_workspace',
        generationInput: input.generationInput,
        previousResult: {
          normalizedRequest: input.previousResult.normalizedRequest,
          appPlan: input.previousResult.appPlan,
          selectedStarterId: input.previousResult.selectedStarterId,
        },
        validationFindings: input.validationFindings,
        repairAttempt: input.repairAttempt,
        instructions: readWorkspaceFile(input.workspace.files, 'AGENTS.md'),
        currentTree: summarizeWorkspaceFiles(input.workspace.files),
        definitionOfDone:
          'Repair the real workspace diagnostics without changing the app concept. Use state.* filesystem APIs and keep all generated package files inside the Lantern allowlist.',
      },
    });

    return {
      files: await readShellWorkspaceFiles(workspace, input.workspace.files),
      progressUpdates: [
        {
          stage: 'repairing_package',
          message: 'Repaired the Lantern workspace in the shell harness.',
        },
      ],
      notes: result.notes,
      validationFindings: [],
    };
  }

  private async createShellWorkspace(generationId: string): Promise<ShellWorkspace> {
    const sql = this.state.storage.sql;

    if (sql === undefined) {
      throw new Error('App writer shell harness requires SQLite Durable Object storage.');
    }
    const { Workspace } = await import('@cloudflare/shell');

    return new Workspace({
      sql,
      r2: this.env.PACKAGE_ARTIFACTS as ShellWorkspaceOptions['r2'],
      name: () => toShellWorkspaceNamespace(generationId),
      namespace: toShellWorkspaceNamespace(generationId),
    });
  }

  private async runWorkspaceCodeLoop(input: {
    workspace: ShellWorkspace;
    stage: 'author' | 'repair';
    prompt: Record<string, unknown>;
  }): Promise<{ notes: string[] }> {
    const executor = await this.createExecutor();
    const { normalizeCode, resolveProvider } = await import('@cloudflare/codemode');
    const { stateTools } = await import('@cloudflare/shell/workers');
    const stateProvider = stateTools(input.workspace);
    const failures: Array<{ code: string; error: string; logs: string[] }> = [];

    for (let attempt = 1; attempt <= SHELL_CODE_ATTEMPT_LIMIT; attempt += 1) {
      const rawCode = await this.runModelText({
        messages: buildWorkspaceCodeMessages({
          prompt: input.prompt,
          stage: input.stage,
          attempt,
          failures,
          toolTypes: readToolProviderTypes(stateProvider),
        }),
        stage: `${input.stage} code attempt ${attempt}`,
      });
      let code: string;

      try {
        code = normalizeCode(rawCode);
      } catch (error) {
        failures.push({
          code: rawCode,
          error: error instanceof Error ? error.message : 'Code normalization failed.',
          logs: [],
        });
        continue;
      }

      const execution = await executor.execute(code, [resolveProvider(stateProvider)]);

      if (execution.error === undefined) {
        return {
          notes: [
            `Workspace shell harness completed ${input.stage} on attempt ${attempt}.`,
            ...normalizeExecutionLogs(execution.logs),
          ],
        };
      }

      failures.push({
        code,
        error: execution.error,
        logs: normalizeExecutionLogs(execution.logs),
      });
    }

    throw new Error(
      `Workspace shell harness failed during ${input.stage}: ${
        failures.at(-1)?.error ?? 'unknown execution error'
      }`,
    );
  }

  private async createExecutor(): Promise<ShellExecutor> {
    const loader = this.env.LOADER;

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

  private async runModelText(input: {
    messages: CloudflareAiMessage[];
    stage: string;
  }): Promise<string> {
    const ai = this.env.AI;

    if (!isCloudflareAiBinding(ai)) {
      throw new Error('App writer shell harness requires a Workers AI binding named AI.');
    }

    const model = this.env.APP_WRITER_MODEL?.trim();

    if (!model) {
      throw new Error('App writer shell harness requires APP_WRITER_MODEL.');
    }

    return await withTimeout(
      (async () => {
        const response = await ai.run(model, {
          messages: input.messages,
          stream: true,
        });

        return await readCloudflareAiResponseText(response);
      })(),
      MODEL_TEXT_TIMEOUT_MS,
      `Cloudflare AI model request timed out during app writer ${input.stage}.`,
    );
  }
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

interface WorkspaceAuthorInput {
  generationInput: AppPackageGenerationInput;
  workspace: AppGenerationWorkspaceRecord;
  planning: AppGenerationPlanningResult;
}

interface WorkspaceRepairInput {
  generationInput: AppPackageGenerationInput;
  previousResult: AppPackageGenerationResult;
  validationFindings: AppGenerationWorkspaceRecord['validationFindings'];
  repairAttempt: number;
  workspace: AppGenerationWorkspaceRecord;
}

interface WorkspaceHarnessResponse {
  files: AppWriterWorkspaceFile[];
  progressUpdates: Array<{ stage: 'building_package' | 'repairing_package'; message: string }>;
  notes: string[];
  validationFindings: AppGenerationWorkspaceRecord['validationFindings'];
}

async function readObserveInput(request: Request): Promise<AppWriterAgentObserveInput> {
  const value = await request.json();

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('App writer Agent observe input must be a JSON object.');
  }

  const record = value as Record<string, unknown>;

  return {
    generationId: expectString(record.generationId, 'generationId'),
    ownerId: expectString(record.ownerId, 'ownerId'),
    workflowInstanceId: expectNullableString(record.workflowInstanceId, 'workflowInstanceId'),
    observedAt: expectString(record.observedAt, 'observedAt'),
  };
}

async function readWorkspaceAuthorInput(request: Request): Promise<WorkspaceAuthorInput> {
  const value = expectRecord(await readJson(request), 'workspaceAuthorInput');

  return {
    generationInput: value.generationInput as AppPackageGenerationInput,
    planning: value.planning as AppGenerationPlanningResult,
    workspace: value.workspace as AppGenerationWorkspaceRecord,
  };
}

async function readWorkspaceRepairInput(request: Request): Promise<WorkspaceRepairInput> {
  const value = expectRecord(await readJson(request), 'workspaceRepairInput');

  return {
    generationInput: value.generationInput as AppPackageGenerationInput,
    previousResult: value.previousResult as AppPackageGenerationResult,
    validationFindings:
      value.validationFindings as AppGenerationWorkspaceRecord['validationFindings'],
    repairAttempt: expectNumber(value.repairAttempt, 'workspaceRepairInput.repairAttempt'),
    workspace: value.workspace as AppGenerationWorkspaceRecord,
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new TypeError('App writer Agent request body must be valid JSON.');
  }
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
  failures: ReadonlyArray<{ code: string; error: string; logs: readonly string[] }>;
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

async function readCloudflareAiResponseText(response: unknown): Promise<string> {
  if (typeof response === 'string') {
    return response;
  }

  if (response instanceof ReadableStream) {
    return await readAiResponseStream(response);
  }

  if (response instanceof Response && response.body !== null) {
    return await readAiResponseStream(response.body);
  }

  if (typeof response === 'object' && response !== null) {
    const record = response as Record<string, unknown>;

    if (typeof record.response === 'string') {
      return record.response;
    }

    if (record.response instanceof ReadableStream) {
      return await readAiResponseStream(record.response);
    }
  }

  throw new Error('Workers AI response did not contain text.');
}

async function readAiResponseStream(stream: ReadableStream): Promise<string> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let output = '';
  let pending = '';

  while (true) {
    const next = await reader.read();

    if (next.done) {
      return `${output}${parseAiStreamEvent(pending)}`;
    }

    pending += next.value;
    const events = pending.split(/\r?\n\r?\n/);
    pending = events.pop() ?? '';

    for (const event of events) {
      output += parseAiStreamEvent(event);
    }
  }
}

function parseAiStreamEvent(event: string): string {
  if (event === '') {
    return '';
  }

  const dataLines = event
    .split(/\r?\n/)
    .map((line) => line.trimStart())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.replace(/^data:\s?/, '').trim())
    .filter((line) => line !== '' && line !== '[DONE]');

  if (dataLines.length === 0) {
    return event;
  }

  return dataLines
    .map((line) => {
      try {
        const parsed = JSON.parse(line) as {
          response?: unknown;
          choices?: Array<{ delta?: { content?: unknown } }>;
        };

        return typeof parsed.response === 'string'
          ? parsed.response
          : typeof parsed.choices?.[0]?.delta?.content === 'string'
            ? parsed.choices[0].delta.content
            : '';
      } catch {
        return line;
      }
    })
    .join('');
}

function normalizeExecutionLogs(logs: readonly string[] | undefined): string[] {
  return (logs ?? []).filter((log) => log.trim() !== '').slice(0, 10);
}

function isCloudflareAiBinding(value: unknown): value is CloudflareAiBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<CloudflareAiBinding>).run === 'function'
  );
}

function expectRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}

function expectNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number') {
    throw new TypeError(`${fieldName} must be a number.`);
  }

  return value;
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

function buildUnknownSnapshot(
  session: StoredAppWriterAgentSession | undefined,
): AppWriterAgentSessionSnapshot {
  return {
    generationId: session?.generationId ?? 'unknown',
    status: 'unknown',
    currentPlanStepId: null,
    currentPlanStepStatus: null,
    workflowInstanceId: session?.workflowInstanceId ?? null,
    packageVersionId: null,
    repairAttemptCount: 0,
    validationFindingCount: 0,
    activityEventCount: 0,
    updatedAt: session?.observedAt ?? null,
  };
}

function selectCurrentPlanStep(
  plan: readonly AppGenerationPlanStep[],
): { id: AppGenerationPlanStepId; status: AppGenerationPlanStepStatus } | null {
  const running = plan.find((step) => step.status === 'running');

  if (running !== undefined) {
    return {
      id: running.id,
      status: running.status,
    };
  }

  const failed = plan.find((step) => step.status === 'failed');

  if (failed !== undefined) {
    return {
      id: failed.id,
      status: failed.status,
    };
  }

  const active = [...plan].reverse().find((step) => step.status !== 'pending');

  return active === undefined ? null : { id: active.id, status: active.status };
}

async function countGenerationActivityEvents(
  repository: Pick<PackageReviewRepository, 'listAuditEventsByEventType'>,
  generationId: string,
): Promise<number> {
  const eventBatches = await Promise.all(
    APP_GENERATION_AUDIT_EVENT_TYPES.map((eventType) =>
      repository.listAuditEventsByEventType(eventType),
    ),
  );

  return eventBatches.flat().filter((event) => event.detail.generationId === generationId).length;
}

function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
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

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
