import type { AppWriterStarterId } from './types.ts';

export interface AppWriterPromptContextExcerpt {
  id: string;
  title: string;
  source: string;
  content: string;
}

interface PromptContextEntry extends AppWriterPromptContextExcerpt {
  required?: boolean;
  starterIds?: readonly AppWriterStarterId[];
  referenceAppIds?: readonly string[];
  keywords?: readonly string[];
}

interface PromptContextScoreInput {
  promptText: string;
  starterId: AppWriterStarterId;
  referenceAppIds: ReadonlySet<string>;
}

const MAX_PROMPT_CONTEXT_EXCERPTS = 7;

export function selectPromptContextExcerpts(input: {
  promptText: string;
  starterId: AppWriterStarterId;
  referenceAppIds: readonly string[];
}): AppWriterPromptContextExcerpt[] {
  const scoreInput: PromptContextScoreInput = {
    promptText: input.promptText.toLowerCase(),
    starterId: input.starterId,
    referenceAppIds: new Set(input.referenceAppIds),
  };

  return PROMPT_CONTEXT_BANK.map((entry, index) => ({
    entry,
    index,
    score: scorePromptContextEntry(entry, scoreInput),
  }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, MAX_PROMPT_CONTEXT_EXCERPTS)
    .map(({ entry }) => stripPromptContextMetadata(entry));
}

function scorePromptContextEntry(
  entry: PromptContextEntry,
  input: PromptContextScoreInput,
): number {
  let score = entry.required === true ? 1_000 : 0;

  if (entry.starterIds?.includes(input.starterId) === true) {
    score += 120;
  }

  if (
    entry.referenceAppIds?.some((referenceAppId) => input.referenceAppIds.has(referenceAppId)) ===
    true
  ) {
    score += 90;
  }

  for (const keyword of entry.keywords ?? []) {
    if (input.promptText.includes(keyword)) {
      score += 20;
    }
  }

  return score;
}

function stripPromptContextMetadata(entry: PromptContextEntry): AppWriterPromptContextExcerpt {
  return {
    id: entry.id,
    title: entry.title,
    source: entry.source,
    content: entry.content,
  };
}

const PROMPT_CONTEXT_BANK: readonly PromptContextEntry[] = [
  {
    id: 'package-contract',
    title: 'Lantern app package contract',
    source: 'APP_PACKAGE_SPEC.md#Package Layout',
    required: true,
    content:
      'Generate a reviewed Lantern app package, not a Cloudflare Worker, LMS tool, or backend service. Published packages contain manifest.json, dist/index.html, dist/app.js, content/activity.json, preview/fixtures.json, and preview/tests.json. In TypeScript authoring mode, return source/app.ts and source/content_model.ts; Lantern compiles source/app.ts into dist/app.js.',
  },
  {
    id: 'runtime-boundary',
    title: 'Runtime and security boundary',
    source: 'AUTHORING_FOR_LLMS.md#Hard Rules',
    required: true,
    content:
      'Use only browser code. Do not add backend code, package imports, external scripts, arbitrary fetch calls, LMS API calls, direct grade writes, Cloudflare bindings, D1, R2, Durable Objects, localStorage, sessionStorage, or a standalone fallback runtime path. Lantern owns launch, storage, grading, audit, and deployment.',
  },
  {
    id: 'gateway-sdk-surface',
    title: 'GatewayApp SDK surface',
    source: 'sdk/app-sdk.ts#GatewayAppClient',
    required: true,
    content:
      'Use window.GatewayApp as the only runtime API. Available methods are getLaunchContext(), getActivityContent<T>(), readLocalState<T>(), writeLocalState<T>(value), emitAttemptEvent(event), submitEvidenceArtifact(input), submitScoreProposal(input), runBrowserGrader(), and finalizeAttempt(input). Manifest capabilities must be the minimum exact capability strings that match SDK calls. The emitAttemptEvent() method requires manifest capability submit_attempt_event; never write emit_attempt_event.',
  },
  {
    id: 'runtime-source-authoring',
    title: 'Browser runtime source',
    source: 'AUTHORING_FOR_LLMS.md#Required Output',
    required: true,
    content:
      'Follow the requested authoringMode. In javascript mode, write plain browser JavaScript in dist/app.js. In typescript mode, write source/app.ts plus source/content_model.ts and do not hand-write dist/app.js. Do not use imports, external packages, any, eval, Function, or module exports. Keep content data in content/activity.json with stable IDs for learner-facing items.',
  },
  {
    id: 'state-progress-reporting',
    title: 'Student state and instructor reporting',
    source: 'AUTHORING_FOR_LLMS.md#Best Pattern',
    keywords: [
      'analytics',
      'dashboard',
      'progress',
      'report',
      'reports',
      'resume',
      'save',
      'state',
      'student',
      'track',
      'usage',
    ],
    content:
      'For per-student usage or progress, do not invent a database or browser storage. Use readLocalState() and writeLocalState() for resumable per-attempt UI state. Use emitAttemptEvent() for durable reportable facts: answer events with stable questionId values, progress events with stable checkpoint names and numeric values, and complete events. Attempt events use camelCase fields such as type, questionId, answer, checkpoint, value, and timestamp. Lantern aggregates events and finalized attempts for instructor reports.',
  },
  {
    id: 'simple-activity-starter',
    title: 'simple-activity starter pattern',
    source: 'examples/starters/simple-activity',
    starterIds: ['simple-activity'],
    referenceAppIds: ['examples/starters/simple-activity'],
    content:
      'Use the simple-activity shape for flashcards, matching, sorting, simulations, games, quizzes, and practice tools. Put lesson data in content/activity.json. Render accessible controls from dist/index.html and dist/app.js. Include preview fixtures with launch, attempt_id, and local_state, plus preview tests that assert stable data-test selectors.',
  },
  {
    id: 'browser-autograder-starter',
    title: 'browser-autograder starter pattern',
    source: 'AUTHORING_FOR_LLMS.md#Browser Autograder Files',
    starterIds: ['browser-autograder'],
    referenceAppIds: ['template', 'web-checkup', 'typescript-ladder-game'],
    keywords: ['autograder', 'auto-grader', 'evidence', 'grader', 'jasmine', 'spec'],
    content:
      'Use browser-autograder only for reviewed HTML, CSS, or JavaScript checks. Include grading/specs/checks.spec.js or listed spec files, evidence/example-output.json, preview fixtures, and preview tests. The package does not run server code; Lantern runs the reviewed grader specs through its own browser grader path.',
  },
  {
    id: 'quick-study-reference',
    title: 'quick-study reference',
    source: 'examples/apps/quick-study',
    referenceAppIds: ['quick-study'],
    keywords: ['flashcard', 'flash card', 'retrieval', 'spaced', 'study'],
    content:
      'For flashcards and retrieval practice, follow quick-study: content/activity.json holds the deck data, the app renders one focused learner task at a time, local state tracks the current card/session state, and answer/progress events use stable IDs so Lantern can summarize practice activity.',
  },
  {
    id: 'chapter-4-asteroids-reference',
    title: 'chapter-4-asteroids reference',
    source: 'examples/apps/chapter-4-asteroids',
    referenceAppIds: ['chapter-4-asteroids'],
    keywords: ['arcade', 'game', 'matching', 'shoot', 'target'],
    content:
      'For game-like activities, follow chapter-4-asteroids: keep game rules small, store vocabulary/targets in content/activity.json, emit answer events for each meaningful choice, emit progress events for score or level checkpoints, and finalize only after the reviewed completion condition is met.',
  },
  {
    id: 'web-checkup-reference',
    title: 'web-checkup reference',
    source: 'examples/apps/web-checkup',
    referenceAppIds: ['web-checkup'],
    keywords: ['css', 'html', 'javascript', 'web page', 'webpage'],
    content:
      'For web repair/checking tasks, follow web-checkup: learner instructions live in content/activity.json, reviewed browser specs check observable page behavior, evidence/example-output.json documents the expected structured evidence, and the app submits evidence only through GatewayApp.',
  },
];
