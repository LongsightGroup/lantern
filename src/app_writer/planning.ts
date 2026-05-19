import type { Capability } from '../../sdk/app-sdk.ts';
import type {
  AppGenerationActivityType,
  AppGenerationGradingMode,
  AppGenerationNormalizedRequest,
  AppGenerationPlan,
  AppGenerationPlanningResult,
  AppPackageGenerationInput,
  AppWriterStarterId,
} from './types.ts';
import { readAppWriterRevisionContext } from './context.ts';

interface PromptDetails {
  instruction: string;
  audience: string | null;
  contentSummary: string | null;
  gradingMode: AppGenerationGradingMode | null;
}

export function buildLanternOwnedAppGenerationPlanningResult(
  input: AppPackageGenerationInput,
): AppGenerationPlanningResult {
  const prompt = parsePromptDetails(input.promptText);
  const revision = readAppWriterRevisionContext(input.selectedContext);
  const activityType = inferActivityType(prompt.instruction);
  const title = revision === null
    ? inferTitle({
      promptText: prompt.instruction,
      requestedAppId: input.requestedAppId,
      starterId: input.selectedStarterId,
      activityType,
    })
    : revision.sourceTitle;
  const appId = revision === null
    ? normalizeAppId(input.requestedAppId ?? title)
    : revision.sourceAppId;
  const gradingMode = revision === null
    ? inferGradingMode({
      starterId: input.selectedStarterId,
      requestedMode: prompt.gradingMode,
    })
    : revision.sourceGradingMode;
  const capabilities = revision === null
    ? selectCapabilities({
      starterId: input.selectedStarterId,
      gradingMode,
    })
    : revision.sourceCapabilities;
  const learningGoal = inferLearningGoal(prompt.instruction, activityType);
  const audience = prompt.audience ?? 'Learners';
  const contentSummary = prompt.contentSummary ?? summarizePromptContent(prompt.instruction);
  const normalizedRequest: AppGenerationNormalizedRequest = {
    learningGoal,
    audience,
    contentSummary,
    requestedActivity: describeActivity(activityType),
    constraints: [
      'Use the Lantern GatewayApp runtime API only.',
      'Keep generated files inside the selected Lantern starter workspace.',
      'Use GatewayApp local state for resumable learner progress when useful.',
      'Emit GatewayApp attempt events for learner actions that should appear in reports.',
      'Do not use localStorage, sessionStorage, external network calls, LMS APIs, or backend code.',
      ...(revision === null ? [] : [
        `Preserve manifest app_id ${revision.sourceAppId}.`,
        `Save this revision as manifest version ${revision.targetVersion}.`,
      ]),
    ],
    missingInformation: [],
    safeToGenerate: true,
  };
  const appPlan: AppGenerationPlan = {
    appId,
    title,
    description: revision?.sourceDescription ?? buildDescription(title, audience, activityType),
    learningGoal,
    audience,
    activityType,
    learnerFlow: buildLearnerFlow(activityType),
    contentModel: {
      source: 'instructor_prompt',
      summary: contentSummary,
      supportsLearnerProgress: capabilities.includes('write_local_state'),
      supportsInstructorReporting: capabilities.includes('submit_attempt_event'),
    },
    capabilities,
    grading: {
      mode: gradingMode,
      maxScore: revision?.sourceMaxScore ?? 100,
      scoringSummary: buildScoringSummary(gradingMode),
    },
    attemptEvents: buildAttemptEvents(activityType, capabilities),
    previewTests: [
      'renders the planned app title',
      'loads instructor-provided activity content',
      'exposes a complete learner path',
    ],
    accessibilityNotes: [
      'Use semantic headings and buttons.',
      'Keep keyboard interaction available for every learner action.',
      'Avoid color-only feedback.',
    ],
    riskNotes: [
      'Generated app code must stay inside the browser package contract.',
      'Learner progress and reports must use Lantern gateway capabilities, not private storage.',
      ...(revision === null ? [] : [
        `This is a revision of ${revision.sourceAppId}@${revision.sourceVersion}; do not change app_id.`,
        `The manifest version must be ${revision.targetVersion}.`,
      ]),
    ],
  };

  return {
    normalizedRequest,
    appPlan,
    selectedStarterId: input.selectedStarterId,
    progressUpdates: [
      {
        stage: 'planning_app',
        message: `Prepared Lantern-owned plan for ${title}.`,
      },
    ],
    notes: [
      revision === null
        ? 'Lantern created the app plan deterministically from the initialized request and selected starter.'
        : `Lantern created the revision plan from ${revision.sourceAppId}@${revision.sourceVersion} to ${revision.targetVersion}.`,
    ],
  };
}

function parsePromptDetails(promptText: string): PromptDetails {
  const marker = '\n\nGeneration request details:\n';
  const markerIndex = promptText.indexOf(marker);
  const instruction = markerIndex === -1
    ? promptText.trim()
    : promptText.slice(0, markerIndex).trim();
  const detailsText = markerIndex === -1 ? '' : promptText.slice(markerIndex + marker.length);

  return {
    instruction,
    audience: readDetail(detailsText, 'Audience'),
    contentSummary: readDetail(detailsText, 'Content'),
    gradingMode: readGradingMode(readDetail(detailsText, 'Preferred grading')),
  };
}

function readDetail(detailsText: string, label: string): string | null {
  const match = detailsText.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'));
  const value = match?.[1]?.trim() ?? '';

  return value === '' ? null : value;
}

function readGradingMode(value: string | null): AppGenerationGradingMode | null {
  if (value === 'completion' || value === 'declarative' || value === 'browser') {
    return value;
  }

  return null;
}

