import { APP_WRITER_EVALUATION_PROMPTS } from '../src/app_writer/evaluation_corpus.ts';

const DEFAULT_ORIGIN = 'http://localhost:8787';
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_POLL_MS = 10 * 1000;
const PRODUCTION_SMOKE_PROMPT_IDS = [
  'phonics-flashcards-progress-report',
  'fractions-adaptive-practice',
  'browser-autograder-repair',
] as const;

export interface AppWriterSmokeOptions {
  origin: string;
  promptIds: string[];
  timeoutMs: number;
  pollMs: number;
  requestedAppIdPrefix: string;
}

export interface AppWriterSmokePrompt {
  id: string;
  promptText: string;
}

export function parseAppWriterSmokeArgs(args: string[]): AppWriterSmokeOptions {
  const values = new Map<string, string[]>();

  for (const arg of args) {
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument ${arg}. Use --origin and --prompt-id.`);
    }

    const [rawKey, rawValue] = arg.slice(2).split('=', 2);
    const key = rawKey?.trim() ?? '';
    const value = rawValue?.trim() ?? '';

    if (key === '') {
      throw new Error('Smoke runner argument keys must be non-empty.');
    }

    values.set(key, [...(values.get(key) ?? []), value]);
  }

  const promptIds = readPromptIds(values);

  return {
    origin: trimTrailingSlash(readSingle(values, 'origin') ?? DEFAULT_ORIGIN),
    promptIds,
    timeoutMs: readPositiveInteger(values, 'timeout-ms') ?? DEFAULT_TIMEOUT_MS,
    pollMs: readPositiveInteger(values, 'poll-ms') ?? DEFAULT_POLL_MS,
    requestedAppIdPrefix:
      readSingle(values, 'requested-app-id-prefix') ?? `app-writer-smoke-${Date.now()}`,
  };
}

export function selectSmokePrompts(promptIds: readonly string[]): AppWriterSmokePrompt[] {
  return promptIds.map((promptId) => {
    const prompt = APP_WRITER_EVALUATION_PROMPTS.find((candidate) => candidate.id === promptId);

    if (prompt === undefined) {
      throw new Error(`Unknown app writer smoke prompt id ${promptId}.`);
    }

    return {
      id: prompt.id,
      promptText: prompt.promptText,
    };
  });
}

export function assertSmokeRunHtml(html: string): void {
  assertHtmlIncludes(html, 'saved pending version', 'run reached saved_pending_version');
  assertHtmlIncludes(html, 'initialize workspace', 'initialized workspace step is visible');
  assertHtmlIncludes(html, 'typecheck source', 'typecheck step is visible');
  assertHtmlIncludes(html, 'validate package', 'package validation step is visible');
  assertHtmlIncludes(html, 'preview runtime', 'preview runtime step is visible');
  assertHtmlIncludes(html, 'save pending version', 'save pending version step is visible');
  assertHtmlIncludes(html, 'succeeded', 'successful plan steps are visible');
  assertHtmlIncludes(html, 'Generated files', 'initialized workspace files are visible');
  assertHtmlIncludes(html, 'Preview summary', 'preview assertion summary is visible');
  assertHtmlIncludes(html, 'Activity', 'activity log is visible');
  assertHtmlIncludes(
    html,
    'Saved generated package as a pending package version.',
    'pending package save event is visible',
  );
}

export async function runAppWriterSmoke(options: AppWriterSmokeOptions): Promise<void> {
  const prompts = selectSmokePrompts(options.promptIds);

  for (const prompt of prompts) {
    const runUrl = await submitPrompt({ options, prompt });
    console.log(`submitted ${prompt.id}: ${runUrl}`);
    const html = await pollRun({ options, runUrl });
    assertSmokeRunHtml(html);
    console.log(`passed ${prompt.id}`);
  }
}

async function submitPrompt(input: {
  options: AppWriterSmokeOptions;
  prompt: AppWriterSmokePrompt;
}): Promise<string> {
  const form = new FormData();
  form.set('promptText', input.prompt.promptText);
  form.set(
    'requestedAppId',
    `${input.options.requestedAppIdPrefix}-${sanitizeAppIdSegment(input.prompt.id)}`,
  );

  const response = await fetch(`${input.options.origin}/admin/app-writer`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      origin: input.options.origin,
    },
    body: form,
  });
  const location = response.headers.get('location');

  if (response.status !== 303 || location === null) {
    throw new Error(
      `App writer smoke submit failed for ${input.prompt.id}: ${response.status} ${await response.text()}`,
    );
  }

  return new URL(location, input.options.origin).toString();
}

async function pollRun(input: { options: AppWriterSmokeOptions; runUrl: string }): Promise<string> {
  const startedAt = Date.now();
  let lastHtml = '';

  while (Date.now() - startedAt <= input.options.timeoutMs) {
    const response = await fetch(input.runUrl);

    if (!response.ok) {
      throw new Error(`App writer smoke poll failed: ${response.status} ${await response.text()}`);
    }

    lastHtml = await response.text();
    const normalized = normalizeHtml(lastHtml);

    if (normalized.includes('status: failed') || normalized.includes('<h2>failed</h2>')) {
      throw new Error(`App writer smoke run failed: ${summarizeHtml(lastHtml)}`);
    }

    if (
      normalized.includes('status: saved pending version') ||
      normalized.includes('<h2>saved pending version</h2>')
    ) {
      return lastHtml;
    }

    await sleep(input.options.pollMs);
  }

  throw new Error(`App writer smoke timed out. Last run page: ${summarizeHtml(lastHtml)}`);
}

function readPromptIds(values: ReadonlyMap<string, string[]>): string[] {
  const explicitIds = values.get('prompt-id') ?? [];
  const productionSet = values.has('production-set');

  if (productionSet && explicitIds.length > 0) {
    throw new Error('Use either --production-set or --prompt-id, not both.');
  }

  if (productionSet) {
    return [...PRODUCTION_SMOKE_PROMPT_IDS];
  }

  if (explicitIds.length === 0) {
    return ['phonics-flashcards-progress-report'];
  }

  return explicitIds.flatMap((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== ''),
  );
}

function readSingle(values: ReadonlyMap<string, string[]>, key: string): string | null {
  const entries = values.get(key) ?? [];

  if (entries.length === 0) {
    return null;
  }

  if (entries.length > 1) {
    throw new Error(`Argument --${key} may only be provided once.`);
  }

  return entries[0] ?? null;
}

function readPositiveInteger(values: ReadonlyMap<string, string[]>, key: string): number | null {
  const raw = readSingle(values, key);

  if (raw === null) {
    return null;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Argument --${key} must be a positive integer.`);
  }

  return parsed;
}

function assertHtmlIncludes(html: string, needle: string, reason: string): void {
  if (!normalizeHtml(html).includes(normalizeHtml(needle))) {
    throw new Error(`Smoke assertion failed: ${reason}. Missing "${needle}".`);
  }
}

function normalizeHtml(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim().toLowerCase();
}

function summarizeHtml(html: string): string {
  return normalizeHtml(html).slice(0, 800);
}

function sanitizeAppIdSegment(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

if (import.meta.main) {
  await runAppWriterSmoke(parseAppWriterSmokeArgs(Deno.args));
}
