import { assertEquals, assertRejects } from '@std/assert';
import { createCloudflareAppWriterAgentWorkspaceHarness } from './agent_workspace_harness.ts';
import { AppWriterWorkspaceHarnessError } from './workspace_runner.ts';
import type { AppWriterAgentNamespace } from './agent_session.ts';

Deno.test('Agent workspace harness parses model metadata from authoring responses', async () => {
  const harness = createCloudflareAppWriterAgentWorkspaceHarness(
    buildNamespace(
      Response.json({
        files: [{ path: 'manifest.json', contents: '{}\n', role: 'package' }],
        progressUpdates: [
          {
            stage: 'building_package',
            message: 'Edited workspace.',
          },
        ],
        notes: ['done'],
        modelRequestMetadata: [
          {
            provider: 'cloudflare',
            model: '@cf/test/model',
            requestId: null,
            durationMs: 50,
            responseCharacters: 1000,
            stage: 'author',
            attempt: 1,
            outcome: 'succeeded',
            errorCode: null,
          },
        ],
        validationFindings: [],
      }),
    ),
  );
  const result = await harness.author({
    generationInput: minimalGenerationInput(),
    planning: minimalPlanningResult(),
    workspace: {
      generationId: 'generation-1',
      selectedStarterId: 'simple-activity',
      files: [],
      generationPlan: [],
      validationFindings: [],
      repairAttemptCount: 0,
      updatedAt: '2026-05-16T12:00:00.000Z',
    },
  });

  assertEquals(result.modelRequestMetadata?.[0]?.stage, 'author');
  assertEquals(result.modelRequestMetadata?.[0]?.attempt, 1);
});

Deno.test('Agent workspace harness maps structured Agent errors to stable harness errors', async () => {
  const harness = createCloudflareAppWriterAgentWorkspaceHarness(
    buildNamespace(
      Response.json(
        {
          error: {
            code: 'code_execution_failed',
            message: 'Workspace edit code failed.',
            notes: ['Harness failure 1: code_execution_failed'],
            modelRequestMetadata: [
              {
                provider: 'cloudflare',
                model: '@cf/test/model',
                requestId: null,
                durationMs: 50,
                responseCharacters: 1200,
                stage: 'repair',
                attempt: 2,
                outcome: 'failed',
                errorCode: 'code_execution_failed',
              },
            ],
          },
        },
        { status: 500 },
      ),
    ),
  );

  const error = await assertRejects(
    () =>
      harness.repair({
        generationInput: minimalGenerationInput(),
        previousResult: {
          ...minimalPlanningResult(),
          files: [],
          progressUpdates: [],
          notes: [],
          validationFindings: [],
        },
        validationFindings: [],
        repairAttempt: 1,
        workspace: {
          generationId: 'generation-1',
          selectedStarterId: 'simple-activity',
          files: [],
          generationPlan: [],
          validationFindings: [],
          repairAttemptCount: 0,
          updatedAt: '2026-05-16T12:00:00.000Z',
        },
      }),
    AppWriterWorkspaceHarnessError,
  );

  assertEquals(error.code, 'code_execution_failed');
  assertEquals(error.modelRequestMetadata[0]?.stage, 'repair');
  assertEquals(error.notes[0], 'Harness failure 1: code_execution_failed');
});

function buildNamespace(response: Response): AppWriterAgentNamespace {
  return {
    idFromName(name) {
      return name;
    },
    get(_id) {
      return {
        fetch(_request) {
          return Promise.resolve(response.clone());
        },
      };
    },
  };
}

function minimalGenerationInput() {
  return {
    generationId: 'generation-1',
    ownerId: 'admin',
    promptText: 'Create a flashcard app.',
    requestedAppId: 'flashcards',
    selectedStarterId: 'simple-activity' as const,
    selectedContext: {},
    authoringMode: 'typescript' as const,
    createdAt: '2026-05-16T12:00:00.000Z',
  };
}

function minimalPlanningResult() {
  return {
    normalizedRequest: {
      learningGoal: 'Practice vocabulary.',
      audience: 'Learners',
      contentSummary: 'Cards.',
      requestedActivity: 'flashcards',
      constraints: [],
      missingInformation: [],
      safeToGenerate: true,
    },
    appPlan: {
      appId: 'flashcards',
      title: 'Flashcards',
      description: 'A flashcard app.',
      learningGoal: 'Practice vocabulary.',
      audience: 'Learners',
      activityType: 'flashcards' as const,
      learnerFlow: ['Open app.', 'Review cards.'],
      contentModel: {},
      capabilities: ['read_activity_content' as const],
      grading: {
        mode: 'completion' as const,
        maxScore: 100,
        scoringSummary: 'Completion.',
      },
      attemptEvents: [],
      previewTests: ['renders title'],
      accessibilityNotes: [],
      riskNotes: [],
    },
    selectedStarterId: 'simple-activity' as const,
    progressUpdates: [],
    notes: [],
  };
}
