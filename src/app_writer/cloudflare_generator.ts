import type { AppPackageGenerator } from './package_generator.ts';
import { parseAppGenerationPlanningResultJson } from './model_output.ts';
import {
  APP_WRITER_BASELINE_PACKAGE_FILES,
  APP_WRITER_TYPESCRIPT_AUTHORING_FILES,
  applyWorkspaceFileEdits,
  buildAppWriterStarterWorkspace,
  validateBaselineFileEdits,
} from './starter_workspace.ts';
import type {
  AppGenerationModelRequestMetadata,
  AppGenerationPlanningResult,
  AppGenerationProgressUpdate,
  AppGenerationValidationFinding,
  AppPackageFileGenerationInput,
  AppPackageFileGenerationResult,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
  AppPackageRepairInput,
  AppWriterAuthoringMode,
  AppWriterStarterId,
  AppWriterWorkspaceFile,
} from './types.ts';

export interface CloudflareAiMessage {
  role: 'system' | 'user';
  content: string;
}

export interface CloudflareAiBinding {
  run(
    model: string,
    input: {
      messages: CloudflareAiMessage[];
      response_format?: { type: 'json_object' };
      stream: true;
    },
  ): Promise<unknown>;
}

export function createCloudflareAppPackageGenerator(input: {
  ai: CloudflareAiBinding;
  model: string;
  maxResponseCharacters?: number;
  modelRequestTimeoutMs?: number;
}): AppPackageGenerator {
  const maxResponseCharacters = input.maxResponseCharacters ?? DEFAULT_MAX_RESPONSE_CHARACTERS;
  const modelRequestTimeoutMs = input.modelRequestTimeoutMs ?? DEFAULT_MODEL_REQUEST_TIMEOUT_MS;
  const plan = (generationInput: AppPackageGenerationInput) =>
    runCloudflarePlanningRequest({
      ai: input.ai,
      model: input.model,
      maxResponseCharacters,
      modelRequestTimeoutMs,
      generationInput,
    });
  const generateFiles = (fileInput: AppPackageFileGenerationInput) =>
    runCloudflareFileGenerationRequest({
      ai: input.ai,
      model: input.model,
      maxResponseCharacters,
      modelRequestTimeoutMs,
      fileInput,
    });

  return {
    async generate(generationInput) {
      const planning = await plan(generationInput);
      const fileGeneration = await generateFiles({
        ...generationInput,
        planning,
      });

      return assembleGenerationResult({
        planning,
        fileGeneration,
        includePlanningProgress: true,
      });
    },
    async repair(repairInput) {
      return await runCloudflareRepairRequest({
        ai: input.ai,
        model: input.model,
        maxResponseCharacters,
        modelRequestTimeoutMs,
        repairInput,
      });
    },
    plan,
    generateFiles,
  };
}

export function isCloudflareAiBinding(value: unknown): value is CloudflareAiBinding {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { run?: unknown }).run === 'function'
  );
}

function buildPlanningMessages(input: AppPackageGenerationInput): CloudflareAiMessage[] {
  return [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'plan_lantern_app_package',
        generationId: input.generationId,
        ownerId: input.ownerId,
        requestedAppId: input.requestedAppId,
        selectedStarterId: input.selectedStarterId,
        authoringMode: input.authoringMode,
        selectedContext: input.selectedContext,
        appWriterRecipe: readAppWriterRecipe(input.selectedContext),
        promptContext: readPromptContextExcerpts(input.selectedContext),
        promptContextRules: PROMPT_CONTEXT_RULES,
        instructorPrompt: input.promptText,
        outputContract: PLANNING_OUTPUT_CONTRACT,
      }),
    },
  ];
}

interface WorkspaceFileGenerationTarget {
  path: string;
  purpose: string;
}

function buildSingleFileGenerationMessages(input: {
  generationInput: AppPackageGenerationInput;
  planning: AppGenerationPlanningResult;
  starterWorkspace: ReturnType<typeof buildAppWriterStarterWorkspace>;
  currentFiles: readonly AppWriterWorkspaceFile[];
  target: WorkspaceFileGenerationTarget;
}): CloudflareAiMessage[] {
  return [
    {
      role: 'system',
      content: RAW_FILE_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'write_lantern_app_workspace_file',
        generationId: input.generationInput.generationId,
        selectedStarterId: input.generationInput.selectedStarterId,
        authoringMode: input.generationInput.authoringMode,
        selectedContext: input.generationInput.selectedContext,
        appWriterRecipe: readAppWriterRecipe(input.generationInput.selectedContext),
        promptContext: readPromptContextExcerpts(input.generationInput.selectedContext),
        promptContextRules: PROMPT_CONTEXT_RULES,
        instructorPrompt: input.generationInput.promptText,
        normalizedRequest: input.planning.normalizedRequest,
        appPlan: input.planning.appPlan,
        starterWorkspace: {
          starterId: input.starterWorkspace.starterId,
          instructions: input.starterWorkspace.instructions,
          availablePaths: input.currentFiles.map((file) => file.path),
        },
        targetFile: input.target,
        relatedWorkspaceFiles: selectRelatedWorkspaceFiles({
          files: input.currentFiles,
          targetPath: input.target.path,
        }),
        outputContract: buildRawFileOutputContract({
          authoringMode: input.generationInput.authoringMode,
          target: input.target,
        }),
      }),
    },
  ];
}

