import type { Capability } from '../../sdk/app-sdk.ts';
import type { GradingMode, PackageVersionRecord } from '../package_review/types.ts';
import type {
  AppGenerationGradingMode,
  AppWriterAuthoringMode,
  AppWriterStarterId,
} from './types.ts';
import {
  type AppWriterPromptContextExcerpt,
  selectPromptContextExcerpts,
} from './prompt_context.ts';
import {
  APP_WRITER_PROMPT_CONTEXT_VERSION,
  APP_WRITER_PUBLIC_CONTRACT_SOURCES,
  type AppWriterRecipe,
  buildAppWriterRecipe,
} from './recipe.ts';

export interface AppWriterContextSelectionInput {
  promptText: string;
  requestedAppId: string | null;
  authoringMode?: AppWriterAuthoringMode;
  maxRepairAttempts?: number;
}

export interface AppWriterRevisionContext {
  sourcePackageVersionId: number;
  sourceAppId: string;
  sourceVersion: string;
  sourceTitle: string;
  sourceDescription: string | null;
  sourceCapabilities: Capability[];
  sourceGradingMode: AppGenerationGradingMode;
  sourceMaxScore: number;
  targetVersion: string;
}

export interface AppWriterSelectedContext {
  starterId: AppWriterStarterId;
  referenceAppIds: string[];
  publicContractSources: string[];
  promptContextVersion: number;
  authoringMode: AppWriterAuthoringMode;
  recipe: AppWriterRecipe;
  promptContextExcerpts: AppWriterPromptContextExcerpt[];
  selectionReason: string;
  revision?: AppWriterRevisionContext;
}

export interface AppWriterContextSelection {
  starterId: AppWriterStarterId;
  selectedContext: AppWriterSelectedContext;
}

export function emptyAppWriterSelectedContext(
  starterId: AppWriterStarterId = 'simple-activity',
): AppWriterSelectedContext {
  return {
    starterId,
    referenceAppIds: [],
    publicContractSources: [...APP_WRITER_PUBLIC_CONTRACT_SOURCES],
    promptContextVersion: APP_WRITER_PROMPT_CONTEXT_VERSION,
    authoringMode: 'javascript',
    recipe: buildAppWriterRecipe({
      authoringMode: 'javascript',
      maxRepairAttempts: undefined,
    }),
    promptContextExcerpts: [],
    selectionReason: '',
  };
}

export function readAppWriterSelectedContext(
  value: unknown,
  fallbackStarterId: AppWriterStarterId | null,
): AppWriterSelectedContext {
  if (typeof value !== 'object' || value === null) {
    return emptyAppWriterSelectedContext(fallbackStarterId ?? 'simple-activity');
  }

  const record = value as Record<string, unknown>;
  const starterId = readStarterId(record.starterId, fallbackStarterId);
  const referenceAppIds = readStringArray(record.referenceAppIds);
  const publicContractSources = readStringArray(record.publicContractSources);
  const promptContextExcerpts = readPromptContextExcerpts(record.promptContextExcerpts);
  const revision = readRevisionContext(record.revision);

  return {
    starterId,
    referenceAppIds,
    publicContractSources: publicContractSources.length === 0
      ? [...APP_WRITER_PUBLIC_CONTRACT_SOURCES]
      : publicContractSources,
    promptContextVersion: typeof record.promptContextVersion === 'number'
      ? record.promptContextVersion
      : APP_WRITER_PROMPT_CONTEXT_VERSION,
    authoringMode: record.authoringMode === 'typescript' ? 'typescript' : 'javascript',
    recipe: readRecipe(record.recipe),
    promptContextExcerpts,
    selectionReason: typeof record.selectionReason === 'string' ? record.selectionReason : '',
    ...(revision === null ? {} : { revision }),
  };
}

