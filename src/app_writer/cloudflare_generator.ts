import type { AppPackageGenerator } from './package_generator.ts';
import { parseAppPackageGenerationResultJson } from './model_output.ts';
import type {
  AppGenerationModelRequestMetadata,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
  AppPackageRepairInput,
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
      response_format: { type: 'json_object' };
      stream: true;
    },
  ): Promise<unknown>;
}

export function createCloudflareAppPackageGenerator(input: {
  ai: CloudflareAiBinding;
  model: string;
  maxResponseCharacters?: number;
}): AppPackageGenerator {
  const maxResponseCharacters = input.maxResponseCharacters ?? DEFAULT_MAX_RESPONSE_CHARACTERS;

  return {
    async generate(generationInput) {
      return await runCloudflareGenerationRequest({
        ai: input.ai,
        model: input.model,
        maxResponseCharacters,
        messages: buildGenerationMessages(generationInput),
      });
    },
    async repair(repairInput) {
      return await runCloudflareGenerationRequest({
        ai: input.ai,
        model: input.model,
        maxResponseCharacters,
        messages: buildRepairMessages(repairInput),
      });
    },
  };
}

export function isCloudflareAiBinding(value: unknown): value is CloudflareAiBinding {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { run?: unknown }).run === 'function'
  );
}

function buildGenerationMessages(input: AppPackageGenerationInput): CloudflareAiMessage[] {
  return [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'generate_lantern_app_package',
        generationId: input.generationId,
        ownerId: input.ownerId,
        requestedAppId: input.requestedAppId,
        selectedStarterId: input.selectedStarterId,
        selectedContext: input.selectedContext,
        promptContext: readPromptContextExcerpts(input.selectedContext),
        promptContextRules: PROMPT_CONTEXT_RULES,
        instructorPrompt: input.promptText,
        outputContract: OUTPUT_CONTRACT,
      }),
    },
  ];
}

function buildRepairMessages(input: AppPackageRepairInput): CloudflareAiMessage[] {
  return [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'repair_lantern_app_package',
        generationId: input.generationId,
        repairAttempt: input.repairAttempt,
        selectedStarterId: input.selectedStarterId,
        selectedContext: input.selectedContext,
        promptContext: readPromptContextExcerpts(input.selectedContext),
        promptContextRules: PROMPT_CONTEXT_RULES,
        instructorPrompt: input.promptText,
        previousResult: input.previousResult,
        validationFindings: input.validationFindings,
        outputContract: OUTPUT_CONTRACT,
      }),
    },
  ];
}

async function runCloudflareGenerationRequest(input: {
  ai: CloudflareAiBinding;
  model: string;
  maxResponseCharacters: number;
  messages: CloudflareAiMessage[];
}): Promise<AppPackageGenerationResult> {
  const firstAttempt = await runCloudflareModelTextRequest({
    ai: input.ai,
    model: input.model,
    maxResponseCharacters: input.maxResponseCharacters,
    messages: input.messages,
  });
  const attempts = [firstAttempt];
  let parsed: AppPackageGenerationResult;

  try {
    parsed = parseAppPackageGenerationResultJson(firstAttempt.responseText);
  } catch (error) {
    const repairAttempt = await runCloudflareModelTextRequest({
      ai: input.ai,
      model: input.model,
      maxResponseCharacters: input.maxResponseCharacters,
      messages: buildContractRepairMessages({
        originalMessages: input.messages,
        previousOutput: firstAttempt.responseText,
        error,
      }),
    });
    attempts.push(repairAttempt);
    parsed = parseAppPackageGenerationResultJson(repairAttempt.responseText);
  }

  return {
    ...parsed,
    modelRequestMetadata: attempts.map((attempt) =>
      buildModelRequestMetadata({
        model: input.model,
        response: attempt.response,
        responseCharacters: attempt.responseText.length,
        durationMs: attempt.durationMs,
      }),
    ),
  };
}

async function runCloudflareModelTextRequest(input: {
  ai: CloudflareAiBinding;
  model: string;
  maxResponseCharacters: number;
  messages: CloudflareAiMessage[];
}): Promise<{ response: unknown; responseText: string; durationMs: number }> {
  const startedAt = performance.now();
  const response = await input.ai.run(input.model, {
    messages: input.messages,
    response_format: { type: 'json_object' },
    stream: true,
  });
  const responseText = await readModelResponseText(response);

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

function buildContractRepairMessages(input: {
  originalMessages: CloudflareAiMessage[];
  previousOutput: string;
  error: unknown;
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
        repairRules: [
          'Return one complete Lantern app package JSON object directly at the root.',
          'Use exact camelCase key names from outputContract.',
          'Fill every required field with a non-empty value that matches the instructor prompt.',
          'Do not wrap the package in response, result, output, package, content, or markdown.',
        ],
        outputContract: OUTPUT_CONTRACT,
      }),
    },
  ];
}

function readModelResponseText(value: unknown): Promise<string> {
  if (isReadableStream(value)) {
    return readModelResponseTextFromStream(value);
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

  throw new Error('Cloudflare AI response did not include JSON text.');
}

async function readModelResponseTextFromStream(stream: ReadableStream<unknown>): Promise<string> {
  const eventStreamText = await readStreamText(stream);

  return readEventStreamModelText(eventStreamText);
}

async function readStreamText(stream: ReadableStream<unknown>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';

  while (true) {
    const result = await reader.read();

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
    throw new Error('Cloudflare AI stream did not include JSON text.');
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

const SYSTEM_PROMPT =
  'You generate Lantern learning app packages. Return only one JSON object whose top-level keys are exactly normalizedRequest, appPlan, selectedStarterId, files, progressUpdates, and notes. Use exact camelCase key names, not snake_case. Never return markdown. Never wrap the package in response, result, output, package, or content. Never request or use LMS tokens, Cloudflare bindings, external network access, package imports, localStorage, sessionStorage, or direct grade passback. The app must use reviewed package files and window.GatewayApp only. Progress updates must be short user-safe status text, never hidden reasoning or implementation details.';

const DEFAULT_MAX_RESPONSE_CHARACTERS = 250_000;

const PROMPT_CONTEXT_RULES = [
  'Treat promptContext as the authoritative Lantern contract context for this request.',
  'Use GatewayApp local state and attempt events for progress tracking; do not invent storage primitives.',
  'When validation diagnostics conflict with previous files, repair the files to satisfy Lantern diagnostics.',
] as const;

const OUTPUT_CONTRACT = {
  requiredTopLevelKeys: [
    'normalizedRequest',
    'appPlan',
    'selectedStarterId',
    'files',
    'progressUpdates',
    'notes',
  ],
  topLevelRule:
    'Return the app package directly at the JSON root. Do not wrap it in response, result, output, package, appPackage, content, data, or any other envelope. Use exact camelCase key names.',
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
  files: {
    shape: { path: 'relative package path', contents: 'utf-8 text contents' },
    required: [
      'manifest.json',
      'dist/index.html',
      'content/activity.json',
      'preview/fixtures.json',
      'preview/tests.json',
      'source/app.ts',
      'source/content_model.ts',
    ],
    note: 'Return TypeScript source as source/app.ts and source/content_model.ts. Lantern typechecks and compiles source/app.ts into dist/app.js before package validation.',
  },
  validationFindings: 'Do not include. Lantern computes validation findings.',
} as const;
