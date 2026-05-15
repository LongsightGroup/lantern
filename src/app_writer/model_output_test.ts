import { assertEquals, assertThrows } from '@std/assert';
import { parseAppPackageGenerationResult } from './model_output.ts';

Deno.test('app writer model output parses bounded progress updates', () => {
  const result = parseAppPackageGenerationResult({
    ...buildModelOutput(),
    progressUpdates: [
      {
        stage: 'planning_app',
        message: '  Planning   a flashcard activity with a simple instructor report. ',
      },
    ],
  });

  assertEquals(result.progressUpdates, [
    {
      stage: 'planning_app',
      message: 'Planning a flashcard activity with a simple instructor report.',
    },
  ]);
});

Deno.test('app writer model output rejects unsafe progress implementation details', () => {
  assertThrows(
    () =>
      parseAppPackageGenerationResult({
        ...buildModelOutput(),
        progressUpdates: [
          {
            stage: 'building_package',
            message: 'Writing Cloudflare Worker code with a secret token.',
          },
        ],
      }),
    Error,
    'unsafe implementation detail',
  );
});

function buildModelOutput(): Record<string, unknown> {
  return {
    normalizedRequest: {
      learningGoal: 'Practice phonics patterns.',
      audience: 'Grade 1',
      contentSummary: 'One hundred phonics words.',
      requestedActivity: 'flashcards',
      constraints: [],
      missingInformation: [],
      safeToGenerate: true,
    },
    appPlan: {
      appId: 'phonics-flashcards',
      title: 'Phonics Flashcards',
      description: 'A small flashcard app for phonics practice.',
      learningGoal: 'Practice phonics patterns.',
      audience: 'Grade 1',
      activityType: 'flashcards',
      learnerFlow: ['Read a card.', 'Choose an answer.', 'Review progress.'],
      contentModel: {
        wordCount: 100,
      },
      capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
      grading: {
        mode: 'completion',
        maxScore: 100,
        scoringSummary: 'Completion credit after the learner reviews the cards.',
      },
      attemptEvents: [
        {
          when: 'after each card',
          eventType: 'progress',
          questionIdPattern: 'word-*',
        },
      ],
      previewTests: ['renders the title'],
      accessibilityNotes: ['Use buttons for choices.'],
      riskNotes: [],
    },
    selectedStarterId: 'simple-activity',
    files: [
      {
        path: 'manifest.json',
        contents: '{}',
      },
    ],
    progressUpdates: [
      {
        stage: 'planning_app',
        message: 'Planning a flashcard activity.',
      },
    ],
    notes: ['Generated for testing.'],
  };
}
