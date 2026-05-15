import { assertEquals, assertRejects } from '@std/assert';
import {
  APP_PACKAGE_GENERATOR_UNAVAILABLE_MESSAGE,
  createFakeAppPackageGenerator,
  createFakeRepairingAppPackageGenerator,
  createUnavailableAppPackageGenerator,
} from './package_generator.ts';
import type { AppPackageGenerationResult } from './types.ts';

Deno.test('fake app package generator returns deterministic cloned results', async () => {
  const result = buildGenerationResult();
  const generator = createFakeAppPackageGenerator(result);

  const first = await generator.generate({
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Make a vocabulary game.',
    requestedAppId: null,
    selectedStarterId: 'simple-activity',
    selectedContext: {},
    authoringMode: 'javascript',
    createdAt: '2026-05-14T12:00:00.000Z',
  });
  first.notes.push('mutated');

  const second = await generator.generate({
    generationId: 'generation-2',
    ownerId: 'instructor-1',
    promptText: 'Make a vocabulary game.',
    requestedAppId: null,
    selectedStarterId: 'simple-activity',
    selectedContext: {},
    authoringMode: 'javascript',
    createdAt: '2026-05-14T12:05:00.000Z',
  });

  assertEquals(second.notes, ['Generated from fake app package generator.']);
  assertEquals(second.files[0]?.path, 'manifest.json');
});

Deno.test('fake repairing app package generator returns queued repair results', async () => {
  const generator = createFakeRepairingAppPackageGenerator(buildGenerationResult(), [
    buildGenerationResult({
      notes: ['Repair result.'],
    }),
  ]);

  const initial = await generator.generate({
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Make a vocabulary game.',
    requestedAppId: null,
    selectedStarterId: 'simple-activity',
    selectedContext: {},
    authoringMode: 'javascript',
    createdAt: '2026-05-14T12:00:00.000Z',
  });
  const repaired = await generator.repair?.({
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Make a vocabulary game.',
    requestedAppId: null,
    selectedStarterId: 'simple-activity',
    selectedContext: {},
    authoringMode: 'javascript',
    createdAt: '2026-05-14T12:00:00.000Z',
    repairAttempt: 1,
    previousResult: initial,
    validationFindings: [],
  });

  assertEquals(repaired?.notes, ['Repair result.']);
});

Deno.test('unavailable app package generator fails clearly', async () => {
  const generator = createUnavailableAppPackageGenerator();

  await assertRejects(
    () =>
      generator.generate({
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Make a vocabulary game.',
        requestedAppId: null,
        selectedStarterId: 'simple-activity',
        selectedContext: {},
        authoringMode: 'javascript',
        createdAt: '2026-05-14T12:00:00.000Z',
      }),
    Error,
    APP_PACKAGE_GENERATOR_UNAVAILABLE_MESSAGE,
  );
});

function buildGenerationResult(
  overrides: Partial<AppPackageGenerationResult> = {},
): AppPackageGenerationResult {
  return {
    normalizedRequest: {
      learningGoal: 'Practice vocabulary recognition.',
      audience: 'Grade 4',
      contentSummary: 'Ten vocabulary words.',
      requestedActivity: 'matching game',
      constraints: [],
      missingInformation: [],
      safeToGenerate: true,
    },
    appPlan: {
      appId: 'vocabulary-match',
      title: 'Vocabulary Match',
      description: 'A small matching activity for vocabulary practice.',
      learningGoal: 'Practice vocabulary recognition.',
      audience: 'Grade 4',
      activityType: 'matching',
      learnerFlow: ['Read the prompt.', 'Choose the matching word.', 'Complete all cards.'],
      contentModel: {
        itemCount: 10,
      },
      capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
      grading: {
        mode: 'completion',
        maxScore: 100,
        scoringSummary: 'Completion credit after all cards are answered.',
      },
      attemptEvents: [
        {
          when: 'after each answer',
          eventType: 'answer',
          questionIdPattern: 'card-*',
        },
      ],
      previewTests: ['renders the title'],
      accessibilityNotes: ['Use buttons for answer choices.'],
      riskNotes: [],
    },
    selectedStarterId: 'simple-activity',
    files: [
      {
        path: 'manifest.json',
        contents: '{}\n',
      },
    ],
    progressUpdates: [
      {
        stage: 'planning_app',
        message: 'Planning a vocabulary matching activity.',
      },
    ],
    notes: ['Generated from fake app package generator.'],
    validationFindings: [],
    ...overrides,
  };
}