export function selectAppWriterContext(
  input: AppWriterContextSelectionInput,
): AppWriterContextSelection {
  const prompt = input.promptText.toLowerCase();

  if (mentionsBrowserAutograder(prompt)) {
    return buildSelection({
      promptText: input.promptText,
      authoringMode: input.authoringMode ?? 'javascript',
      maxRepairAttempts: input.maxRepairAttempts,
      starterId: 'browser-autograder',
      referenceAppIds: ['template', 'web-checkup', 'typescript-ladder-game'],
      selectionReason: 'The request appears to need reviewed browser checks or evidence artifacts.',
    });
  }

  if (mentionsFlashcards(prompt)) {
    return buildSelection({
      promptText: input.promptText,
      authoringMode: input.authoringMode ?? 'javascript',
      maxRepairAttempts: input.maxRepairAttempts,
      starterId: 'simple-activity',
      referenceAppIds: ['quick-study', 'examples/starters/simple-activity'],
      selectionReason: 'The request appears to fit a retrieval-practice activity.',
    });
  }

  if (mentionsGame(prompt)) {
    return buildSelection({
      promptText: input.promptText,
      authoringMode: input.authoringMode ?? 'javascript',
      maxRepairAttempts: input.maxRepairAttempts,
      starterId: 'simple-activity',
      referenceAppIds: ['chapter-4-asteroids', 'examples/starters/simple-activity'],
      selectionReason: 'The request appears to fit a game-like browser activity.',
    });
  }

  return buildSelection({
    promptText: input.promptText,
    authoringMode: input.authoringMode ?? 'javascript',
    maxRepairAttempts: input.maxRepairAttempts,
    starterId: 'simple-activity',
    referenceAppIds: ['examples/starters/simple-activity'],
    selectionReason: input.requestedAppId === null
      ? 'The request fits the default small activity starter.'
      : `Requested app id ${input.requestedAppId} fits the default small activity starter.`,
  });
}

export function selectAppWriterRevisionContext(input: {
  promptText: string;
  sourcePackageVersion: PackageVersionRecord;
  targetVersion: string;
  authoringMode?: AppWriterAuthoringMode;
  maxRepairAttempts?: number;
}): AppWriterContextSelection {
  const starterId = selectStarterForPackageVersion(input.sourcePackageVersion);

  return buildSelection({
    promptText: input.promptText,
    authoringMode: input.authoringMode ?? 'javascript',
    maxRepairAttempts: input.maxRepairAttempts,
    starterId,
    referenceAppIds: starterId === 'browser-autograder'
      ? ['template', 'web-checkup', 'typescript-ladder-game']
      : ['examples/starters/simple-activity'],
    selectionReason:
      `Revision starts from ${input.sourcePackageVersion.appId}@${input.sourcePackageVersion.version} and targets ${input.targetVersion}.`,
    revision: {
      sourcePackageVersionId: input.sourcePackageVersion.id,
      sourceAppId: input.sourcePackageVersion.appId,
      sourceVersion: input.sourcePackageVersion.version,
      sourceTitle: input.sourcePackageVersion.title,
      sourceDescription: input.sourcePackageVersion.description,
      sourceCapabilities: [...input.sourcePackageVersion.capabilities],
      sourceGradingMode: requireSupportedRevisionGradingMode(
        input.sourcePackageVersion.grading.mode,
      ),
      sourceMaxScore: input.sourcePackageVersion.grading.maxScore ?? 100,
      targetVersion: input.targetVersion,
    },
  });
}

export function readAppWriterRevisionContext(
  context: AppWriterSelectedContext | Record<string, unknown>,
): AppWriterRevisionContext | null {
  const revision = context.revision;

  if (revision === undefined) {
    return null;
  }

  if (typeof revision !== 'object' || revision === null || Array.isArray(revision)) {
    throw new TypeError('App writer revision context must be a JSON object.');
  }

  const record = revision as Record<string, unknown>;

  return {
    sourcePackageVersionId: expectNumber(
      record.sourcePackageVersionId,
      'revision.sourcePackageVersionId',
    ),
    sourceAppId: expectString(record.sourceAppId, 'revision.sourceAppId'),
    sourceVersion: expectString(record.sourceVersion, 'revision.sourceVersion'),
    sourceTitle: expectString(record.sourceTitle, 'revision.sourceTitle'),
    sourceDescription: expectNullableString(record.sourceDescription, 'revision.sourceDescription'),
    sourceCapabilities: expectCapabilities(
      record.sourceCapabilities,
      'revision.sourceCapabilities',
    ),
    sourceGradingMode: expectRevisionGradingMode(
      record.sourceGradingMode,
      'revision.sourceGradingMode',
    ),
    sourceMaxScore: expectNumber(record.sourceMaxScore, 'revision.sourceMaxScore'),
    targetVersion: expectString(record.targetVersion, 'revision.targetVersion'),
  };
}