function buildSingleFileRepairMessages(input: {
  repairInput: AppPackageRepairInput;
  currentFiles: readonly AppWriterWorkspaceFile[];
  target: WorkspaceFileGenerationTarget;
}): CloudflareAiMessage[] {
  const starterWorkspace = buildAppWriterStarterWorkspace(
    input.repairInput.selectedStarterId,
    input.repairInput.authoringMode,
  );

  return [
    {
      role: 'system',
      content: RAW_FILE_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'repair_lantern_app_workspace_file',
        generationId: input.repairInput.generationId,
        repairAttempt: input.repairInput.repairAttempt,
        selectedStarterId: input.repairInput.selectedStarterId,
        authoringMode: input.repairInput.authoringMode,
        selectedContext: input.repairInput.selectedContext,
        appWriterRecipe: readAppWriterRecipe(input.repairInput.selectedContext),
        promptContext: readPromptContextExcerpts(input.repairInput.selectedContext),
        promptContextRules: PROMPT_CONTEXT_RULES,
        instructorPrompt: input.repairInput.promptText,
        normalizedRequest: input.repairInput.previousResult.normalizedRequest,
        appPlan: input.repairInput.previousResult.appPlan,
        starterWorkspaceInstructions: starterWorkspace.instructions,
        targetFile: input.target,
        relatedWorkspaceFiles: selectRelatedWorkspaceFiles({
          files: input.currentFiles,
          targetPath: input.target.path,
        }),
        validationFindings: filterRepairFindingsForTarget(
          input.repairInput.validationFindings,
          input.target.path,
        ),
        outputContract: buildRawFileOutputContract({
          authoringMode: input.repairInput.authoringMode,
          target: input.target,
        }),
      }),
    },
  ];
}

async function runCloudflarePlanningRequest(input: {
  ai: CloudflareAiBinding;
  model: string;
  maxResponseCharacters: number;
  modelRequestTimeoutMs: number;
  generationInput: AppPackageGenerationInput;
}): Promise<AppGenerationPlanningResult> {
  const planningAttempt = await runCloudflareParsedRequest({
    ai: input.ai,
    model: input.model,
    maxResponseCharacters: input.maxResponseCharacters,
    modelRequestTimeoutMs: input.modelRequestTimeoutMs,
    messages: buildPlanningMessages(input.generationInput),
    parse: parseAppGenerationPlanningResultJson,
    repairContract: PLANNING_OUTPUT_CONTRACT,
    repairRules: PLANNING_CONTRACT_REPAIR_RULES,
  });

  return {
    ...planningAttempt.parsed,
    modelRequestMetadata: planningAttempt.metadata,
  };
}

async function runCloudflareFileGenerationRequest(input: {
  ai: CloudflareAiBinding;
  model: string;
  maxResponseCharacters: number;
  modelRequestTimeoutMs: number;
  fileInput: AppPackageFileGenerationInput;
}): Promise<AppPackageFileGenerationResult> {
  const starterWorkspace = buildAppWriterStarterWorkspace(
    input.fileInput.selectedStarterId,
    input.fileInput.authoringMode,
  );
  const fileEdits: AppWriterWorkspaceFile[] = [];
  const progressUpdates: AppGenerationProgressUpdate[] = [];
  const notes: string[] = [];
  let currentFiles = starterWorkspace.files;
  let modelRequestMetadata: AppGenerationModelRequestMetadata[] = [];

  for (const target of buildWorkspaceFileGenerationTargets({
    starterId: input.fileInput.selectedStarterId,
    authoringMode: input.fileInput.authoringMode,
    starterFiles: starterWorkspace.files,
  })) {
    const fileAttempt = await runCloudflareSingleFileRequest({
      ai: input.ai,
      model: input.model,
      maxResponseCharacters: input.maxResponseCharacters,
      modelRequestTimeoutMs: input.modelRequestTimeoutMs,
      messages: buildSingleFileGenerationMessages({
        generationInput: input.fileInput,
        planning: input.fileInput.planning,
        starterWorkspace,
        currentFiles,
        target,
      }),
      targetPath: target.path,
      progressStage: 'building_package',
    });

    fileEdits.push(fileAttempt.file);
    progressUpdates.push(...fileAttempt.progressUpdates);
    notes.push(...fileAttempt.notes);
    modelRequestMetadata = [...modelRequestMetadata, ...fileAttempt.modelRequestMetadata];
    currentFiles = applyWorkspaceFileEdits({
      baseFiles: currentFiles,
      fileEdits: [fileAttempt.file],
    });
  }
  const missingBaselineEdits = validateBaselineFileEdits(fileEdits, input.fileInput.authoringMode);

  if (missingBaselineEdits.length > 0) {
    throw new Error(
      `App package file writer omitted required scaffold edits: ${missingBaselineEdits.join(
        ', ',
      )}.`,
    );
  }

  return {
    files: currentFiles,
    progressUpdates: selectModelProgressUpdates(progressUpdates),
    notes,
    validationFindings: [],
    modelRequestMetadata,
  };
}

