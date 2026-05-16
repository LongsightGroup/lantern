import type { AppWriterAuthoringMode, AppWriterStarterId } from './types.ts';
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

export interface AppWriterContextSelection {
  starterId: AppWriterStarterId;
  selectedContext: {
    starterId: AppWriterStarterId;
    referenceAppIds: string[];
    publicContractSources: string[];
    promptContextVersion: number;
    authoringMode: AppWriterAuthoringMode;
    recipe: AppWriterRecipe;
    promptContextExcerpts: AppWriterPromptContextExcerpt[];
    selectionReason: string;
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
    selectionReason:
      input.requestedAppId === null
        ? 'The request fits the default small activity starter.'
        : `Requested app id ${input.requestedAppId} fits the default small activity starter.`,
  });
}

function buildSelection(input: {
  promptText: string;
  authoringMode: AppWriterAuthoringMode;
  maxRepairAttempts: number | undefined;
  starterId: AppWriterStarterId;
  referenceAppIds: string[];
  selectionReason: string;
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
    },
  };
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
    prompt.includes(term),
  );
}

function mentionsGame(prompt: string): boolean {
  return ['game', 'arcade', 'asteroid', 'shoot', 'match', 'sorting', 'sort'].some((term) =>
    prompt.includes(term),
  );
}