function buildSelection(input: {
  promptText: string;
  authoringMode: AppWriterAuthoringMode;
  maxRepairAttempts: number | undefined;
  starterId: AppWriterStarterId;
  referenceAppIds: string[];
  selectionReason: string;
  revision?: AppWriterRevisionContext;
}): AppWriterContextSelection {
  const promptContextExcerpts = selectPromptContextExcerpts({
    promptText: input.promptText,
    starterId: input.starterId,
    referenceAppIds: input.referenceAppIds,
  });

  return {
    starterId: input.starterId,
    selectedContext: {
      starterId: input.starterId,
      referenceAppIds: input.referenceAppIds,
      publicContractSources: [...APP_WRITER_PUBLIC_CONTRACT_SOURCES],
      promptContextVersion: APP_WRITER_PROMPT_CONTEXT_VERSION,
      authoringMode: input.authoringMode,
      recipe: buildAppWriterRecipe({
        authoringMode: input.authoringMode,
        maxRepairAttempts: input.maxRepairAttempts,
      }),
      promptContextExcerpts,
      selectionReason: input.selectionReason,
      ...(input.revision === undefined ? {} : { revision: input.revision }),
    },
  };
}

function selectStarterForPackageVersion(packageVersion: PackageVersionRecord): AppWriterStarterId {
  return packageVersion.grading.mode === 'browser' ||
      packageVersion.capabilities.includes('submit_evidence_artifact')
    ? 'browser-autograder'
    : 'simple-activity';
}

function requireSupportedRevisionGradingMode(mode: GradingMode): AppGenerationGradingMode {
  if (mode === 'completion' || mode === 'declarative' || mode === 'browser') {
    return mode;
  }

  throw new Error(
    `App Writer revisions require completion, declarative, or browser grading. ${mode} is not supported for AI revision runs.`,
  );
}

function expectRevisionGradingMode(value: unknown, fieldName: string): AppGenerationGradingMode {
  if (value === 'completion' || value === 'declarative' || value === 'browser') {
    return value;
  }

  throw new TypeError(`${fieldName} must be completion, declarative, or browser.`);
}

function expectCapabilities(value: unknown, fieldName: string): Capability[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => expectString(item, `${fieldName}[${index}]`) as Capability);
}

function expectNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${fieldName} must be a number.`);
  }

  return value;
}

function readStarterId(
  value: unknown,
  fallbackStarterId: AppWriterStarterId | null,
): AppWriterStarterId {
  if (value === 'simple-activity' || value === 'browser-autograder') {
    return value;
  }

  return fallbackStarterId ?? 'simple-activity';
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function readPromptContextExcerpts(value: unknown): AppWriterPromptContextExcerpt[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const excerpts: AppWriterPromptContextExcerpt[] = [];

  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const id = record.id;
    const title = record.title;
    const source = record.source;
    const content = record.content;

    if (
      typeof id === 'string' &&
      typeof title === 'string' &&
      typeof source === 'string' &&
      typeof content === 'string'
    ) {
      excerpts.push({ id, title, source, content });
    }
  }

  return excerpts;
}

function readRecipe(value: unknown): AppWriterRecipe {
  if (typeof value !== 'object' || value === null) {
    return buildAppWriterRecipe({
      authoringMode: 'javascript',
      maxRepairAttempts: undefined,
    });
  }

  const record = value as Record<string, unknown>;
  const authoringMode = record.authoringMode === 'typescript' ? 'typescript' : 'javascript';

  return buildAppWriterRecipe({
    authoringMode,
    maxRepairAttempts: typeof record.maxRepairAttempts === 'number'
      ? record.maxRepairAttempts
      : undefined,
  });
}

function readRevisionContext(value: unknown): AppWriterRevisionContext | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  try {
    return readAppWriterRevisionContext({ revision: value });
  } catch {
    return null;
  }
}

function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be a string.`);
  }

  return value;
}

function expectNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  return expectString(value, fieldName);
}

function mentionsBrowserAutograder(prompt: string): boolean {
  return [
    'preferred grading: browser',
    'autograder',
    'auto-grader',
    'grade html',
    'grade css',
    'grade javascript',
    'jasmine',
    'spec',
    'evidence',
    'check webpage',
    'web page repair',
  ].some((term) => prompt.includes(term));
}

function mentionsFlashcards(prompt: string): boolean {
  return ['flashcard', 'flash card', 'study deck', 'retrieval', 'spaced'].some((term) =>
    prompt.includes(term)
  );
}

function mentionsGame(prompt: string): boolean {
  return ['game', 'arcade', 'asteroid', 'shoot', 'match', 'sorting', 'sort'].some((term) =>
    prompt.includes(term)
  );
}