function assembleGenerationResult(input: {
  planning: AppGenerationPlanningResult;
  fileGeneration: AppPackageFileGenerationResult;
  includePlanningProgress: boolean;
}): AppPackageGenerationResult {
  return {
    normalizedRequest: input.planning.normalizedRequest,
    appPlan: input.planning.appPlan,
    selectedStarterId: input.planning.selectedStarterId,
    files: input.fileGeneration.files,
    progressUpdates: mergeProgressUpdates(
      input.includePlanningProgress
        ? [...input.planning.progressUpdates, ...input.fileGeneration.progressUpdates]
        : input.fileGeneration.progressUpdates,
    ),
    notes: [...input.planning.notes, ...input.fileGeneration.notes],
    validationFindings: input.fileGeneration.validationFindings,
    modelRequestMetadata: [
      ...(input.planning.modelRequestMetadata ?? []),
      ...(input.fileGeneration.modelRequestMetadata ?? []),
    ],
  };
}

async function runCloudflareRepairRequest(input: {
  ai: CloudflareAiBinding;
  model: string;
  maxResponseCharacters: number;
  modelRequestTimeoutMs: number;
  repairInput: AppPackageRepairInput;
}): Promise<AppPackageGenerationResult> {
  let currentFiles = input.repairInput.previousResult.files;
  const progressUpdates: AppGenerationProgressUpdate[] = [];
  const notes: string[] = [];
  let modelRequestMetadata: AppGenerationModelRequestMetadata[] = [];

  for (const target of buildRepairFileGenerationTargets(input.repairInput)) {
    const fileAttempt = await runCloudflareSingleFileRequest({
      ai: input.ai,
      model: input.model,
      maxResponseCharacters: input.maxResponseCharacters,
      modelRequestTimeoutMs: input.modelRequestTimeoutMs,
      messages: buildSingleFileRepairMessages({
        repairInput: input.repairInput,
        currentFiles,
        target,
      }),
      targetPath: target.path,
      progressStage: 'repairing_package',
    });

    progressUpdates.push(...fileAttempt.progressUpdates);
    notes.push(...fileAttempt.notes);
    modelRequestMetadata = [...modelRequestMetadata, ...fileAttempt.modelRequestMetadata];
    currentFiles = applyWorkspaceFileEdits({
      baseFiles: currentFiles,
      fileEdits: [fileAttempt.file],
    });
  }

  return {
    ...input.repairInput.previousResult,
    files: currentFiles,
    progressUpdates: selectModelProgressUpdates(progressUpdates),
    notes: [...input.repairInput.previousResult.notes, ...notes],
    validationFindings: [],
    modelRequestMetadata,
  };
}

async function runCloudflareSingleFileRequest(input: {
  ai: CloudflareAiBinding;
  model: string;
  maxResponseCharacters: number;
  modelRequestTimeoutMs: number;
  messages: CloudflareAiMessage[];
  targetPath: string;
  progressStage: 'building_package' | 'repairing_package';
}): Promise<{
  file: AppWriterWorkspaceFile;
  progressUpdates: AppGenerationProgressUpdate[];
  notes: string[];
  modelRequestMetadata: AppGenerationModelRequestMetadata[];
}> {
  const fileAttempt = await runCloudflareRawFileRequest({
    ai: input.ai,
    model: input.model,
    maxResponseCharacters: input.maxResponseCharacters,
    modelRequestTimeoutMs: input.modelRequestTimeoutMs,
    messages: input.messages,
  });
  const contents = normalizeRawModelFileContents(fileAttempt.responseText);
  const file = {
    path: input.targetPath,
    contents,
  };

  return {
    file,
    progressUpdates: [
      {
        stage: input.progressStage,
        message: formatFileProgressMessage(input.targetPath, input.progressStage),
      },
    ],
    notes: [`Wrote ${input.targetPath} from raw model file output.`],
    modelRequestMetadata: [fileAttempt.metadata],
  };
}

async function runCloudflareRawFileRequest(input: {
  ai: CloudflareAiBinding;
  model: string;
  maxResponseCharacters: number;
  modelRequestTimeoutMs: number;
  messages: CloudflareAiMessage[];
}): Promise<{
  response: unknown;
  responseText: string;
  metadata: AppGenerationModelRequestMetadata;
}> {
  const attempt = await runCloudflareModelTextRequest({
    ai: input.ai,
    model: input.model,
    maxResponseCharacters: input.maxResponseCharacters,
    modelRequestTimeoutMs: input.modelRequestTimeoutMs,
    messages: input.messages,
    responseFormat: 'text',
  });

  return {
    response: attempt.response,
    responseText: attempt.responseText,
    metadata: buildModelRequestMetadata({
      model: input.model,
      response: attempt.response,
      responseCharacters: attempt.responseText.length,
      durationMs: attempt.durationMs,
    }),
  };
}