function inferActivityType(promptText: string): AppGenerationActivityType {
  const prompt = promptText.toLowerCase();

  if (prompt.includes('flashcard') || prompt.includes('flash card')) {
    return 'flashcards';
  }
  if (prompt.includes('matching') || prompt.includes('match ')) {
    return 'matching';
  }
  if (prompt.includes('sorting') || prompt.includes('sort ')) {
    return 'sorting';
  }
  if (prompt.includes('simulation') || prompt.includes('simulate')) {
    return 'simulation';
  }
  if (prompt.includes('game')) {
    return 'game';
  }
  if (prompt.includes('quiz')) {
    return 'quiz';
  }

  return 'practice';
}

function inferTitle(input: {
  promptText: string;
  requestedAppId: string | null;
  starterId: AppWriterStarterId;
  activityType: AppGenerationActivityType;
}): string {
  if (input.requestedAppId !== null && input.requestedAppId.trim() !== '') {
    return titleFromWords(input.requestedAppId.split(/[-_\s]+/));
  }

  const prompt = input.promptText.toLowerCase();

  if (input.starterId === 'browser-autograder') {
    return prompt.includes('web') ? 'Web Check' : 'Browser Autograder';
  }
  if (prompt.includes('phonics') && input.activityType === 'flashcards') {
    return 'Phonics Flashcards';
  }
  if (prompt.includes('phonics') && input.activityType === 'matching') {
    return 'Phonics Match';
  }
  if (prompt.includes('fraction')) {
    return 'Fractions Practice';
  }

  return titleFromWords(describeActivity(input.activityType).split(/\s+/));
}

function titleFromWords(words: string[]): string {
  const title = words
    .map((word) => word.trim())
    .filter((word) => word !== '')
    .slice(0, 6)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ');

  return title === '' ? 'Learning Activity' : title;
}

function normalizeAppId(source: string): string {
  const normalized = source
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 64)
    .replaceAll(/-+$/g, '');

  if (normalized.length >= 3) {
    return normalized;
  }

  return `${normalized === '' ? 'learning' : normalized}-app`;
}

function inferGradingMode(input: {
  starterId: AppWriterStarterId;
  requestedMode: AppGenerationGradingMode | null;
}): AppGenerationGradingMode {
  if (input.starterId === 'browser-autograder') {
    return 'browser';
  }

  return input.requestedMode === 'declarative' ? 'declarative' : 'completion';
}

function selectCapabilities(input: {
  starterId: AppWriterStarterId;
  gradingMode: AppGenerationGradingMode;
}): Capability[] {
  if (input.starterId === 'browser-autograder') {
    return [
      'read_launch_context',
      'read_activity_content',
      'submit_evidence_artifact',
      'finalize_attempt',
    ];
  }

  return [
    'read_launch_context',
    'read_activity_content',
    'read_local_state',
    'write_local_state',
    'submit_attempt_event',
    'finalize_attempt',
  ];
}

function inferLearningGoal(promptText: string, activityType: AppGenerationActivityType): string {
  const normalized = promptText.replaceAll(/\s+/g, ' ').trim();

  if (normalized.toLowerCase().includes('phonics')) {
    return 'Practice phonics patterns through repeated learner interaction.';
  }
  if (normalized.toLowerCase().includes('fraction')) {
    return 'Practice fraction concepts with immediate feedback.';
  }
  if (normalized.length > 0) {
    return `Support the instructor-requested ${describeActivity(activityType).toLowerCase()}.`;
  }

  return 'Support the instructor-requested learning activity.';
}

function summarizePromptContent(promptText: string): string {
  const normalized = promptText.replaceAll(/\s+/g, ' ').trim();

  if (normalized === '') {
    return 'Instructor-provided learning content.';
  }

  return normalized.length <= 240 ? normalized : `${normalized.slice(0, 237).trimEnd()}...`;
}

function describeActivity(activityType: AppGenerationActivityType): string {
  switch (activityType) {
    case 'flashcards':
      return 'Flashcard Practice';
    case 'matching':
      return 'Matching Practice';
    case 'sorting':
      return 'Sorting Practice';
    case 'simulation':
      return 'Learning Simulation';
    case 'game':
      return 'Learning Game';
    case 'quiz':
      return 'Quiz Practice';
    case 'practice':
      return 'Practice Activity';
  }
}

function buildDescription(
  title: string,
  audience: string,
  activityType: AppGenerationActivityType,
): string {
  return `${title} is a ${describeActivity(activityType).toLowerCase()} for ${audience}.`;
}

function buildLearnerFlow(activityType: AppGenerationActivityType): string[] {
  return [
    `Open the ${describeActivity(activityType).toLowerCase()}.`,
    'Interact with one clear learner task at a time.',
    'Receive immediate on-screen feedback.',
    'Persist resumable progress through GatewayApp local state when available.',
    'Emit reportable attempt events and complete the attempt through GatewayApp.',
  ];
}

function buildScoringSummary(mode: AppGenerationGradingMode): string {
  switch (mode) {
    case 'browser':
      return 'Browser grader evidence determines the reviewed score.';
    case 'declarative':
      return 'Reviewed rubric scoring determines the score.';
    case 'completion':
      return 'Learners receive completion credit after finishing the activity.';
  }
}

function buildAttemptEvents(
  activityType: AppGenerationActivityType,
  capabilities: readonly Capability[],
): AppGenerationPlan['attemptEvents'] {
  if (!capabilities.includes('submit_attempt_event')) {
    return [];
  }

  return [
    {
      when: 'after each meaningful learner response',
      eventType: 'answer',
      questionIdPattern: `${activityType}-*`,
    },
    {
      when: 'when learner progress changes',
      eventType: 'progress',
      questionIdPattern: 'progress',
    },
    {
      when: 'when the learner completes the activity',
      eventType: 'complete',
      questionIdPattern: 'complete',
    },
  ];
}