function normalizeRawModelFileContents(text: string): string {
  const contents = stripMarkdownCodeFence(text);

  if (contents.trim() === '') {
    throw new Error('App package file writer returned empty file contents.');
  }

  return contents;
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:[a-z0-9_-]+)?\s*\n?([\s\S]*?)\n?```$/i);

  if (fenced === null) {
    return text;
  }

  return fenced[1] ?? '';
}

function formatFileProgressMessage(
  targetPath: string,
  stage: 'building_package' | 'repairing_package',
): string {
  const verb = stage === 'repairing_package' ? 'Repairing' : 'Writing';

  return `${verb} ${targetPath} in the Lantern starter workspace.`;
}

async function runCloudflareParsedRequest<T>(input: {
  ai: CloudflareAiBinding;
  model: string;
  maxResponseCharacters: number;
  modelRequestTimeoutMs: number;
  messages: CloudflareAiMessage[];
  parse: (text: string) => T;
  repairContract: unknown;
  repairRules: readonly string[];
}): Promise<{ parsed: T; metadata: AppGenerationModelRequestMetadata[] }> {
  const firstAttempt = await runCloudflareModelTextRequest({
    ai: input.ai,
    model: input.model,
    maxResponseCharacters: input.maxResponseCharacters,
    modelRequestTimeoutMs: input.modelRequestTimeoutMs,
    messages: input.messages,
    responseFormat: 'json',
  });
  const attempts = [firstAttempt];

  try {
    return {
      parsed: input.parse(firstAttempt.responseText),
      metadata: buildModelRequestMetadataList(input.model, attempts),
    };
  } catch (error) {
    const repairAttempt = await runCloudflareModelTextRequest({
      ai: input.ai,
      model: input.model,
      maxResponseCharacters: input.maxResponseCharacters,
      modelRequestTimeoutMs: input.modelRequestTimeoutMs,
      messages: buildContractRepairMessages({
        originalMessages: input.messages,
        previousOutput: firstAttempt.responseText,
        error,
        outputContract: input.repairContract,
        repairRules: input.repairRules,
      }),
      responseFormat: 'json',
    });
    attempts.push(repairAttempt);

    return {
      parsed: input.parse(repairAttempt.responseText),
      metadata: buildModelRequestMetadataList(input.model, attempts),
    };
  }
}

function buildModelRequestMetadataList(
  model: string,
  attempts: readonly {
    response: unknown;
    responseText: string;
    durationMs: number;
  }[],
): AppGenerationModelRequestMetadata[] {
  return attempts.map((attempt) =>
    buildModelRequestMetadata({
      model,
      response: attempt.response,
      responseCharacters: attempt.responseText.length,
      durationMs: attempt.durationMs,
    }),
  );
}

function buildWorkspaceFileGenerationTargets(input: {
  starterId: AppWriterStarterId;
  authoringMode: AppWriterAuthoringMode;
  starterFiles: readonly AppWriterWorkspaceFile[];
}): WorkspaceFileGenerationTarget[] {
  const requiredPaths =
    input.authoringMode === 'typescript'
      ? APP_WRITER_TYPESCRIPT_AUTHORING_FILES
      : APP_WRITER_BASELINE_PACKAGE_FILES;
  const paths = new Set<string>(requiredPaths);

  for (const file of input.starterFiles) {
    if (input.authoringMode === 'typescript' && file.path === 'dist/app.js') {
      continue;
    }

    paths.add(file.path);
  }

  return [...paths].sort(compareWorkspaceFileGenerationPaths).map((path) => ({
    path,
    purpose: describeWorkspaceFilePurpose({
      path,
      starterId: input.starterId,
      authoringMode: input.authoringMode,
    }),
  }));
}

function buildRepairFileGenerationTargets(
  input: AppPackageRepairInput,
): WorkspaceFileGenerationTarget[] {
  const existingPaths = new Set(input.previousResult.files.map((file) => file.path));
  const targetPaths = new Set<string>();
  let needsBroadRepair = false;

  for (const finding of input.validationFindings) {
    const path = typeof finding.file === 'string' ? finding.file.trim() : '';

    if (path === '') {
      needsBroadRepair = true;
      continue;
    }

    targetPaths.add(path);

    if (finding.code === 'sdk_capability_missing') {
      targetPaths.add('manifest.json');
    }
  }

  if (needsBroadRepair || targetPaths.size === 0) {
    for (const path of input.authoringMode === 'typescript'
      ? APP_WRITER_TYPESCRIPT_AUTHORING_FILES
      : APP_WRITER_BASELINE_PACKAGE_FILES) {
      targetPaths.add(path);
    }
  }

  return [...targetPaths]
    .filter((path) => existingPaths.has(path) || isRequiredAuthoringPath(path, input.authoringMode))
    .sort(compareWorkspaceFileGenerationPaths)
    .map((path) => ({
      path,
      purpose: describeWorkspaceFilePurpose({
        path,
        starterId: input.selectedStarterId,
        authoringMode: input.authoringMode,
      }),
    }));
}

function isRequiredAuthoringPath(path: string, authoringMode: AppWriterAuthoringMode): boolean {
  const requiredPaths: readonly string[] =
    authoringMode === 'typescript'
      ? APP_WRITER_TYPESCRIPT_AUTHORING_FILES
      : APP_WRITER_BASELINE_PACKAGE_FILES;

  return requiredPaths.includes(path);
}

function compareWorkspaceFileGenerationPaths(left: string, right: string): number {
  const leftOrder = workspaceFileGenerationOrder(left);
  const rightOrder = workspaceFileGenerationOrder(right);

  return leftOrder === rightOrder ? left.localeCompare(right) : leftOrder - rightOrder;
}

function workspaceFileGenerationOrder(path: string): number {
  switch (path) {
    case 'manifest.json':
      return 10;
    case 'content/activity.json':
      return 20;
    case 'source/content_model.ts':
      return 30;
    case 'dist/index.html':
      return 40;
    case 'source/app.ts':
    case 'dist/app.js':
      return 50;
    case 'dist/app.css':
      return 60;
    case 'preview/fixtures.json':
      return 70;
    case 'preview/tests.json':
      return 80;
    case 'scoring/rubric.json':
      return 85;
    case 'evidence/example-output.json':
      return 95;
    default:
      return path.startsWith('grading/specs/') ? 90 : 100;
  }
}

function describeWorkspaceFilePurpose(input: {
  path: string;
  starterId: AppWriterStarterId;
  authoringMode: AppWriterAuthoringMode;
}): string {
  switch (input.path) {
    case 'manifest.json':
      return 'Declare package metadata, capabilities, grading, content files, and preview files exactly matching the validated app plan. Manifest capabilities must use the exact appPlan capability strings.';
    case 'content/activity.json':
      return 'Store the complete instructor-requested learning content and any data the browser app needs to render the activity.';
    case 'source/content_model.ts':
      return 'Define strict global TypeScript interfaces matching content/activity.json. Do not import or export modules.';
    case 'source/app.ts':
      return 'Implement the typed browser learner experience using only window.GatewayApp methods allowed by the plan.';
    case 'dist/index.html':
      return 'Provide the minimal browser shell with a stable app root, local CSS references, and the local app script.';
    case 'dist/app.js':
      return 'Implement the browser learner experience using only window.GatewayApp methods allowed by the plan.';
    case 'dist/app.css':
      return 'Style the generated learning activity with accessible, quiet, responsive CSS without external assets.';
    case 'preview/fixtures.json':
      return 'Provide deterministic Lantern preview launch, attempt, and local-state fixture data for this app.';
    case 'preview/tests.json':
      return 'Provide deterministic preview assertions that prove the generated app renders and exposes its main learner action.';
    case 'scoring/rubric.json':
      return 'Define deterministic scoring rubric data only when the selected grading plan needs a rubric file.';
    case 'evidence/example-output.json':
      return 'Provide a safe example evidence artifact shape for the browser-autograder starter.';
    default:
      if (input.path.startsWith('grading/specs/')) {
        return 'Define deterministic browser grading checks for the browser-autograder starter.';
      }

      return `${input.starterId} ${input.authoringMode} workspace file. Keep it consistent with the validated app plan.`;
  }
}

function selectRelatedWorkspaceFiles(input: {
  files: readonly AppWriterWorkspaceFile[];
  targetPath: string;
}): AppWriterWorkspaceFile[] {
  const relatedPaths = new Set<string>([
    input.targetPath,
    'manifest.json',
    'content/activity.json',
  ]);

  if (
    input.targetPath === 'source/app.ts' ||
    input.targetPath === 'dist/app.js' ||
    input.targetPath.startsWith('preview/') ||
    input.targetPath.startsWith('grading/specs/')
  ) {
    relatedPaths.add('dist/index.html');
    relatedPaths.add('source/content_model.ts');
    relatedPaths.add('source/app.ts');
    relatedPaths.add('dist/app.js');
  }

  if (input.targetPath === 'dist/app.css') {
    relatedPaths.add('dist/index.html');
    relatedPaths.add('source/app.ts');
    relatedPaths.add('dist/app.js');
  }

  if (input.targetPath === 'source/content_model.ts') {
    relatedPaths.add('content/activity.json');
  }

  return input.files.filter((file) => relatedPaths.has(file.path));
}

function filterRepairFindingsForTarget(
  findings: readonly AppGenerationValidationFinding[],
  targetPath: string,
): AppGenerationValidationFinding[] {
  return findings.filter((finding) => {
    if (finding.file === null) {
      return true;
    }

    if (finding.file === targetPath) {
      return true;
    }

    return targetPath === 'manifest.json' && finding.code === 'sdk_capability_missing';
  });
}

function selectModelProgressUpdates(
  updates: readonly AppGenerationProgressUpdate[],
): AppGenerationProgressUpdate[] {
  if (updates.length === 0) {
    return [
      {
        stage: 'building_package',
        message: 'Writing the Lantern app workspace files.',
      },
    ];
  }

  return updates.slice(0, 4);
}

function mergeProgressUpdates(
  updates: readonly AppGenerationProgressUpdate[],
): AppGenerationProgressUpdate[] {
  if (updates.length === 0) {
    throw new Error('App package generator progress updates must contain 1 to 4 total items.');
  }

  return updates.slice(0, 4);
}

async function runCloudflareModelTextRequest(input: {
  ai: CloudflareAiBinding;
  model: string;
  maxResponseCharacters: number;
  modelRequestTimeoutMs: number;
  messages: CloudflareAiMessage[];
  responseFormat: 'json' | 'text';
}): Promise<{ response: unknown; responseText: string; durationMs: number }> {
  const startedAt = performance.now();
  const deadline = Date.now() + input.modelRequestTimeoutMs;
  const response = await withModelRequestDeadline(
    input.ai.run(
      input.model,
      input.responseFormat === 'json'
        ? {
            messages: input.messages,
            response_format: { type: 'json_object' },
            stream: true,
          }
        : {
            messages: input.messages,
            stream: true,
          },
    ),
    deadline,
  );
  const responseText = await readModelResponseText(response, deadline);

  if (responseText.length > input.maxResponseCharacters) {
    throw new Error(
      `Cloudflare AI response exceeded the app writer size limit of ${input.maxResponseCharacters} characters.`,
    );
  }

  return {
    response,
    responseText,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

async function withModelRequestDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const timeoutMs = deadline - Date.now();

  if (timeoutMs <= 0) {
    throw new Error(
      'Cloudflare AI model request timed out before returning output for the current app writer stage.',
    );
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              'Cloudflare AI model request timed out before returning output for the current app writer stage.',
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function buildContractRepairMessages(input: {
  originalMessages: CloudflareAiMessage[];
  previousOutput: string;
  error: unknown;
  outputContract: unknown;
  repairRules: readonly string[];
}): CloudflareAiMessage[] {
  const errorMessage = input.error instanceof Error ? input.error.message : String(input.error);

  return [
    ...input.originalMessages,
    {
      role: 'user',
      content: JSON.stringify({
        task: 'repair_lantern_app_package_json_contract',
        error: errorMessage,
        previousOutput: input.previousOutput,
        repairRules: input.repairRules,
        outputContract: input.outputContract,
      }),
    },
  ];
}

function readModelResponseText(value: unknown, deadline: number): Promise<string> {
  if (isReadableStream(value)) {
    return readModelResponseTextFromStream(value, deadline);
  }

  if (typeof value === 'string') {
    return Promise.resolve(value);
  }

  const record = readRecord(value);
  const directContent = readString(record?.content);

  if (directContent !== null) {
    return Promise.resolve(directContent);
  }

  const response = readString(record?.response);

  if (response !== null) {
    return Promise.resolve(response);
  }

  const result = readRecord(record?.result);
  const resultResponse = readString(result?.response);

  if (resultResponse !== null) {
    return Promise.resolve(resultResponse);
  }

  const choices = Array.isArray(record?.choices) ? record?.choices : [];
  const firstChoice = readRecord(choices[0]);
  const message = readRecord(firstChoice?.message);
  const content = readString(message?.content);

  if (content !== null) {
    return Promise.resolve(content);
  }

  throw new Error('Cloudflare AI response did not include text output.');
}

async function readModelResponseTextFromStream(
  stream: ReadableStream<unknown>,
  deadline: number,
): Promise<string> {
  const eventStreamText = await readStreamText(stream, deadline);

  return readEventStreamModelText(eventStreamText);
}

async function readStreamText(stream: ReadableStream<unknown>, deadline: number): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';

  while (true) {
    const result = await readStreamChunkWithDeadline(reader, deadline);

    if (result.done) {
      break;
    }

    const chunk = result.value;

    if (typeof chunk === 'string') {
      text += chunk;
    } else if (chunk instanceof Uint8Array) {
      text += decoder.decode(chunk, { stream: true });
    } else {
      throw new TypeError('Cloudflare AI stream returned an unsupported chunk type.');
    }

    if (hasModelStreamDoneMarker(text)) {
      await cancelStreamReader(reader);
      break;
    }
  }

  text += decoder.decode();

  return text;
}

async function readStreamChunkWithDeadline(
  reader: ReadableStreamDefaultReader<unknown>,
  deadline: number,
): Promise<ReadableStreamReadResult<unknown>> {
  try {
    return await withModelRequestDeadline(reader.read(), deadline);
  } catch (error) {
    await cancelStreamReader(reader);
    throw error;
  }
}

async function cancelStreamReader(reader: ReadableStreamDefaultReader<unknown>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // The response text is already complete once the provider sends [DONE].
  }
}

function hasModelStreamDoneMarker(text: string): boolean {
  const normalized = text.replaceAll('\r\n', '\n');

  return normalized.split('\n').some((line) => {
    const trimmed = line.trim();

    return trimmed === '[DONE]' || trimmed === 'data: [DONE]';
  });
}

function readEventStreamModelText(eventStreamText: string): string {
  const normalized = eventStreamText.replaceAll('\r\n', '\n');
  let sawDataLine = false;
  let text = '';

  for (const line of normalized.split('\n')) {
    if (!line.startsWith('data:')) {
      continue;
    }

    const data = line.slice('data:'.length).trimStart();

    if (data === '' || data === '[DONE]') {
      continue;
    }

    sawDataLine = true;
    const parsed = parseEventStreamData(data);
    const fragment = readModelResponseFragment(parsed);

    if (fragment !== null) {
      text += fragment;
    }
  }

  if (!sawDataLine) {
    return readJsonLineModelText(eventStreamText) ?? eventStreamText;
  }

  if (text === '') {
    throw new Error('Cloudflare AI stream did not include text output.');
  }

  return text;
}

function readJsonLineModelText(text: string): string | null {
  const normalized = text.replaceAll('\r\n', '\n');
  let sawFragment = false;
  let responseText = '';

  for (const line of normalized.split('\n')) {
    const data = line.trim();

    if (data === '' || data === '[DONE]') {
      continue;
    }

    const fragment = readModelResponseFragment(parseEventStreamData(data));

    if (fragment !== null) {
      responseText += fragment;
      sawFragment = true;
    }
  }

  return sawFragment ? responseText : null;
}

function parseEventStreamData(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function readModelResponseFragment(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  const record = readRecord(value);

  if (record === null) {
    return null;
  }

  const directResponse = readString(record.response);

  if (directResponse !== null) {
    return directResponse;
  }

  const directContent = readString(record.content);

  if (directContent !== null) {
    return directContent;
  }

  const result = readRecord(record.result);
  const resultResponse = readString(result?.response);

  if (resultResponse !== null) {
    return resultResponse;
  }

  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = readRecord(choices[0]);
  const delta = readRecord(firstChoice?.delta);
  const deltaContent = readString(delta?.content);

  if (deltaContent !== null) {
    return deltaContent;
  }

  const message = readRecord(firstChoice?.message);

  return readString(message?.content);
}

function isReadableStream(value: unknown): value is ReadableStream<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { getReader?: unknown }).getReader === 'function'
  );
}

function buildModelRequestMetadata(input: {
  model: string;
  response: unknown;
  responseCharacters: number;
  durationMs: number;
}): AppGenerationModelRequestMetadata {
  return {
    provider: 'cloudflare',
    model: input.model,
    requestId: readModelRequestId(input.response),
    durationMs: input.durationMs,
    responseCharacters: input.responseCharacters,
  };
}

function readModelRequestId(value: unknown): string | null {
  const record = readRecord(value);

  return (
    readString(record?.requestId) ??
    readString(record?.request_id) ??
    readString(record?.id) ??
    null
  );
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readPromptContextExcerpts(selectedContext: Record<string, unknown>): unknown[] {
  const excerpts = selectedContext.promptContextExcerpts;

  return Array.isArray(excerpts) ? excerpts : [];
}

function readAppWriterRecipe(selectedContext: Record<string, unknown>): unknown {
  return readRecord(selectedContext.recipe);
}

const SYSTEM_PROMPT =
  'You generate Lantern learning apps inside a constrained starter workspace. Follow the task-specific outputContract exactly and return only one JSON object. Use exact camelCase key names, not snake_case. Never return markdown. Never wrap the JSON in response, result, output, package, or content. Never request or use LMS tokens, Cloudflare bindings, external network access, package imports, localStorage, sessionStorage, direct grade passback, or backend code. The app must use reviewed package files and window.GatewayApp only. Progress updates must be short user-safe status text, never hidden reasoning or implementation details.';

const RAW_FILE_SYSTEM_PROMPT =
  'You write exactly one Lantern workspace file. Return only the raw file contents for the requested target path. Do not return JSON. Do not return markdown. Do not wrap the file in a code fence. Do not include the file path, explanation, progress text, or notes. Never request or use LMS tokens, Cloudflare bindings, external network access, package imports, localStorage, sessionStorage, direct grade passback, or backend code. The file must fit the reviewed Lantern package contract and use window.GatewayApp only when app code needs runtime APIs.';

const DEFAULT_MAX_RESPONSE_CHARACTERS = 250_000;
const DEFAULT_MODEL_REQUEST_TIMEOUT_MS = 600_000;

const PROMPT_CONTEXT_RULES = [
  'Treat promptContext as the authoritative Lantern contract context for this request.',
  'Use GatewayApp local state and attempt events for progress tracking; do not invent storage primitives.',
  'When validation diagnostics conflict with previous files, repair the files to satisfy Lantern diagnostics.',
  'A generated app is done only after strict TypeScript checks, package validation, Lantern preview/runtime assertions, and policy checks have zero error findings.',
] as const;

const PLANNING_CAPABILITY_VALUES = [
  'read_launch_context',
  'read_activity_content',
  'read_local_state',
  'write_local_state',
  'submit_attempt_event',
  'submit_evidence_artifact',
  'finalize_attempt',
] as const;

const PLANNING_ACTIVITY_TYPE_VALUES = [
  'quiz',
  'sorting',
  'matching',
  'flashcards',
  'simulation',
  'game',
  'practice',
] as const;

const PLANNING_GRADING_MODE_VALUES = ['completion', 'declarative', 'browser'] as const;
const PLANNING_ATTEMPT_EVENT_TYPE_VALUES = ['answer', 'progress', 'complete'] as const;

const PLANNING_OUTPUT_CONTRACT = {
  requiredTopLevelKeys: [
    'normalizedRequest',
    'appPlan',
    'selectedStarterId',
    'progressUpdates',
    'notes',
  ],
  topLevelRule:
    'Return only the plan JSON directly at the root. Do not include files. Do not wrap it in response, result, output, package, appPackage, content, data, or any other envelope. Use exact camelCase key names.',
  normalizedRequest: {
    shape: {
      learningGoal: 'non-empty string',
      audience: 'non-empty string',
      contentSummary: 'non-empty string',
      requestedActivity: 'non-empty string',
      constraints: 'string[]',
      missingInformation: 'string[]',
      safeToGenerate: 'boolean',
    },
  },
  appPlan: {
    required:
      'appId, title, description, learningGoal, audience, activityType, learnerFlow, contentModel, capabilities, grading, attemptEvents, previewTests, accessibilityNotes, riskNotes',
    shape: {
      appId:
        'non-empty slug string, preferably requestedAppId when it is provided and safe; use lowercase letters, digits, and hyphens',
      title: 'non-empty instructor-facing app title',
      description: 'non-empty one-sentence app description',
      learningGoal: 'non-empty learning objective',
      audience: 'non-empty learner audience',
      activityType: 'one allowed activity type',
      learnerFlow: 'non-empty string[] describing the learner steps',
      contentModel: 'JSON object describing the reviewed content structure',
      capabilities: 'non-empty Capability[] using only allowedValues',
      grading: {
        mode: 'one allowed grading mode',
        maxScore: 'finite number',
        scoringSummary:
          'non-empty sentence explaining how Lantern should score or complete the activity',
      },
      attemptEvents:
        'non-empty array of events Lantern should record, each with non-empty when, allowed eventType, and non-empty questionIdPattern',
      previewTests: 'non-empty string[] of visible preview assertions',
      accessibilityNotes: 'string[]',
      riskNotes: 'string[]',
    },
    rules:
      'Plan only a browser-only Lantern activity that can be implemented with the selected starter and allowed GatewayApp methods. Never leave required strings empty; choose concise values from the instructor prompt when details are sparse.',
    activityType: {
      allowedValues: PLANNING_ACTIVITY_TYPE_VALUES,
    },
    capabilities: {
      shape: 'Capability[]',
      allowedValues: PLANNING_CAPABILITY_VALUES,
      rules: [
        'Use only these exact strings. Do not invent capability names for usage tracking, reports, storage, analytics, LMS calls, or instructor dashboards.',
        'Use read_activity_content when the app reads content/activity.json.',
        'Use read_local_state and write_local_state for resumable per-learner progress.',
        'Use submit_attempt_event for usage, progress, answer, and completion events Lantern should log.',
        'Use finalize_attempt only when the app should mark the learner attempt complete or submit a final score through Lantern.',
      ],
    },
    grading: {
      modeAllowedValues: PLANNING_GRADING_MODE_VALUES,
    },
    attemptEvents: {
      eventTypeAllowedValues: PLANNING_ATTEMPT_EVENT_TYPE_VALUES,
    },
  },
  progressUpdates: {
    shape: {
      stage:
        'understanding_request | planning_app | building_package | preparing_review | repairing_package',
      message: 'short instructor-visible status text, 180 characters or fewer',
    },
    count: '1 to 4 updates',
    rules:
      'Do not include chain-of-thought, secrets, system prompts, Cloudflare/D1/R2/Worker details, tokens, or other private implementation details.',
  },
  files: 'Do not include files in this planning stage.',
  validationFindings: 'Do not include. Lantern computes validation findings.',
} as const;

function buildRawFileOutputContract(input: {
  authoringMode: AppWriterAuthoringMode;
  target: WorkspaceFileGenerationTarget;
}) {
  return {
    outputKind: 'raw_file_contents',
    topLevelRule:
      'Return only the raw contents of the requested file. Do not return JSON, markdown, a code fence, the file path, notes, or progress updates.',
    authoringMode: input.authoringMode,
    targetFile: input.target,
    fileContents: {
      required: `Return the complete replacement contents for ${input.target.path}.`,
      note: buildRawFileOutputNote(input),
    },
    normalizedRequest: 'Do not include. Lantern already has the validated normalized request.',
    appPlan: 'Do not include. Lantern already has the validated app plan.',
    progressUpdates: 'Do not include. Lantern records deterministic progress for this file.',
    notes: 'Do not include. Lantern records deterministic notes for this file.',
    validationFindings: 'Do not include. Lantern computes validation findings.',
  } as const;
}

function buildRawFileOutputNote(input: {
  authoringMode: AppWriterAuthoringMode;
  target: WorkspaceFileGenerationTarget;
}): string {
  const typeScriptRule =
    input.authoringMode === 'typescript'
      ? 'In TypeScript mode, put typed browser app logic in source/app.ts and content interfaces in source/content_model.ts. Do not return dist/app.js; Lantern compiles source/app.ts into reviewed browser JavaScript. Do not use imports, package installs, module exports, or remote code.'
      : 'In JavaScript mode, return browser-ready JavaScript only when the requested target is dist/app.js. Do not rely on a build step, package imports, TypeScript compilation, or source files.';
  const gatewayContractRule =
    'Use exact manifest capability strings from appPlan. The SDK method is emitAttemptEvent(), but the manifest capability is submit_attempt_event; never write emit_attempt_event. Attempt events use camelCase SDK fields: type, questionId, answer, checkpoint, value, and timestamp. Do not use event_type or question_id. finalizeAttempt accepts completionState, not score or completed fields.';
  const strictTypeScriptRule =
    input.authoringMode === 'typescript'
      ? 'TypeScript is strict: narrow nulls from readLocalState before helpers capture state, and assign a non-null typed state object before reading or mutating nested fields.'
      : '';

  return `${input.target.purpose} Keep this file consistent with already-written workspace files and the validated app plan. Return a full replacement file, not a diff. ${typeScriptRule} ${gatewayContractRule} ${strictTypeScriptRule}`;
}

const PLANNING_CONTRACT_REPAIR_RULES = [
  'Return one complete Lantern planning JSON object directly at the root.',
  'Use exact camelCase key names from outputContract.',
  'Fill every required planning field with a non-empty value that matches the instructor prompt.',
  'Never return empty strings for required appPlan fields; use concise instructor-facing text when a detail is not explicit.',
  `For appPlan.capabilities, use only these exact strings: ${PLANNING_CAPABILITY_VALUES.join(
    ', ',
  )}.`,
  'For student usage tracking or instructor reports, plan read_local_state, write_local_state, and submit_attempt_event as needed; do not invent new capability names.',
  'Do not include package files in this stage.',
  'Do not wrap the object in response, result, output, package, content, markdown, or any other envelope.',
] as const;
